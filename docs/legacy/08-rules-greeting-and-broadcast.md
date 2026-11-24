# Legacy Specification: Rules, Greeting, and Broadcast

This document captures the exact behavior of the legacy Python bot (`/home/rd/Projects/bot/tcbot-rewrite/tcbot/`) for the community rules system, member greeting/join-time enforcement, and federation broadcasting.

---

## 1. Community Rules System

### Architecture & Data Model
- Database tables: `rule_sets`, `rule_set_versions`, `rule_categories`, `rule_category_content`, `rule_items`, `rule_publication_runs`, `rule_publications`, `rule_acknowledgements`.
- Published versions are immutable; all edits target a draft (`status == "draft"`). One draft per `(rule_set, working_locale)` exists at a time.
- `open_draft()` clones the current published items and category snapshot so later renames/reorders do not alter older published versions.
- Category slugs are derived by `slug(title)`: `re.sub(r"[^a-z0-9]+", "-", title.strip().lower()).strip("-")[:40] or "category"` (`_SLUG_MAX = 40`) to stay within Telegram's 64-byte `callback_data` limit.

### Bundled Rules & Violation Tiers (`tcbot/rules/*.md`)
17 Markdown rule documents live in `tcbot/rules/`:
`cheat.md`, `doxing-dan-privasi.md`, `identitas.md`, `karya-dan-atribusi.md`, `konten-pornografi-nsfw.md`, `materi-pengujian.md`, `mod-apk-dan-bajakan.md`, `module-root.md`, `out-off-topic.md`, `pengelola.md`, `penipuan.md`, `perundungan-dan-kebencian.md`, `politik.md`, `promosi.md`, `sanksi.md`, `spam.md`, `transaksi.md`.

`tcbot/rules/sanksi.md` defines the 4 violation tiers and their sanction ceilings:
- **Ringan**: written warning (`teguran tertulis`).
- **Sedang**: written warning, mute up to 3 days, or privilege restriction up to 7 days.
- **Berat**: mute up to 30 days, privilege restriction up to 30 days, or group removal (`keluar dari grup`); requires >= 2 distinct evidence types.
- **Sangat berat**: group removal or federation-wide ban (`blokir bersama`, only after final decision / appeal expiry); requires >= 2 distinct evidence types.

### Public Rules Menu & Acknowledgment (`tcbot/modules/rules.py`)
- **Commands / Entry**: `/rules` (any chat, `THROTTLE_READ`) and `/start rules` (private chat deep link).
- Renders `rules_menu()` with `rules_index_btn(categories, locale, page=0)` (`_RULES_PER_PAGE = 8`, 2 category buttons per row, `Prev`/`Next`/`Close`).
- **Navigation Callbacks**:
  - `rules_index:<page>`, `rules_prev:<page>`, `rules_next:<page>`, `rules_menu` (legacy Back -> page 0), `rules_page:<page>` (legacy More -> page): render paginated topic index (`rich_index_page`).
  - `rules_show:<category_key>`: stores `ctx.user_data["rules_current_category"] = key`, extracts unique section labels (the part after `:` in item titles), renders `rich_category_index` + `category_sections_btn`.
  - `rules_section:<index>`: reads `rules_current_category` from `ctx.user_data`, filters items matching `sections[index]`, renders `rich_section_page` + `rules_section_btn(key, locale)`.
- **Greeting Acknowledgment (`_acknowledge`)**:
  - Callback: `rules_ack:<version_id>:<member_id>`.
  - Verifies `user.id == member_id` (else alert `rules.ack.wrong_member`).
  - Verifies `acknowledgement_requirement()` matches `version_id` (else alert `rules.ack.outdated`).
  - Checks `has_acknowledged(version_id, user.id)` (else alert `rules.ack.already`).
  - Calls `record_acknowledgement(version_id, user.id, chat_id, message_id)` (`ON CONFLICT DO NOTHING`) and alerts `rules.ack.recorded`.
  - Fails with `common.err.db_retry` alert on DB error so the spinner never hangs.

### Staff Rules Editor (`rules_editor.py`, `rules_editor_draft.py`, `rules_editor_steps.py`)
- **Entry**: `/tcrules` (alias `/tcrls`) or `/start tcrules` in private chat (`build_rules_conv()`). In a non-private chat, replies with `rules.editor.open_pm` and an `open_pm_btn(bot_username, "tcrules", locale)` deep-link button.
- **Authorization**: `editor_allowed(ctx)` re-checks `db.users_roles.has_permission(uid, "rules.manage")` on every editor surface and fails closed on lookup error.
- **Conversation States**:
  - `WAITING_EDITOR_MENU = 0`: language picker (`rules_lang`, `rules_lang_set:<locale>`), main panel (`rules_panel`), category CRUD (`rules_edit_draft`, `rules_categories`, `rules_cat:<key>`, `rules_cat_add`, `rules_cat_rename:<key>`, `rules_cat_up:<key>`, `rules_cat_down:<key>`, `rules_cat_del:<key>`), item & section editing (`rules_item_add`, `rules_items_page:<page>`, `rules_sections`, `rules_section_edit:<id>`, `rules_fmt:<style>`, `rules_section_title`), draft preview (`rules_preview`, `rules_preview_cat:<key>`, `rules_preview_sec:<idx>`, `rules_preview_page:<idx>`), publish (`rules_publish`), discard (`rules_discard`), and text step routing (`on_text`).
  - `WAITING_CONFIRM_DISCARD = 5`: `rules_discard_yes` (deletes draft via `discard_draft`), `rules_discard_no` (cancels without deleting), `rules_panel`.
  - `WAITING_MARKDOWN = 6`: accepts `.md` document uploads (`on_markdown`), text steps, `rules_panel`, `rules_lang`.
  - Fallback: `rules_step:cancel` is answered and ignored (`ignore_foreign_cancel`) so a stale moderation picker tap cannot close the editor.
- **Input Limits**:
  - `_TITLE_MAX = 200`, `_BODY_MAX = 3500`, `_URL_MAX = 500`, `_URL_SKIP = "-"`, `_SLUG_MAX = 40`.
  - Item URLs must start with `https://` or `http://` (unless skipped with `"-"`).
- **Section Formatting Toolbar (`section_editor_btn`)**:
  - `rules_fmt:divider` immediately appends `\n---\n`.
  - `bold` (`**text**`), `italic` (`*text*`), `code` (`` `text` ``), `list` (`- line`), `plain` prompt for text and append to the item body.

### Markdown Parser (`rules_markdown.py`)
- `parse_document(text, filename="rules.md")`:
  - `category_key` = filename stem; default `category_title` = stem with `-` -> space, `.title()`.
  - H1 (`# ...`) sets `category_title` and resets current item title.
  - H2-H6 (`## ...` etc.) starts a new item titled `"{category_title}: {heading}"`.
  - Horizontal rules (`---`, `***`, `___`) normalize to `"---"`.
  - Empty items (no content) are skipped.
- `parse_description(text)`: extracts non-empty lines between H1 and the first H2+ heading.
- On upload (`on_markdown`): validates `.md` extension, decodes UTF-8, creates category if missing, updates category description, deletes existing draft items for that `category_key` (`delete_draft_category_items`), and inserts parsed items.
- `render_body(body)` / `_inline(text)`: converts `---` to divider, `-`/`*`/`+`/`1.` to `<p>` bullet/numbered lines, `[label](url)` to escaped label, `` `code` ``, `**bold**`, `*italic*` / `_italic_` to rich HTML.

### Channel Publication (`rules_publish.py` & `messages/rules.py`)
- Requires `cfg.main_channel != 0` (raises `RuntimeError` otherwise).
- Calls `rules_db.runs.reclaim_expired()` (reclaims `running` rows older than 300s lease as `failed`) and `rules_db.runs.acquire(set_id, version_id, cfg.main_channel)` (guarded by partial unique index on `(rule_set_id, chat_id)` where `status = 'running'`).
- Renders all items into parts via `render_channel()` (`CHANNEL_LIMIT = 4000` UTF-16 code units, `COMBINED_CATEGORY_KEY = "all"`), appending ` ({i+1}/{n})` when split and `v{version_number} - {published_at}` footer on the last part.
- Commits `promote_version(version_id, user_id)` to DB **before** calling Telegram APIs.
- For each part: computes SHA-256 `content_hash(text)`, calls `publications.upsert_slot(...)`, skips edit if `previous_hash == digest` and `message_id` exists, edits via `safe_edit_message` if `message_id` exists and hash changed, or sends fresh via `send_text` if missing/deleted. Marks `mark_synced` or `mark_failed(..., missing=...)`.
- Calls `publications.retire_unused(set_id, content_locale, keep_ids)` and `runs.finish(run_id, status)` (`"completed"` or `"partial"`, or `"failed"` on exception).

### Shared Moderation Rules Picker (`rules_picker.py`, `buttons/rules.py`)
- Used across Ban (`WAITING_BAN_RULES = 2`, `WAITING_BAN_RULES_NOTE = 3`), Kick, Mute, and Warn (`mod_action_steps.py`).
- Skipped automatically if there are no published rules or the user lacks `rules.view` permission.
- Callbacks:
  - `rules_step:pick:<id>`: toggle item ID in scope.
  - `rules_step:other`: prompt for custom "Other" note.
  - `rules_step:done`: finalize selection and proceed to proof step.
  - `rules_step:clear`: clear selected item IDs.
  - `rules_step:cancel`: cancel moderation flow.
- Selected rule IDs are linked to the moderation case via `moderation_db.link_case_rules()`.

---

## 2. Greeting & Join-Time Enforcement (`tcbot/modules/greeting.py`)

### Concurrency & Federation Check
- Uses a single module-level `_join_sem = asyncio.Semaphore(10)` (`_MAX_CONCURRENT_JOINS = 10`) across all concurrent join updates.
- `_in_federation(chat_id)`: returns `True` for `cfg.is_primary_group(chat_id)`, else `db.groups_db.is_connected(chat_id, fresh=True)`. Returns `None` on DB outage so callers still run ban/mute checks and fail closed.

### Handlers
1. **`on_new_member` (`filters.new_chat_members`)**:
   - Skips if `_in_federation(...) is False`.
   - Resolves chat locale once for the batch (`locale_for_chat(chat)`).
   - Processes each non-bot member under `_join_sem` via `_handle_member(..., greet=is_primary)`:
     - Gathers in parallel: `harvest_user_identity`, `_ban_state_with_retry(member.id)` (1 retry after `0.1s`), `get_active_mute(member.id)`.
     - **Fail-closed on ban lookup error**: calls `_fail_closed_join` (`ban_chat_member` + immediate `unban_chat_member`) and returns without greeting.
     - **Mute lookup error**: sets `_enforcement_blind = True` (suppresses welcome).
     - **Active ban**: calls `demote_before_enforcement(..., trigger="ban")`. If `"owner"`, skips Telegram ban. Otherwise calls `ban_chat_member` and `_send_join_ban_notices` (group notice + target DM with log/proof/appeal buttons).
     - **Active mute**: calls `demote_before_enforcement(..., trigger="mute")`. If not `"owner"`, re-applies `restrict_chat_member(ChatPermissions(can_send_messages=False), until_date=...)`.
     - **Greeting**: if `greet and not _enforcement_blind` (i.e. primary group only), attaches `_ack_markup(member.id, locale)` (when a published rule version exists and is unacknowledged by `member.id`) and sends `greeting.welcome.body`. Rule lookup errors never block the welcome.
2. **`on_join_request` (`ChatJoinRequestHandler`)**:
   - Skips bots and non-federation chats (`_in_federation is False`).
   - Skips if `get_effective_role(user.id, fresh=True) == "owner"`.
   - Harvests identity and checks `_ban_state_with_retry(user.id)` in parallel.
   - Declines join request (`decline_chat_join_request`) if banned **or** if ban lookup fails (fail-closed).
3. **`on_join_request_approved` (`CHAT_MEMBER`, `cmu.via_join_request` and `status == MEMBER`)**:
   - Re-enforces bans and mutes when a join request is approved (since Telegram emits no `new_chat_members` message).
   - Fails closed (`_fail_closed_join`) if ban lookup fails; skips Owner on ban/mute.
4. **`on_left_member` (`filters.left_chat_member`)**:
   - Primary group only; announces non-bot departure with `greeting.left.body`.
5. **`on_chat_migration` (`migrate_to_chat_id` / `migrate_from_chat_id`)**:
   - Logs `migrate_to_chat_id`; on `migrate_from_chat_id`, calls `db.groups_db.migrate_group(old_id, new_id)` to atomically repoint group records.

---

## 3. Broadcasting (`tcbot/modules/broadcast.py`)

- **Command**: `/tcbroadcast` (alias `/bc`).
- **Decorators**: `THROTTLE_FEDERATION`, `staff_only`, `log_execution`.
- **Guards**:
  - `require_federation_origin(..., allow_private=True)`.
  - **Circuit breaker**: checks `_cb.telegram.state is not CircuitState.CLOSED`; if open/half-open, refuses immediately with `broadcasting.send.circuit_busy` to prevent partial delivery.
- **Content**:
  - Accepts inline text (`parse_cmd_args(msg.text)`) or a replied-to message (`msg.reply_to_message`). Refuses if neither is present (`broadcasting.send.no_content`).
  - Inline text is escaped with `esc(broadcast_text)` before sending via `send_text` so staff cannot inject HTML markup.
  - Replied-to messages are forwarded via `msg.reply_to_message.forward(chat_id)`.
- **Delivery & Reporting**:
  - Fetches `db.groups_db.active_groups()` (refuses on error or empty list).
  - Sends initial status message (`broadcasting.send.sending`), then fans out `_send_one(grp)` across all active groups via `fan_out(...)`.
  - Every `BaseException` (including `CHAT_NOT_FOUND`) counts as `failed`.
  - Edits the status message (`broadcasting.send.done` with `ok` and `failed` counts) and sends `messages.broadcast_log(admin.id, display_name(admin), preview, success, failed)` in parallel.
