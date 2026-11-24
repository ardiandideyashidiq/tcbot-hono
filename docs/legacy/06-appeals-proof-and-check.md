# Legacy Appeals, Proof Pipeline, and Check Panels Specification

This document specifies the exact behavior of the legacy Python bot's appeals lifecycle, shared proof pipeline, and `/check` + `/checkme` inspection panels in `tcbot/tcbot/modules/{appeals,check}.py`, `tcbot/tcbot/modules/helper/ban_info.py`, `tcbot/tcbot/modules/helper/pipelines/{appeal_*,proof_*,check_panels}.py`, and `tcbot/tcbot/modules/helper/buttons/{appeal,ban,check,flows}.py`.

---

## 1. Appeals Lifecycle

### 1.1 Entry Points & Filters (`appeals.py`, `appeal_submit.py`)

| Entry | Filter / Handler | Rate Limit & Origin |
|---|---|---|
| DM Deep Link | `_APPEAL_START_CMDS`: `filters.private & filters.regex(rf"^/start\s+appeal_{REF_PATTERN}$")` where `REF_PATTERN = r"[a-z0-9]{10,32}"` | Handled by `appeal.build_handler(...)` (`_on_entry` -> `_start`). |
| Main-Group Tag | `MessageHandler(filters.text & ~ALL_PREFIXES_CMD_FILTER & filters.regex(r"(?i)^\s*#appeal"), on_group_appeal)` | `@ratelimiter(THROTTLE_MODERATION)`; gated to `cfg.is_primary_group(chat.id)` inside `handle_group_appeal`. |
| Staff Review Decision | `CallbackQueryHandler(on_appeal_decision, pattern=r"^appeal_(approve\|reject)_\S+$")` | `@ratelimiter(THROTTLE_STAFF)`; delegates to `AppealReviewMixin.on_decision`. |

### 1.2 Submission Gates & Conversation (`appeal_submit.py`)

- **DM Deep-Link Path (`_start(ctx, ban_id)`):**
  1. Requires `private` chat (`appeals.submit.not_private` otherwise).
  2. Fetches `db.bans_db.get_ban(ban_id)`. Must exist and have `is_active == True` (`appeals.submit.invalid_link`).
  3. Ownership check: `ban.get("target_user_id") == user.id` (`appeals.submit.wrong_account`).
  4. **Pending Review & Stale Review Check:** If `ban.get("review_message_id")` is set:
     - `_is_stale_review(review_timestamp)` is `True` if `review_timestamp is None` or `to_utc(review_timestamp) < utc_now() - timedelta(hours=72)` (`_STALE_REVIEW_HOURS = 72`).
     - If stale, calls `db.bans_db.release_stale_review(ban_id, review_msg_id)` to free the slot and withdraw pending appeals; on DB error, replies `appeals.submit.pending_review` and ends.
     - If not stale, replies `appeals.submit.pending_review` (`hours=72`) and ends.
  5. **Rejection Cooldown Check:** `_cooldown_remaining_h(ban.get("rejected_at"))` enforces `_REJECTION_COOLDOWN_HOURS = 24` (rounded up to whole remaining hours). If active, replies `appeals.submit.cooldown` and ends.
  6. Stores `appeal_ban_id`, `appeal_log_msg_id`, and `appeal_instruction_msg_id` in `flow_scope`, sends `instruction_text` with `appeal_cancel_btn(callback="cancel_appeal")`, and enters `WAITING_APPEAL` (`0`).

- **Main-Group `#appeal` Path (`handle_group_appeal`):**
  1. Only runs in `cfg.is_primary_group(chat.id)` and when `starts_with_appeal_tag(text)` is `True`.
  2. Looks up `db.bans_db.get_active_ban(user.id)` (ignores any unlabelled alphanumeric words in the text). If no active ban, replies `appeals.submit.invalid_link`.
  3. Sets `appeal_ban_id` and `appeal_log_msg_id` in `flow_scope` and calls `SubmitMessageMixin._on_message(ctx)` directly.

- **Message Validation (`SubmitMessageMixin._on_message`):**
  1. Must start with `#appeal` (case-insensitive). If `appeal_ban_id` is not in `ctx.user_data`, raises `ContinuePropagation()` so other handlers see the text; otherwise replies `appeals.submit.unexpected` and stays in `WAITING_APPEAL`.
  2. Length cap: `len(text) > 2000` (`_MAX_APPEAL_LEN = 2000`) replies `appeals.submit.too_long` and stays in `WAITING_APPEAL`.
  3. Re-fetches `db.bans_db.get_ban(ban_id)`, re-verifies `is_active`, `target_user_id == user.id`, stale/pending review (`72h`), and rejection cooldown (`24h`).
  4. **Log Message ID Reference Check:** If `log_msg_id` is known, `text_references_log_message(text, log_msg_id)` requires `re.search(rf"\b{log_msg_id}\b", text)`. If missing, replies `appeals.submit.invalid_log` and stays in `WAITING_APPEAL`.
  5. Calls `post_appeal(...)`.

- **Cancel & Fallbacks:**
  - `cancel_appeal` (`_on_cancel`): compares `q.message.id` against `scope["appeal_instruction_msg_id"]`; stale taps are answered and ignored (`return None`). Live taps clear state and edit message to `appeals.submit.cancelled`.
  - Non-text in DM (`_on_unexpected`): replies `appeals.submit.unexpected` and stays in `WAITING_APPEAL`.
  - Unrecognized prefixed commands (`_end`): clears state, replies `appeals.submit.session_ended`, and ends.

### 1.3 Appeal Posting (`appeal_post.py`, `appeal_post_edit.py`)

1. Forwards the appeal message to `cfg.appeals` (`appeal_chat, appeal_thread`) to obtain `appeal_msg_id` and `appeal_link` (if single message, not album list).
2. Builds `review_text = messages.appeal_received_log(...)` (includes `appeal_excerpt=appeal_text` if `appeal_link` is empty).
3. Sends `review_text` to `cfg.main_group` first to obtain `review_msg_id` (the decision token).
4. Builds `appeal_review_btn(ban_id, review_msg_id, locale)` with callbacks:
   - `appeal_approve_<ban_id>_<review_msg_id>` (`SUCCESS`)
   - `appeal_reject_<ban_id>_<review_msg_id>` (`DANGER`)
5. Gathers in parallel:
   - Copy of `review_text` + `review_btn` to `cfg.appeals` (`appeals_review_id`)
   - `send_log(appeal_submitted_log)` to `cfg.logs` (`appeal_log_sent_id`)
   - `edit_message_reply_markup` on `cfg.main_group` `review_msg_id` to attach `review_btn`.
   - If `edit_message_reply_markup` fails, deletes both `cfg.main_group` and `cfg.appeals` cards and sets `review_msg_id = None`.
6. **Atomic Slot Claim:** Calls `db.bans_db.submit_appeal(ban_id, uid, appeal_text, review_msg_id)`.
   - If `claimed` is `False` (race lost), deletes both cards, replies `appeals.submit.pending_review`, clears state, and ends.
7. Calls `db.bans_db.set_appeal_log_msg(ban_id, appeal_log_sent_id, appeal_link=appeal_link)`.
8. Upserts user in `users_cache` and edits instruction message (`edit_instruction`) to `appeals.submit.submitted`.
9. If `review_msg_id is None`, calls `report_delivery_failure` (deletes orphan `appeals_review_id` and edits instruction message to `appeals.submit.delivery_failed`) and returns `WAITING_APPEAL`.

### 1.4 Staff Review & Decision (`appeal_review.py`)

1. **Payload Parsing (`on_decision`):**
   - Strips `appeal_approve_` or `appeal_reject_`, then `payload.rpartition("_")`.
   - If trailing segment is digits, `tapped_review_id = int(raw_review_id)`.
   - Legacy cards without `_<review_id>` fall back to `tapped_review_id = q.message.message_id`.
2. **Authorization & Validation Gates (answered per branch, never up front):**
   - Gathers `db.users_roles.get_effective_role(admin.id, fresh=True)` and `db.bans_db.get_ban(ban_id)`.
   - Requires `role_result in OWNER_ADMIN_ROLES` (Admin or Owner; otherwise alerts `appeals.review.not_authorized`).
   - If `not ban_result`: acks and edits card to `appeals.review.ban_not_found`.
   - If `not ban.get("is_active")`: releases stale review if `review_message_id` is set, and edits/alerts `appeals.review.already_resolved`.
   - If `ban.get("rejected_at") is not None or not ban.get("review_message_id")`: alerts `appeals.review.already_resolved`.
   - **Live Card Check:** If `tapped_review_id != int(ban["review_message_id"])`, acks and edits card to `appeals.review.stale_card`.
   - **12-Hour Reviewer Lockout (`reviewer_locked_out`):** `LOCK_HOURS = 12`. If `review_timestamp` is within 12 hours and `admin.id != ban["actor_user_id"]`, alerts `appeals.review.review_locked`. (The original ban actor is never locked out.)
   - **Self-Review Block:** If `admin.id == target_id`, alerts `appeals.review.not_authorized`.
3. **Atomic Decision Claim:**
   - Calls `db.bans_db.claim_appeal_decision(ban_id, review_msg_id)`. Loser gets `appeals.review.already_resolved`.
   - If `_approve_appeal` or `_reject_appeal` returns `False` or raises/`CancelledError`, calls `_restore_review_slot(ban_id, review_msg_id, review_ts)` (bounded by `_RESTORE_TIMEOUT_S = 5.0`s) so the review card does not die undecided.
4. **Approve Path (`_approve_appeal`):**
   - Freshly fetches `target_role` and `target_fname`. Checks `guards.outranks(approver_role, target_role)` (alerts `common.refuse.outranked` on failure).
   - Fetches `active_groups()` (alerts `common.err.groups_load_failed` on failure).
   - If `target_role in STAFF_ROLES`, runs fail-closed `demote_before_unban(..., trigger="appeal")`; if `not gate.may_proceed`, alerts `appeals.review.demote_blocked` and returns `False`.
   - Calls `db.bans_db.approve_appeal_and_queue_unban(ban_id, admin.id, display_name(admin), admin.id, chat_ids)` (accepts appeal, revokes ban, drops review keys, queues `revoke:appeal:v1` run).
   - Acks query (`answer_ack(q)`), calls `enforcement_worker.deliver_queued_run(bot, run_id)`.
   - Gathers in parallel: target DM (`appeals.decision.approve_dm`), review card edit (`appeals.decision.approve_card` with `InlineKeyboardMarkup([])`), appeal log edit (`messages.appeal_approved_edit`), and unban log (`messages.appeal_unban_log`).
   - If review card edit fails, calls `db.notifications_db.enqueue_review_card_edit(action_id, cfg.main_group, review_id)` for durable retry by `notification_worker`.
5. **Reject Path (`_reject_appeal`):**
   - Freshly fetches `target_role` and `target_fname`; checks `guards.outranks(approver_role, role_r)`.
   - Calls `db.bans_db.reject_appeal(ban_id, admin.id, display_name(admin))` (sets appeal to `rejected`, records `resolved_at` -> `rejected_at`, drops review keys).
   - Acks query, edits review card to `appeals.decision.reject_card` with empty markup (enqueues `enqueue_review_card_edit` on failure), sends target DM (`appeals.decision.reject_dm`), and updates/sends appeal log (`messages.appeal_rejected_edit`).

---

## 2. Proof Pipeline (`proof_steps.py`, `proof_session.py`, `proof_post.py`)

### 2.1 Accepted Media & Keyboard

- **Filter (`PROOF_MEDIA_FILTER`):** `filters.photo | filters.video | filters.animation | filters.document`. Voice notes, video notes, and stickers are rejected (`_on_proof_unexpected` / `on_proof_unexpected`).
- **Keyboard (`proof_step_btn`):**
  - `ban`: `[Done (ban_done_proof), Cancel (ban_cancel)]` (`skip_allowed=False`)
  - `kick` / `mute` / `warn`: `[Skip (<action>_skip_proof), Done (<action>_done_proof), Cancel (<action>_cancel)]` (`skip_allowed=True`)

### 2.2 Collection Models

1. **Ban (`ProofSession` & `ProofSessionRegistry` in `proof_session.py`):**
   - Keyed by `(chat_id, user_id)`.
   - Stores `msgs`, `meta` (snapshot of `flow_scope`), `scope`, `deadline` (`now + 60.0`s), `last_arrival`, `flushing`, `cancelled`, `flush_task`.
   - `_flush_session` loops in slices of `min(cfg.album_debounce, remaining)` until silence or the 60s hard cap, then synchronously sets `session.flushing = True` and calls `_execute_ban`.
   - `on_done_proof` synchronously sets `session.flushing = True` and cancels `session.flush_task`, ensuring only one of `Done` or the timer executes.
   - `replace_live_session` refuses re-entry if `session.flushing` is `True`; otherwise cancels the waiting session and clears scope.
   - `drain_proof_sessions()` at shutdown waits up to `_PROOF_DRAIN_TIMEOUT_S = 30.0`s for running/waiting flushes, then cancels only sessions where `not session.flushing`.
2. **Kick / Mute / Warn (`_ProofStepMixin` in `mod_action_steps.py`):**
   - Appends media messages directly to `flow_scope[f"{action}_proof_msgs"]` and waits for explicit `<action>_done_proof` or `<action>_skip_proof`.
   - Both buttons synchronously claim `scope[f"{action}_executing"] = True` before any `await`.

### 2.3 Upload & Archiving (`proof_post.py`)

- `upload_proof_items(bot, msgs, caption, proof_chat, proof_thread)`:
  - Classifies each message via `_source_media` into `photo`, `video`, `animation`, or `document`.
  - **Gallery (`photo`, `video`):** Sent via `send_media_group` in chunks of max `10` items (or single `send_photo`/`send_video` if `len(gallery) == 1`).
  - **Singles (`animation`, `document`):** Sent individually via `send_animation`/`send_document` after the gallery.
  - **Caption Placement:** Attached to the **first item that actually lands** (`parse_mode=None`), using `proof_caption_new` (or `proof_caption_update` for re-bans).
  - Returns `(landed_items: list[ProofItem], expected_item_count: int)`. Failed chunks/singles are logged and skipped without aborting remaining items.
- `upload_proof_media` returns a `ProofUpload(message_id, link, items, expected_item_count, slideshow_html)`:
  - Never raises on upload failure (returns empty `ProofUpload`).
  - **Ban completeness check:** New bans abort if `not upload.landed` or `len(upload.items) < upload.expected_item_count`. Re-bans abort on partial upload (`len < expected`), or carry the full prior evidence batch forward if no new proof was sent.
  - **Kick / Mute / Warn:** Optional; attaches whatever landed.

---

## 3. `/check` and `/checkme` Panels & Buttons (`check.py`, `check_panels.py`, `ban_info.py`, `buttons/check.py`)

### 3.1 Self-Check (`/checkme`, `/cme`)

- **Access:** `@ratelimiter(THROTTLE_READ)`, anyone, private or group.
- **Bot Guard:** If `user.is_bot` (including anonymous-admin placeholder), replies `checking.error.bot_sender` and returns.
- **Lookup:** Gathers `db.users_roles.get_effective_role(user.id)` and `db.bans_db.get_active_ban(user.id)`. Fails closed with `checking.error.status_retry` if either raises.
- **Responses:**
  1. **Active Ban (checked first, even for staff):** Renders `build_ban_summary` (`checking.checkme.banned`) with `checkme_ban_btn(bot_username, ban_id, proof_link, locale)`:
     - Row 1: `Details` (`checkme_detail:<ban_id>`), optional `Proof` (URL)
     - Row 2: `Appeal` (deep link `https://t.me/<bot>?start=appeal_<ban_id>`)
     - Returns `None` if `bot_username` is empty.
  2. **Admin:** `checking.checkme.staff_admin`
  3. **Developer / Moderator:** `checking.checkme.staff_role`
  4. **Clean:** `checking.checkme.clean`
- **`/checkme` Callbacks (`THROTTLE_CALLBACK`):**
  - `checkme_detail:<ban_id>` (`on_checkme_detail`): Verifies `ban["target_user_id"] == q.from_user.id` (silently acks mismatch), checks `ban["is_active"]` (edits `checking.error.ban_inactive` if inactive), renders `build_ban_detail` with `checkme_detail_back_btn` (optional `Proof` URL + `Back` `checkme_back:<ban_id>`).
  - `checkme_back:<ban_id>` (`on_checkme_back`): Verifies ownership, re-renders `build_ban_summary` and `checkme_ban_btn`.

### 3.2 User Profile (`/check`, `/c`)

- **Access:** `@ratelimiter(THROTTLE_READ)`, anyone, private or group.
- **Target Resolution:** `extraction.extract_target(ctx, args, ctx.bot, prefer_explicit=True)` (explicit arg overrides reply target; falls back to reply if arg fails). Refreshes `users_cache.refresh_display_name` if not a placeholder ID.
- **Profile View (`Check.profile`):**
  - Gathers in parallel: `_resolve_user_info` (cache + background refresh), `role_meta`, `get_active_ban`, `get_active_mute`, `user_ban_count`, `user_appeal_count`, `user_total_warns`, `user_warn_groups`, `user_kick_count`, `user_mute_count`, and `identity.classify` (when `executor_id` is present).
  - Renders `identity_note` (if any), Identity table (Name, ID, Username, Role, plus Assigned By / Assigned At if non-owner staff), Activity table (Active Ban + `ban_id`, Active Mute, Total Bans, Warnings `active/groups/total`, Kicks, Mutes, Appeals), and optional caveat footer if any count failed.
  - **Keyboard (`check_profile_btn`):**
    - Row 1: `Bans (n)` (`check_bans:<target_id>:0`) | `Appeals (n)` (`check_appeals:<target_id>:0`)
    - Row 2: `Warnings (n)` (`check_warns:<target_id>`)
    - Row 3: `Kicks (n)` (`check_kicks:<target_id>:0`) | `Mutes (n)` (`check_mutes:<target_id>:0`)

### 3.3 `/check` Drill-Down Callbacks (`THROTTLE_CALLBACK_DEEP`, `_PAGE_SIZE = 5`)

| Callback Pattern | Handler & View | Notes & Navigation |
|---|---|---|
| `^check_main:\d+$` | `on_check_main` -> `Check.profile` | Returns to top-level profile dashboard. |
| `^check_bans:\d+:\d+$` | `on_check_bans` -> `Check.bans_list` | Paginated bans (`_PAGE_SIZE = 5`), `_BAN_LIST_REASON_LEN = 60`, 3 drill buttons/row (`check_ban_item:<target_id>:<ban_id>`), `nav_row`, Back -> `check_main:<target_id>`. |
| `^check_ban_item:\d+:[a-z0-9]+$` | `on_check_ban_item` -> `Check.ban_detail` | Verifies `ban["target_user_id"] == target_id`; renders `build_ban_detail` + `detail_btn` (`View Proof`, `View Appeal`, Back -> `check_bans:<target_id>:0`). |
| `^check_appeals:\d+:\d+$` | `on_check_appeals` -> `Check.appeals_list` | Paginated appealable bans, drill buttons `check_ban_item:<target_id>:<ban_id>`, Back -> `check_main:<target_id>`. |
| `^check_warns:\d+$` | `on_check_warns` -> `Check.warns_by_group` | Table of groups with active warnings; `check_warn_groups_btn` (title truncated to `_WARN_GROUP_TITLE_MAX = 24`) emitting `check_warn_chat:<target_id>:<cid>:0`, Back -> `check_main:<target_id>`. |
| `^check_warn_chat:\d+:-?\d+:\d+$` | `on_check_warn_chat` -> `Check.warns_in_group` | Paginated warnings in one chat (`_REASON_PREVIEW_LEN = 80`), `nav_row`, Back -> `check_warns:<target_id>`. |
| `^check_kicks:\d+:\d+$` | `on_check_kicks` -> `Check.kicks_list` | Paginated kicks; marks `status == "failed"` rows with `checking.events.kick_failed`; Back -> `check_main:<target_id>`. |
| `^check_mutes:\d+:\d+$` | `on_check_mutes` -> `Check.mutes_list` | Paginated mutes; displays both `requested` (`requested_duration_secs`) and `stored` (`duration_secs`) durations; Back -> `check_main:<target_id>`. |
