# Legacy Moderation Specification: Ban, Unban, Kick, Mute/Unmute, and Warn

This document specifies the exact behavior of the legacy Python moderation commands and pipelines in `tcbot/tcbot/modules/{bans,unban,kick,mute,warns}.py`, `tcbot/tcbot/modules/helper/targets.py`, `tcbot/tcbot/modules/helper/pipelines/{ban_*,unban_*,kick_*,mute_*,warn_*,mod_action_steps}.py`, `tcbot/tcbot/modules/helper/buttons/{ban,flows,rules}.py`, and `tcbot/tcbot/utils/time_and_date.py`.

---

## 1. Shared Moderation Infrastructure

### 1.1 Command Entry & Target Resolution

Moderation commands share two entry helpers in `tcbot/tcbot/modules/helper/targets.py`:

- **Multi-step conversation commands** (`/tcban`, `/tckick`, `/tcmute`, `/tcwarn`) call `targets.resolve_mod_target(ctx, action=..., min_role=..., allow_private=..., log_prefix=..., bot_check=...)`:
  1. Resolves locale via `locale_for_update(ctx)`.
  2. Checks federation origin via `guards.require_federation_origin(..., allow_private=allow_private)`. Disconnected groups are refused; connection-state DB outages fail closed.
  3. Extracts target via `extraction.extract_mod_target(ctx, args, ctx.bot)`. A verified explicit ID or `@username` overrides a replied-to user; `has_explicit_target` records whether `args[0]` was consumed as the target token.
  4. If `bot_check=True` (used by `/tcwarn`), verifies `identity.is_proven_bot(ctx, target_id, ctx.bot)`.
  5. Runs `guards.classify_and_check(..., action=action, min_role=min_role, target_is_bot=target_is_bot)` to classify the target and check executor-vs-target rank.
  6. Calls `identity.refuse_message(action, ident, locale)` to block protected targets (`self`, `bot`, `telegram`, `anon_admin`, `owner`, or outranking staff).
- **Single-action commands** (`/tcunmute`, `/tcunwarn`, `/resetwarns`) call `targets.run_staff_action(ctx, action=..., min_role="moderator", log_prefix=..., execute=...)`, which wraps `resolve_staff_target` (`allow_private=False`, `bot_check=True`), emits `identity.staff_notice(...)` if the target is staff, and invokes the executor directly.

### 1.2 Inline Reason Parsing & Length Caps

Defined in `tcbot/tcbot/modules/helper/pipelines/mod_action_steps.py`:

- `MAX_REASON_LEN = 1000` characters. Overlong inline reasons fail fast at command entry (`is_reason_too_long`) before any role lookup, prompt, or demote side effect.
- `MAX_RULES_NOTE_LEN = 200` characters for the optional "Other" note in the rules picker.
- `parse_inline_reason(args, *, has_explicit_target, reply_target_id=None)`:
  - If `has_explicit_target` is `True`, drops `args[0]`.
  - If `has_explicit_target` is `False` (reply path) and `reply_target_id` is provided, strips `args[0]` if `parse_user_id_token(args[0]) == reply_target_id` so a restated target ID is not treated as reason text.
  - Joins remaining tokens with `" "` and strips whitespace.

### 1.3 Generic Multi-Step Conversation (`_ModActionFlow` / `build_modaction_conv`)

Used by **kick**, **mute**, and **warn** (with `min_role="moderator"`, `rules_enabled=True`, `BuildReason(..., skip_allowed=False)`, `BuildProof(...)` where `skip_allowed=True`):

| State | Constant | Value | Description |
|---|---|---|---|
| Reason collection | `WAITING_REASON` | `0` | Accepts non-command text (`<= 1000` chars; whitespace-only rejected). Rejects non-text with `reason.unexpected.body`. |
| Proof collection | `WAITING_PROOF` | `1` | Accepts `PROOF_MEDIA_FILTER` (`photo \| video \| animation \| document`). Buffers messages in `flow_scope[f"{action}_proof_msgs"]`. |
| Rules picker | `WAITING_RULES` | `2` | Multi-select toggle of published federation rules (`rules_db.published_rules()`). |
| Rules note | `WAITING_RULES_NOTE` | `3` | Accepts non-command text (`1..200` chars) after tapping `rules_step:other`. |

- **Rules Picker Skip Condition:** `_after_reason()` skips `WAITING_RULES` and jumps directly to `WAITING_PROOF` if the moderator lacks `"rules.view"` permission (`users_roles.has_permission(uid, "rules.view")`) or no published rule items exist.
- **Rules Selection Requirement:** `rules_step:done` requires at least one rule selected (`scope[f"{action}_rules"]`) or a rules note (`scope[f"{action}_rules_note"]`); otherwise it answers with an alert (`rules.picker.require_selection`).
- **Concurrency & Freshness Guards:**
  - `callback_is_current(ctx, scope, chat_key=f"{action}_prompt_chat", message_key=f"{action}_prompt_id")` ignores stale buttons from earlier prompts.
  - `Done` (`{action}_done_proof`) and `Skip` (`{action}_skip_proof`) synchronously set `scope[f"{action}_executing"] = True` before any `await` so concurrent double-taps cannot execute twice.
  - `Done` on an empty buffer alerts `proof.empty.body` (`show_alert=True`) and stays in `WAITING_PROOF`.
  - `_recheck_tapper` re-verifies `guards.recheck_executor_rank(..., min_role=self.min_role)` before accepting reason text, skip-reason, or proof completion.
- **Conversation Fallbacks:**
  - Any prefixed command *other than* the flow's own re-entry commands (`_OWN_COMMANDS`) and any `escape_filter` triggers `_on_end_conv`, clearing `{action}_*` keys from `flow_scope` and ending the conversation.
  - Registered `escape_filter` commands (e.g., `/tcunmute` during mute, `/tcunwarn`/`/warns`/`/resetwarns` during warn) pass through to their own handlers.

### 1.4 Demote Gates: Best-Effort vs. Fail-Closed

- **Enforcement-time demote (`demote_before_enforcement`):** Used by **ban**, **kick**, **mute**, and **warn threshold ban**. Runs *after* proof collection and immediately *before* (or alongside) the decision write. It is **best-effort** on DB lookup errors (does not block enforcement), **except** when it returns `"owner"`, in which case the protected Owner role aborts enforcement and no ban/kick/mute is applied.
- **Unban-time demote (`demote_before_unban`):** Used by **`/tcunban`** and **appeal approval**. It is **fail-closed** (`UnbanGate.PROCEED`, `DEMOTE_FAILED`, `ROLE_SURVIVED`): if a staff target's role cannot be cleared, the unban is aborted so a staff member never retains rank after a ban lifts.

---

## 2. Ban (`/tcban`, `/tcb`)

- **Entrypoint:** `cmd_ban_start` in `tcbot/tcbot/modules/bans.py`
- **Commands & Aliases:** `/tcban`, `/tcb` (all configured command prefixes via `build_prefixed_filters`)
- **Decorators & Rate Limit:** `@ratelimiter(THROTTLE_FEDERATION)`, `@mod_only` (Developer and above), `@log_execution`
- **Origin:** `allow_private=True` (Bot PM or connected/primary group; disconnected groups refused)
- **Target & Reason:**
  - Target resolved via `targets.resolve_mod_target(..., action="ban", min_role="developer", allow_private=True)`.
  - Inline reason is **mandatory** (`parse_inline_reason`). If missing, replies `banning.error.reason_required` and ends. If `> 1000` chars, replies `reason_too_long_text` and ends.
- **Re-entry Protection:**
  - Calls `replace_live_proof_session(scope, chat_id, admin.id)`. If a previous ban proof session in `(chat_id, admin.id)` is already `flushing`, refuses re-entry with `banning.state.reentry` and ends. Otherwise cancels the waiting session and clears old state.
- **Active Ban Check & Re-ban Confirmation:**
  - Calls `db.bans_db.get_active_ban(target_id)` (fails closed with `err_db_retry` on DB error).
  - If an active ban exists, calls `_ask_update_confirm`, sending a confirmation card (`banning.confirm.body`) with `ban_update_confirm_btn`:
    - Optional URL buttons: `View Log` (`logs_chat`/`log_msg_id`), `View Proof` (`proofs_chat`/`proof_msg_id`)
    - Decision buttons: `Cancel` (`ban_cancel`), `Continue` (`ban_continue`)
    - Stores `ban_prompt_msg_id` and `ban_prompt_chat_id` in `flow_scope` and enters `WAITING_UPDATE_CONFIRM` (`1`).
  - `on_ban_update_continue` checks `stale_ban_callback`, re-checks rank (`recheck_executor_rank(..., min_role="developer")`), and calls `show_ban_rules(ctx)`.
- **Rules Picker (`ban_rules_step.py`):**
  - States: `WAITING_BAN_RULES` (`2`), `WAITING_BAN_RULES_NOTE` (`3`).
  - Checks `rules.view` permission and `rules_db.published_rules()`. If unavailable/empty, skips directly to `_show_proof` (`WAITING_PROOF = 0`).
  - Callbacks: `rules_step:pick:<id>`, `rules_step:done`, `rules_step:other`, `rules_step:clear`, `rules_step:cancel`.
- **Proof Collection (`ban_actions.py`, `proof_session.py`):**
  - Ban uses `BuildProof("ban", skip_allowed=False)` — **proof is mandatory** for new bans; there is no Skip button.
  - State: `WAITING_PROOF` (`0`).
  - Media messages matching `PROOF_MEDIA_FILTER` trigger `on_proof_received`, creating/updating a `ProofSession` keyed by `(chat_id, user_id)` with:
    - `deadline = monotonic() + 60.0` (`_PROOF_COLLECT_MAX_S = 60.0`)
    - `last_arrival = monotonic()`
    - Background `_flush_session` task sleeping in slices bounded by `min(cfg.album_debounce, remaining)` until silence or 60s cap.
  - Tapping `ban_done_proof` (`on_done_proof`) checks `stale_ban_callback`, verifies non-empty `session.msgs` (alerts `banning.state.empty` if empty), synchronously sets `session.flushing = True`, cancels `session.flush_task`, re-checks rank (`min_role="developer"`), and runs `_execute_ban`.
  - Tapping `ban_cancel` or `rules_step:cancel` (`on_cancel_proof`) ignores the tap if `session.flushing` is `True`; otherwise cancels the session and edits the prompt to `banning.state.cancelled`.
  - Prefixed commands other than `/tcban`/`/tcb` trigger `on_proof_timeout` (ignored if `session.flushing` is `True`; otherwise clears session, removes markup, replies `banning.state.timeout`).
- **Execution (`_execute_ban` & `_execute_ban_record`):**
  1. First `guards.enforcement_refusal(admin_id, target_id, min_role="developer", action="Ban")`.
  2. Prefetches `db.groups_db.active_groups()` in background; gathers `locale_for_user(target_id)` and `db.bans_db.get_active_ban(target_id)`.
  3. Uploads proof media via `upload_proof_media` with `proof_caption_new` (new ban) or `proof_caption_update` (re-ban, carrying `prev_proof_link`).
  4. **Proof Completeness Guard:** If `upload.expected_item_count > 0 and len(upload.items) < upload.expected_item_count`, or `(not is_update and not upload.landed)`, aborts with `banning.proof_fail.body` before any DB write. (Re-bans carry the previous proof forward if no new proof is uploaded, provided no partial upload occurred.)
  5. Resolves `_enforcement_scope(groups, prompt_chat_id)` = `with_primary_groups(groups, (cfg.main_group,), origin)` (if issued in PM, `origin=0` so only connected groups + primary group).
  6. Second `guards.enforcement_refusal(..., min_role="developer")` after proof upload.
  7. Calls `demote_before_enforcement(..., trigger="ban")`. If `"owner"`, aborts with `identity.refuse.ban.owner`.
  8. Calls `db.bans_db.update_ban(...)` (if `existing is not None`) or `db.bans_db.create_ban(...)` in one transaction: writes `moderation_actions`, `moderation_cases`, `moderation_evidence_uploads`/`items`, rule links, and queues durable `apply` run (`moderation:{action_id}:apply:v1`). Handles insert-race canonical `ban_id`.
  9. Posts `messages.ban_log` or `messages.ban_update_log` to `cfg.logs` with `ban_log_btn(target_id, proof_link, appeal_deep_link, previous_proof_link=...)`, then calls `db.bans_db.set_log_message_id(ban_id, log_msg_id)`.
  10. Delivers queued run via `enforcement_worker.deliver_queued_run(bot, enforcement_run_id)` (or direct `fan_out(bot.ban_chat_member)` if no run ID) and reads `run_report` / `delivery_outcome`.
  11. Edits prompt with `banning.summary.body`, upserts target in `users_cache`, and sends DM to target (`banning.pm.body` + `appeal_button_btn`). `ChatAdminRequired` on DM is logged at info level and ignored.

---

## 3. Unban (`/tcunban`, `/tcunb`)

- **Entrypoint:** `cmd_unban` in `tcbot/tcbot/modules/unban.py`
- **Commands & Aliases:** `/tcunban`, `/tcunb`
- **Decorators & Rate Limit:** `@ratelimiter(THROTTLE_MODERATION)`, `@mod_only` (Developer and above), `@log_execution`
- **Origin:** `guards.require_federation_origin(..., allow_private=True)`
- **Target & Parallel Pre-checks:**
  1. `extraction.extract_target(ctx, args, ctx.bot)`
  2. Gathers in parallel: `identity.classify(...)`, speculative `db.bans_db.get_active_ban(target_id)`, and `guards.resolve_and_check(msg, admin.id, target_id, min_role="developer")`.
  3. Refuses hard protected identities (`self`, `bot`, `telegram`, `anon_admin`, `owner`) via `identity.refuse_message("unban", ...)`.
- **Staff Target Cleanup:**
  - If `target_role in STAFF_ROLES` or `ident.kind in STAFF_ROLES`:
    - Re-reads `get_active_ban(target_id)` if speculative `pre_ban` was `None`. If no active ban exists, replies with the staff refusal ("nothing to undo") and returns.
    - If an active ban exists (e.g., target was re-promoted while banned), `_cleanup_role(target_role, ident)` determines the staff role and calls fail-closed `demote_before_unban(...)`. If `not gate.may_proceed`, replies `demote.abort.body` and aborts.
- **Execution (`execute_unban` in `unban_actions.py`):**
  1. Uses `pre_ban` or fetches `get_active_ban(target_id)` (fails closed with `unbanning.note.read_fail`). If none, replies `unbanning.note.no_record`.
  2. Fetches `active_groups()` **before** revoking (fails closed with `unbanning.note.groups_fail` so the ban record stays intact for retry). Merges `cfg.main_group` via `with_primary_groups`.
  3. Re-runs `guards.enforcement_refusal(admin.id, target_id, min_role="developer", action="Unban")`.
  4. Calls `db.bans_db.revoke_ban_and_queue_unban(target_id, admin_id, chat_ids, review_chat_id=cfg.main_group, review_message_id=...)` in one transaction: locks active ban row(s), withdraws pending appeals, revokes ban, drops review-slot keys, queues `revoke` run (`moderation:{action_id}:revoke:manual:v1`), and queues review-card edit if `review_message_id` existed.
  5. If `revoked == 0 or run_id is None`, replies `unbanning.note.no_record` (idempotent).
  6. Calls `enforcement_worker.deliver_queued_run(ctx.bot, run_id)` (which runs `unban_chat_member(..., only_if_banned=True)`), reads `run_report` / `delivery_outcome`, and maps outcome to `unbanning.note.queued`, `unbanning.note.partial` (listing up to 5 failed group titles/IDs), or `unbanning.note.full`.
  7. Posts `messages.unban_log` to `cfg.logs` (attributing `admin_id=0, fname="anonymous admin"` if `admin is None`) and replies `unbanning.summary.body`.

---

## 4. Kick (`/tckick`, `/tck`)

- **Entrypoint:** `cmd_kick` in `tcbot/tcbot/modules/kick.py`
- **Commands & Aliases:** `/tckick`, `/tck`
- **Decorators & Rate Limit:** `@ratelimiter(THROTTLE_MODERATION)`, `@basic_mod_only` (Moderator and above), `@log_execution`
- **Origin:** `allow_private=False` (current connected/primary group only; Telegram rejects bans in private chats)
- **Conversation (`kick_conversation` in `kick_actions.py`):**
  - Built via `build_modaction_conv` with `BuildReason("kick", skip_allowed=False)`, `BuildProof("kick", skip_allowed=True)`, `min_role="moderator"`, `rules_enabled=True`.
  - If `inline_reason` is provided (and `<= 1000` chars), skips `WAITING_REASON` and goes straight to `WAITING_PROOF` (`proof.noted_prompt`). Note: `cmd_kick` with an inline reason goes directly to `WAITING_PROOF` without showing `WAITING_RULES`; entering reason interactively goes through `_after_reason` -> `WAITING_RULES` (if eligible) -> `WAITING_PROOF`.
- **Execution (`execute_kick` in `kick_actions.py`):**
  1. First `guards.enforcement_refusal(admin_id, target_id, min_role="moderator", action="Kick")`.
  2. Optional proof upload (`upload_proof_for_action`); failure is logged and degraded to kick without proof.
  3. Second `guards.enforcement_refusal(..., min_role="moderator")` after proof upload.
  4. **Audit-First Write:** Calls `db.kicks_db.log_kick(...)` before any Telegram enforcement (aborts with `err_db_retry` on failure). Row starts as `completed`.
  5. Calls `demote_before_enforcement(..., trigger="kick")`. If `"owner"`, calls `db.kicks_db.mark_kick_failed(kick_action_id)` and replies `identity.refuse.kick.owner`.
  6. Calls `ctx.bot.ban_chat_member(chat_id, target_id)` with `TELEGRAM_LOOKUP_TIMEOUT`, setting `ban_landed = True`.
  7. Runs `ctx.bot.unban_chat_member(chat_id, target_id)` and `send_log(ctx.bot, messages.kick_log(...), reply_markup=action_proof_btn(...))` in parallel.
  8. **Unban Retry & Durable Repair:**
     - If `unban_chat_member` fails, performs **one bounded retry**.
     - If the retry also fails and at least one of the two errors is **not** a benign Telegram error (`not is_benign_telegram_error(...)`), calls `db.kicks_db.mark_kick_failed(kick_action_id)` and queues a 1-chat reconcile run via `db.enforcement_db.queue_kick_unban_repair(kick_action_id, chat_id, admin_id)` (`moderation:{action_id}:kick-unban:v1`).
     - If `unban_result` is a `BaseException`, `kicking.summary.body` includes `kicking.warn.unban`.
  9. On `CancelledError` or `Exception` after `ban_landed=True` and `not kick_delivered`, marks kick failed and queues the reconcile repair run; cancels any in-flight `proof_task`.
  10. Edits the proof prompt in place (or replies on fallback) with `kicking.summary.body` and `action_proof_btn`.

---

## 5. Mute & Unmute (`/tcmute`, `/tcm`, `/tcunmute`, `/tcunm`, `/tcum`)

### 5.1 Mute (`/tcmute`, `/tcm`)

- **Entrypoint:** `cmd_mute` in `tcbot/tcbot/modules/mute.py`
- **Commands & Aliases:** `/tcmute`, `/tcm`
- **Decorators & Rate Limit:** `@ratelimiter(THROTTLE_MODERATION)`, `@basic_mod_only` (Moderator and above), `@log_execution`
- **Origin:** `allow_private=False` (connected/primary group only)
- **Target, Duration, and Reason Parsing:**
  1. Resolves target via `targets.resolve_mod_target(..., action="mute", min_role="moderator", allow_private=False)`.
  2. Strips `args[0]` if `has_explicit_target`, or if reply path and `extraction.restates_reply_target(remaining_args[0], target_id, target_username)` is `True`.
  3. Attempts `parse_duration(remaining_args[0])` (`tcbot/utils/time_and_date.py`):
     - Regex: `^(\d+)(ye|mo|[smhdw])$` (case-insensitive).
     - Suffixes: `s` (1s), `m` (60s), `h` (3600s), `d` (86400s), `w` (7d), `mo` (30d), `ye` (365d).
     - `value <= 0` returns `None` (rejected, not permanent).
     - `result.days > 366` (`_MAX_DURATION_DAYS = 366`) returns `None` (Telegram treats >366d as permanent).
     - `result < 60s` (`_MIN_TELEGRAM_RESTRICTION_SECONDS = 60`) is clamped up to `60s` (Telegram treats <30s as permanent).
     - If `parse_duration` returns a `timedelta`, `remaining_args.pop(0)`. If `None`, the token **remains in the reason text** and `duration` stays `None` (permanent mute).
  4. Parses `inline_reason` from remaining tokens (`<= 1000` chars).
  5. Stores `mute_extra_info = f"{code(str(target_id))}: {esc(fmt_duration(duration, locale))}"` and enters `WAITING_PROOF` (if `inline_reason`) or `WAITING_REASON`.
- **Conversation:** `mute_conversation` in `mute_actions.py`, with `escape_filter=_UNMUTE_CMDS` so `/tcunmute` is never swallowed as a reason.
- **Execution (`_execute_mute` in `mute_actions.py`):**
  1. First `guards.enforcement_refusal(..., min_role="moderator", action="Mute")`.
  2. Fetches `active_groups()` (aborts with `muting.note.groups_fail` on failure) and merges `cfg.main_group`.
  3. Optional proof upload (`upload_proof_for_action`).
  4. Second `guards.enforcement_refusal(..., min_role="moderator")` after proof.
  5. Calls `demote_before_enforcement(..., trigger="mute")`. If `"owner"`, aborts with `identity.refuse.mute.owner`.
  6. Computes `until = utc_now() + duration if duration else None` *after* proof upload so upload latency does not eat into short mutes.
  7. Calls `db.mutes_db.record_mute(...)` in one transaction (with per-user advisory lock):
     - Writes `moderation_actions` (`action_type='mute'`), case, proof, rules, and queues `apply` run (`moderation:{action_id}:apply:v1`).
     - **Superseding rules:** A new permanent mute clears expiry; a new timed mute keeps the later of the new and stored deadlines (never shortens a longer expiry or replaces a permanent one).
  8. Delivers queued run via `enforcement_worker.deliver_queued_run` (applying `ChatPermissions(can_send_messages=False)` and `until_date=until`), or direct `fan_out(bot.restrict_chat_member)` if no `run_id`.
  9. Posts `messages.mute_log` to `cfg.logs` and edits the prompt with `muting.summary.body` + `action_proof_btn`.

### 5.2 Unmute (`/tcunmute`, `/tcunm`, `/tcum`)

- **Entrypoint:** `cmd_unmute` in `tcbot/tcbot/modules/mute.py` -> `targets.run_staff_action(..., action="unmute", min_role="moderator", execute=execute_unmute)`
- **Commands & Aliases:** `/tcunmute`, `/tcunm`, `/tcum`
- **Execution (`execute_unmute` in `mute_actions.py`):**
  1. Checks `db.mutes_db.get_active_mute(target_id)` (evaluated at query time via `expires_at is null or expires_at > now()`). If `None`, replies `muting.note.no_mute`.
  2. Fetches `active_groups()` before revoking; merges `cfg.main_group`.
  3. Calls `db.mutes_db.revoke_mute_and_queue_unmute(target_id, admin.id, chat_ids)` (revokes mute, queues `revoke` run `moderation:{action_id}:revoke:manual:v1` restoring `ChatPermissions.all_permissions()`). If `revoked == 0 or run_id is None`, replies `muting.note.no_mute`.
  4. Delivers queued run via `deliver_queued_run`, reads `run_report`, and replies with `muting.note.unmute_queued`, `muting.note.unmute_failed`, `muting.note.unmute_partial`, or `muting.unmute.body`.
  5. Posts `messages.unmute_log` to `cfg.logs`.

---

## 6. Warn, Unwarn, Warnlist, and Resetwarns

### 6.1 Warn (`/tcwarn`, `/tcw`)

- **Entrypoint:** `cmd_warn` in `tcbot/tcbot/modules/warns.py`
- **Commands & Aliases:** `/tcwarn`, `/tcw`
- **Decorators & Rate Limit:** `@ratelimiter(THROTTLE_MODERATION)`, `@basic_mod_only` (Moderator and above), `@log_execution`
- **Origin & Bot Check:** `allow_private=False`, `bot_check=True` (proven bots are refused).
- **Staff Notice:** If target is staff (and not refused), emits `identity.staff_notice("warn", ...)` and proceeds.
- **Conversation:** `warn_conversation` with `escape_filter=_UNWARN_CMDS | _WARNLIST_CMDS | _RESET_CMDS`.
- **Execution (`execute_warn` in `warn_actions.py`):**
  1. Dual `guards.enforcement_refusal(..., min_role="moderator", action="Warn")` around optional `upload_proof_for_action`.
  2. Calls `db.warns_db.add_warn(...)` (takes user-wide advisory lock then per-chat lock; sets `expires_at` from `cfg.warn_expiry_days` or `None` if `0`; returns current active per-group `count`).
  3. **Threshold Evaluation:**
     - **Per-group:** `count >= cfg.warn_limit` (default `3`, min `1`) -> `threshold_trigger = "per_group"`.
     - **Federation-global:** Else if `cfg.fed_warn_limit > 0` (default `0`, disabled), reads `db.warns_db.federation_warn_count(target_id)` (fails with `warnings.fed_fail.body` on DB error). If `fed_count >= cfg.fed_warn_limit` -> `threshold_trigger = "fed_global"`.
     - **No threshold reached:** Posts `messages.warn_log` and replies `warnings.issued.body` with `action_proof_btn`.
  4. **Threshold Reached -> Staff Exemption or Auto-Ban:**
     - Reads `db.users_roles.get_effective_role(target_id, fresh=True)` (fails closed with `err_db_retry`).
     - **Staff Exemption:** If `target_role` is truthy, calls `Demote.execute(..., trigger="warn")` instead of banning, and replies `warnings.exempt.demoted` (if demoted) or `warnings.exempt.failed` (if not).
     - **Owner Re-check:** Calls `demote_before_enforcement(..., trigger="ban")`. If `"owner"`, aborts auto-ban and replies `warnings.exempt.failed`.
     - **Automatic Federation Ban:** Gathers `active_groups()` and `get_active_ban(target_id)`. Merges `cfg.main_group` and origin `chat_id`. If not `already_banned`, calls `db.bans_db.create_ban(..., action_origin="automated", origin_chat_id=chat_id, proof_items=..., enforcement_chat_ids=...)` (proof is optional here). Posts `warn_log`, sets `log_message_id`, delivers `ban_run_id` via `deliver_queued_run` (or direct `fan_out`).
     - **Warn Slate Clearing (`_clear_warns_after_threshold_ban`):**
       - `any_ban_ok = already_banned or applied > 0 or pending > 0`.
       - If `any_ban_ok`: replies `notice_per_group` or `notice_fed` + `applied_summary`, then clears warnings:
         - If `scope_complete` (i.e. `not groups_fetch_failed`) and `len(landed_chat_ids) >= len(groups)`: calls `db.warns_db.clear_all_warns(target_id)`.
         - Otherwise (partial enforcement or reduced scope): calls `db.warns_db.clear_warns_for_chats(target_id, landed_chat_ids)` so unreached groups retain their warnings.
       - If `not any_ban_ok`: replies `fail_per_group` or `fail_fed` + `applied_summary` and leaves all warnings intact.

### 6.2 Warn Management Commands

| Command | Aliases | Access & Origin | Behavior |
|---|---|---|---|
| `/tcunwarn` | `/tcunw` | `THROTTLE_MODERATION`, `basic_mod_only`, `allow_private=False` | `run_staff_action` -> `execute_unwarn`: checks `warn_count`; if `0` replies `warnings.none.body`; else `remove_last_warn` (newest live non-expired warning), logs `unwarn_log`, replies `warnings.removed.body`. |
| `/warns` | `/warnlist` | `THROTTLE_READ`, `basic_mod_only`, `allow_private=False`, `resolve_and_check(min_role="moderator")` | `execute_warnlist`: fetches up to `50` newest live warnings (`get_warns(..., limit=50)`) + total `warn_count`; replies `warnings.none.body` if `0`, else numbered list under `warnings.list.header`. |
| `/resetwarns` | `/clearwarns` | `THROTTLE_MODERATION`, `basic_mod_only`, `allow_private=False` | `run_staff_action` -> `execute_resetwarns`: calls `clear_warns(target_id, chat_id)` (revokes all active warnings in current group); if `0` replies `warnings.none_clear.body`; else logs `resetwarns_log` and replies `warnings.cleared.body`. |

---

## 7. Consolidated Callback Data Formats

| Callback Data | Handler / Owner | Meaning |
|---|---|---|
| `ban_continue` | `ban_confirmation.on_ban_update_continue` | Proceed from re-ban confirmation to rules/proof. |
| `ban_cancel` | `ban_actions.on_cancel_proof` | Cancel ban confirmation or proof collection. |
| `ban_done_proof` | `ban_actions.on_done_proof` | Flush collected ban proof immediately. |
| `<action>_cancel` | `mod_action_steps._on_cancel` | Cancel `kick`, `mute`, or `warn` flow. |
| `<action>_skip_reason` | `mod_action_steps._on_skip_reason` | Skip reason (only when `skip_allowed=True`; disabled for kick/mute/warn). |
| `<action>_skip_proof` | `mod_action_steps._on_skip_proof` | Execute `kick`, `mute`, or `warn` without proof. |
| `<action>_done_proof` | `mod_action_steps._on_done_proof` | Execute `kick`, `mute`, or `warn` with collected proof. |
| `rules_step:pick:<id>` | `ban_rules_step` / `mod_action_steps` | Toggle rule item `<id>` in picker. |
| `rules_step:done` | `ban_rules_step` / `mod_action_steps` | Confirm rule selection (requires `>= 1` rule or note). |
| `rules_step:other` | `ban_rules_step` / `mod_action_steps` | Prompt for custom rules note (`1..200` chars). |
| `rules_step:clear` | `ban_rules_step` / `mod_action_steps` | Clear all selected rules. |
| `rules_step:cancel` | `ban_actions.on_cancel_proof` / `mod_action_steps._on_cancel` | Cancel flow from rules picker or rules note step. |
