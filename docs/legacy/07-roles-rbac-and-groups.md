# Legacy Specification: Roles, RBAC, Group Management, and Federation Connection

This document captures the exact behavior of the legacy Python bot (`/home/rd/Projects/bot/tcbot-rewrite/tcbot/`) for RBAC roles, permission guards, staff promotion/demotion, ownership transfer, group listing, and federation group connection/disconnection.

---

## 1. Role Hierarchy & Vocabulary

Defined in `tcbot/database/users_roles.py` and documented in `tcbot/docs/flows/roles.md` and `tcbot/docs/flows/permissions.md`:

| Role Key (`RoleName`) | `ROLE_RANK` | `ROLE_LABEL` | Assignable via `set_role` / `add_admin` | Set Membership |
|---|---|---|---|---|
| `owner` | `4` | `Owner` | No (seed or `transfer_ownership` only) | `OWNER_ADMIN_ROLES` |
| `admin` | `3` | `Admin` | Yes, by `owner` only (`add_admin`) | `STAFF_ROLES`, `OWNER_ADMIN_ROLES` |
| `developer` | `2` | `Developer` | Yes (`VALID_ROLES`) | `STAFF_ROLES`, `VALID_ROLES` |
| `moderator` | `1` | `Moderator` | Yes (`VALID_ROLES`) | `STAFF_ROLES`, `VALID_ROLES` |

- `RoleName = Literal["owner", "admin", "developer", "moderator"]`
- `VALID_ROLES = ("developer", "moderator")` — `set_role()` rejects anything outside `VALID_ROLES`.
- `STAFF_ROLES = frozenset({"admin", "developer", "moderator"})` — roles that can be demoted (Owner is never demotable).
- `OWNER_ADMIN_ROLES = frozenset({"owner", "admin"})`
- `ROLE_ALIASES`:
  - `"admin"` -> `"admin"`
  - `"developer"`, `"dev"` -> `"developer"`
  - `"moderator"`, `"mod"` -> `"moderator"`
- `role_rank(role)` returns `0` for `None` or unknown stored values; `get_effective_role()` ignores any stored role outside `ROLE_RANK`.
- `role_label(role)` returns `""` for falsy roles, `ROLE_LABEL[role]` for known roles, or `role.capitalize()` as fallback.

### Role Caches & Freshness
- `effective_role_cache`: L1 TTL `60s`, Redis TTL `90s`, prefix `role`.
- `owner_id_cache`: L1 TTL `300s`, Redis TTL `360s`, prefix `owner`.
- Enforcement and authorization paths pass `fresh=True`, routing through `TwoLevelCache.refresh()`, which uses a generation/epoch guard so an in-flight read cannot resurrect a revoked role after a concurrent demotion or ownership transfer.
- Role writes call `effective_role_cache.invalidate(user_id)`. Ownership transfer calls `_publish_owner()`, which refreshes `owner_id_cache` and calls `effective_role_cache.clear_all()`.

---

## 2. Authorization Decorators, Guards, and Permissions Matrix

### Decorator Stack (`tcbot/modules/helper/decorators/auth.py`)
Handlers apply decorators in a fixed order:
1. `@decorators.ratelimiter(...)` (outermost)
2. Authorization guard (`owner_only`, `staff_only`, `mod_only`, `basic_mod_only`, or `permission_only`)
3. `@decorators.log_execution` (innermost)

| Decorator | Check | Behavior |
|---|---|---|
| `owner_only` | `get_owner_id(fresh=True) == uid` | Also calls `cache_effective_role(uid, "owner")` so subsequent rank checks in the same request see `"owner"`. |
| `staff_only` | `role_rank(get_effective_role(uid, fresh=True)) >= rank("admin")` (3) | Rejects below Admin. |
| `mod_only` | `role_rank(get_effective_role(uid, fresh=True)) >= rank("developer")` (2) | Rejects below Developer. |
| `basic_mod_only` | `role_rank(get_effective_role(uid, fresh=True)) >= rank("moderator")` (1) | Rejects below Moderator. |
| `permission_only(key)` | `db.users_roles.has_permission(uid, key)` | Executes SQL `actor_has_permission(user_id, permission_key)`. |

All decorators:
- Reject `identity.is_anon_admin(ctx.effective_user)` before any DB lookup (`replies.refuse_anon_admin`).
- Fail closed on DB lookup exceptions (`replies.refuse_role_lookup`), while re-raising `asyncio.CancelledError`.

### Target & Origin Guards (`tcbot/modules/helper/guards.py`)
- `required_rank(min_role)`: maps unknown tier names to `_UNKNOWN_TIER_RANK = 99` (fail-closed).
- `outranks(executor_role, target_role)`: returns `True` if `target_role` is empty/falsy; otherwise `role_rank(executor_role) > role_rank(target_role)`. Equal rank is refused.
- `can_demote_admin(executor_role, target_role)`: demoting `"admin"` requires `"owner"`; `"owner"` is never demotable.
- `banned_target_refusal(target_id, ...)`: refuses if target has an active ban or if the ban lookup fails (fail-closed).
- `require_federation_origin(msg, chat_id, chat_type, locale, allow_private=...)`:
  - Private chats allowed only if `allow_private=True`.
  - Short-circuits to `True` for `cfg.is_primary_group(chat_id)` or `cfg.is_infrastructure_chat(chat_id)`.
  - Otherwise requires `db.groups_db.is_connected(chat_id, fresh=True)` (fail-closed on DB outage).
- Callback ownership guards (`action_owner_mismatch`, `cancel_owner_mismatch`, `check_callback_executor`): when a prompt includes `:<executor_id>`, only that user may tap it; others receive an alert and the prompt remains live.

### Protected Identities (`_REFUSE_KEYS`)
Special Telegram IDs: `TELEGRAM_USER_ID = 777000`, `ANONYMOUS_BOT_ID = 1087968824` (`GroupAnonymousBot`).
- `promote` refuses: `self`, `this_bot`, `telegram`, `other_bot`, `anon_admin`, `owner`, `admin`.
- `demote`, `transfer`, `unwarn`, `resetwarns` refuse: `self`, `this_bot`, `telegram`, `other_bot`, `anon_admin`, `owner`.
- `ban`, `kick`, `mute` refuse: `self`, `this_bot`, `telegram`, `anon_admin`, `owner` (lower staff roles are demoted first via `demote_before_enforcement`).

### Seeded Permissions Matrix (`tcbot/database/schema/seed.sql`)
Permission key format constraint: `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.

| Permission Key | `owner` | `admin` | `developer` | `moderator` |
|---|---|---|---|---|
| `audit.view` | yes | yes | yes | no |
| `automation.manage` | yes | yes | no | no |
| `automation.publish` | yes | no | no | no |
| `automation.replay` | yes | no | no | no |
| `automation.view` | yes | yes | yes | no |
| `community.broadcast` | yes | yes | no | no |
| `community.cleanup` | yes | yes | no | no |
| `community.leave_all` | yes | no | no | no |
| `community.profile` | yes | no | no | no |
| `community.speedtest` | yes | no | no | no |
| `groups.manage` | yes | yes | no | no |
| `groups.remove` | yes | yes | no | no |
| `groups.view` | yes | yes | yes | yes |
| `members.view` | yes | yes | yes | yes |
| `moderation.ban` | yes | yes | yes | no |
| `moderation.collect_evidence` | yes | yes | yes | yes |
| `moderation.kick` | yes | yes | yes | yes |
| `moderation.manage_cases` | yes | yes | no | no |
| `moderation.mute` | yes | yes | yes | yes |
| `moderation.open_case` | yes | yes | yes | yes |
| `moderation.reset_warnings` | yes | yes | yes | yes |
| `moderation.review_appeals` | yes | yes | no | no |
| `moderation.sync` | yes | yes | yes | no |
| `moderation.unban` | yes | yes | yes | no |
| `moderation.unmute` | yes | yes | yes | yes |
| `moderation.unwarn` | yes | yes | yes | yes |
| `moderation.view_cases` | yes | yes | yes | no |
| `moderation.view_evidence` | yes | yes | yes | no |
| `moderation.view_history` | yes | yes | yes | yes |
| `moderation.warn` | yes | yes | yes | yes |
| `roles.demote` | yes | yes | no | no |
| `roles.promote` | yes | yes | no | no |
| `roles.review_promotion_requests` | yes | no | no | no |
| `roles.transfer_ownership` | yes | no | no | no |
| `roles.view` | yes | yes | yes | yes |
| `roles.view_promotion_requests` | yes | yes | no | no |
| `rules.manage` | yes | yes | no | no |
| `rules.view` | yes | yes | yes | yes |

---

## 3. Admin & Role Management Commands (`tcbot/modules/admins.py`)

All admin commands check `require_federation_origin(..., allow_private=True)` (except `/tcpromoterequests` and `/tcpromotelist`).

### `/tcpromote` (alias `/tcp`)
- Decorators: `THROTTLE_MODERATION`, `staff_only`, `log_execution`.
- Guards against bare role token without reply target (`admins.error.promote_needs_target`).
- Resolves target (`resolve_executor_target`) and classifies identity + loads target's role (`classify_and_load_role`).
- **Role-change routing (`is_role_change_request`)**: if target already holds a role in `STAFF_ROLES` and either no role was specified or the requested role is in `Promote.available_roles_for(executor_role)`, routes to `change_role_for_staff()` (if role given) or `role_change_prompt()` (picker). Uses `"demote"` identity refusal table for role-change so existing Admins can be moved by Owner.
- Otherwise applies `identity.refuse_message("promote", ...)` and `identity.is_proven_bot(...)` (fails open on unknown bot status so off-group promotions still work, unlike transfer).
- If role given: calls `Promote.execute(...)`.
- If no role given: renders `promote_role_btn(target_id, available, locale, admin.id)`.

### `Promote.available_roles_for` & `Promote.execute` (`promote_steps.py`)
- Grant table:
  - `owner` -> `["admin", "developer", "moderator"]`
  - `admin` -> `["developer", "moderator"]`
  - others -> `[]`
- `Promote.execute` re-reads both executor and target roles with `fresh=True` at the mutation point:
  - Refuses if target is `"owner"`.
  - Refuses if `role_rank(current_role) >= role_rank(role)`.
  - Checks `banned_target_refusal(target_id)`.
  - If `role == "admin"`:
    - `executor_role == "owner"` -> `assign_admin()` (`db.users_roles.add_admin`, best-effort `upsert_user`, log + DM).
    - `executor_role == "admin"` -> `request_admin()` (queues promotion request for Owner).
  - Else (`developer` or `moderator`, must be in `allowed`): `assign_subrole()` (`db.users_roles.set_role`, best-effort `upsert_user`, log + DM).

### `/tcsetrole` (`promote_steps.py`)
- Decorators: `THROTTLE_MODERATION`, `staff_only`, `log_execution`.
- Opens `role_change_prompt()`, showing `role_change_btn` with `available_roles_for(executor_role)` excluding `current_role`.
- `change_role_for_staff()` re-reads both roles fresh, refuses `owner` target, role-less user, same role, role outside grant table, non-owner executor not outranking target, and banned targets. Calls `db.users_roles.change_role()` (atomic single-transaction swap).

### Promotion Requests & Owner Decision (`promote_request.py`, `promote_decision.py`)
- `/tcpromoterequests` (alias `/tcreqs`): self-service request for non-staff users. Rejects `is_anon_admin` and `user.is_bot`. Checks `get_effective_role(fresh=True)` and `queues_db.get_request(user.id)` in parallel (fails closed on DB error). Calls `Promote.request_admin(...)`.
- `/tcpromotelist` (alias `/tcplist`): `staff_only`; lists up to 200 pending requests from `queues_db.all_pending()` + `pending_count()`.
- `request_admin()`: checks `banned_target_refusal`, checks existing pending request, enqueues in `promotion_requests` (partial unique index `uq_promotion_requests_pending_target`, TTL `PROMOTION_REQUEST_TTL_DAYS = 7` where `0` disables expiry; `enqueue()` runs `expire_stale_requests()` first). Sends Owner approval card via DM with `promo_decision_btn(request_id)`, falling back to `send_log` if DM fails.
- `execute_promo_decision()` (`promo_approve:<id>` / `promo_reject:<id>`):
  - Checks `is_owner(admin.id, fresh=True)` (alerts and leaves shared card intact on failure/non-owner).
  - Checks `req.get("status") == "pending"`.
  - On `promo_approve`: refuses if target is now `"owner"`; checks `banned_target_refusal`; atomically claims via `queues_db.resolve(request_id, "approved", admin.id)` **before** calling `add_admin(target_id, admin.id)`. Edits card, DMs target, and logs.
  - On `promo_reject`: atomically claims via `queues_db.resolve(request_id, "rejected", admin.id)`, edits card, DMs target, and logs.

### `/tcdemote` (alias `/tcd`) & `Demote` (`demote_actions.py`)
- Decorators: `THROTTLE_MODERATION`, `staff_only`, `log_execution`.
- Checks `can_demote_admin(executor_role, target_role)` (Admin demotion requires Owner; Owner is never demotable).
- Shows `demote_confirm_btn(target_id, locale, admin.id)`.
- `on_demote_confirm`: re-validates opener (`action_owner_mismatch`), `check_callback_executor`, fresh target role, `can_demote_admin`, and `identity.classify` before calling `Demote.execute(..., trigger=None)`.
- `Demote.execute(..., trigger=...)` removes active role, logs, and sends DM worded by `trigger`:
  - `None` -> `demote.dm.manual`
  - `"ban"`, `"kick"`, `"mute"` -> `demote.dm.auto` with `demote.dm.verb.<trigger>`
  - `"warn"` -> `demote.dm.warn`
  - `"unban"` -> `demote.dm.unban`
  - `"appeal"` -> `demote.dm.appeal`
- **Two demote gates**:
  - `demote_before_enforcement()` (used by ban, kick, mute, join enforcement): best-effort; never raises on lookup/demote failure; returns `"owner"` if target is Owner so caller skips enforcement.
  - `demote_before_unban()` (used by `/tcunban`, appeal approval): fail-closed; returns `UnbanGate.PROCEED`, `UnbanGate.DEMOTE_FAILED`, or `UnbanGate.ROLE_SURVIVED` (re-reads role fresh if `Demote.execute` returned `False`).

### `/transferowner` (alias `/tfowner`) (`transfer_owner.py`)
- Decorators: `THROTTLE_BULK`, `owner_only`, `log_execution`.
- Validates origin, extracts target, runs `identity.classify(..., "transfer")`.
- Fails closed on `identity.verify_not_bot()` (`False` or `None` both refuse).
- Fails closed on `get_active_ban(target_id)` (banned target or lookup error refuses).
- Re-checks `is_owner(current_owner.id, fresh=True)` at mutation point.
- Calls `db.users_roles.transfer_ownership(current_owner.id, target_id)` under PostgreSQL advisory lock `_OWNER_TRANSFER_LOCK_KEY = 7_313_919_265_517_001` in a single transaction: verifies current owner under lock, revokes new owner's active role, revokes old owner row, inserts new owner row + grants previous owner `admin`.
- Updates `error_reporter.set_owner(target_id)`, cancels pending promotion requests for new owner (`cancel_pending_for_user`), logs, and replies.

---

## 4. Group Listing, Connection & Disconnection

### Group Listing (`/tcgroups`, alias `/tcg`) (`tcbot/modules/groups.py`)
- Decorators: `THROTTLE_READ`, `log_execution`. Open to anyone (`context_anyone`).
- Reads `db.groups_db.active_groups()` (shared L1 30s / L2 45s cache).
- Renders `render_groups(groups, detailed=False, locale=locale)` with `tcgroups_btn(detailed=..., locale=locale)`.
- Callbacks `groups_details` and `groups_simple` (`THROTTLE_CALLBACK`) re-fetch `active_groups()` and edit the message; on DB error, keep the toggle keyboard so re-tapping retries rather than rendering "0 groups".

### Primary Group & Infrastructure Chats
- Configured infrastructure chats (`MAIN_GROUP`, `MAIN_CHANNEL`, `APPEALS`, `LOGS`, `LOGS_ERRORS`, `PROOFS`) are checked via `cfg.is_infrastructure_chat(chat_id)` and `cfg.is_primary_group(chat_id)`.
- Primary groups are always included in moderation fan-out via `with_primary_groups()` and are never added as active connected groups.
- On bot status update in a primary group, `ensure_primary_group(chat_id, title)` ensures an identity row and an inactive connection row exist.
- `/tcconnect`, `on_join_decision`, `on_verify_step`, `/tcdisconnect`, and `/rmtc` all refuse primary groups and infrastructure chats.

### Manual Connect (`/tcconnect`, alias `/tccon`) (`tcbot/modules/connect.py`)
- Decorators: `THROTTLE_FEDERATION`, `log_execution`.
- Group/supergroup only (`group`, `supergroup`; channels refused).
- Refuses infrastructure chats and `is_anon_admin(user)`.
- Gathers in parallel: `get_chat_member(chat, user)` (with `TELEGRAM_LOOKUP_TIMEOUT`), `is_connected(fresh=True)`, `get_pending()`, and `get_chat_member(chat, bot)`.
- Requires sender status in `("administrator", "owner")`.
- Refuses primary group, DB read errors (fail-closed), already connected, or already pending.
- Checks `connection.check_perms(bot_member)`: requires `can_delete_messages`, `can_restrict_members`, and `can_invite_users`.
- Calls `connection.complete_join(...)` and replies with `connected_message` or `connected_blind_message` if replay was incomplete.

### Bot-Added & Verification Wizard (`connect_added.py`, `connect_verify.py`, `connect_decision.py`)
- `on_bot_added` handles `MY_CHAT_MEMBER` updates in `group`/`supergroup`:
  - `LEFT` or `BANNED`: `is_connected(fresh=True)`, `deactivate_group`, `remove_pending`; posts `group_bot_removed_log` only if `was_connected`.
  - Demoted (`MEMBER`/`RESTRICTED` from `ADMINISTRATOR`): sends admin-rights-lost warning to mod log (except primary groups).
  - Added/promoted (`MEMBER`/`ADMINISTRATOR`):
    - Primary group -> `ensure_primary_group`.
    - Infrastructure chat -> ignore.
    - Pending row exists with `owner_id != 0`, not already connected, `ADMINISTRATOR`, and `check_perms` passes -> auto-completes via `complete_join` and edits prompt (+ `welcome_permission_note` if `can_send_welcome_messages` is `False`).
    - Otherwise if not connected and not pending -> sends 6-page verification wizard starting at step `0` and calls `add_pending(chat_id, title, owner_id, prompt.id)` (`owner_id = 0` if anonymous admin).
- Verification wizard (`VERIFY_STEPS = 6`):
  - Pages `0..5`: welcome orientation, 3 membership requirement pages, moderation scope, final confirmation.
  - `tc_verify_<step>` and `tc_join` / `tc_cancel` are strictly **group-owner only** (`membership.status == ChatMemberStatus.OWNER`); non-owners get an alert and the shared keyboard stays intact.
  - `tc_join`: checks bot perms (if missing, calls `add_pending` and edits with `perms_required_message`), checks not already connected, runs `complete_join`, appends `welcome_permission_note`.
  - `tc_cancel`: requires `pending is not None and not still_connected` (ignores stale taps), calls `remove_pending`, edits card, sends `group_connection_rejected_log`, and calls `leave_chat`.

### Replay on Connect (`connect_replay.py`)
- `complete_join()` gathers `get_chat`, `active_ban_user_ids()`, `active_mute_docs()`, `_chat_admins()`, and `add_group()` (if `add_group` fails, raises).
- Calls `remove_pending()` and spawns `harvest_admin_identities()`.
- Replays bans then mutes in rounds of `_REPLAY_ROUND = 8` via `fan_out()`, capped at `_REPLAY_CAP = 500` per list and `_REPLAY_BUDGET_S = 20.0` seconds.
- Any truncated, timed-out, or non-benign failed user IDs are queued via `db.enforcement_db.queue_connect_replay()` with `_REPLAY_QUEUE_ATTEMPTS = 3` and `0.2s * (attempt + 1)` backoff. If all attempts fail, rolls back with `deactivate_group(chat_id)` and raises.
- Returns `replay_blind: bool` (`True` if DB read failed, list truncated, budget exceeded, or any non-benign error occurred).

### Disconnect (`/tcdisconnect` / `/tcdiscon`) & Force-Remove (`/rmtc`) (`disconnecting.py`)
- `/tcdisconnect`: group-only, refuses infrastructure chats, checks `is_connected(fresh=True)` and `can_manage_group(bot, chat_id, user_id, fresh=True)` (federation staff or group creator). Deactivates DB row **before** `leave_chat`, then fans out `send_log`, reply, and `leave_chat`.
- `/rmtc <chat_id>`: `staff_only`; refuses primary groups and infrastructure chats; deactivates DB row **before** fanning out `send_log`, `leave_chat`, and reply.

---

## 5. Callback Data Format Reference

| Callback Pattern | Handler / Owner | Notes |
|---|---|---|
| `promo_approve:<request_id>` | `admins.on_promo_decision` -> `execute_promo_decision` | Owner-only (`is_owner(fresh=True)`) |
| `promo_reject:<request_id>` | `admins.on_promo_decision` -> `execute_promo_decision` | Owner-only (`is_owner(fresh=True)`) |
| `promo_role:<role>:<target>[:<executor>]` | `admins.on_promote_role_btn` | 4-part binds to opener; 3-part legacy |
| `promo_role_cancel:<target>[:<executor>]` | `admins.on_promote_role_cancel` | 3-part binds to opener; 2-part legacy |
| `role_change:<role>:<target>[:<executor>]` | `promote_steps.on_role_change_btn` | Excludes target's current role |
| `role_change_cancel:<target>[:<executor>]` | `promote_steps.on_role_change_cancel` | 3-part binds to opener; 2-part legacy |
| `demote_confirm:<target>[:<executor>]` | `admins.on_demote_confirm` | 3-part binds to opener; 2-part legacy |
| `demote_cancel:<target>[:<executor>]` | `admins.on_demote_cancel` | 3-part binds to opener; 2-part legacy |
| `groups_details`, `groups_simple` | `groups.on_groups_details` / `on_groups_simple` | Re-fetches `active_groups()` |
| `tc_verify_<step>` | `connect_added.connection.on_verify_step` | `step` in `0..5`; group owner only |
| `tc_join` | `connect_added.connection.on_join_decision` | Group owner only |
| `tc_cancel` | `connect_added.connection.on_join_decision` | Group owner only; guarded by pending+disconnected |
