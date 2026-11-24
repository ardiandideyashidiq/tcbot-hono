# Legacy Helpers, Rich Formatting, Callbacks, Buttons & i18n

Technical specification of the shared helper layer, rich-message transport, callback registry, button factories, and TOML localization system in `tcbot/`.

---

## 1. Context & Handler Dispatch (`helper/context.py`, `helper/handlers.py`, `helper/scope.py`)

### `Ctx` & Per-Conversation State (`helper/context.py`)
- `Ctx` wraps Kurigram's `(client, update)` into a unified dataclass with:
  - `bot` (alias of `client`), `message`, `callback_query`, `chat_member`, `chat_join_request`, `update_id`, `args`
  - Properties: `effective_user`, `effective_chat`, `effective_message`, `chat_id`, `actor_id`, `actor_fname`
  - Methods: `await ctx.bot_identity()` (cached `client.me` or `get_me()`), `await ctx.answer(text, show_alert=False)`
- **State Store:** In-memory `_states: dict[tuple[int, int], _Slot]` keyed by `(chat_id, user_id)`, guarded by `_states_lock` (`asyncio.Lock`), with:
  - `_STATE_TTL_S = 3600.0` (1 hour)
  - `_MAX_STATES = 10_000` (oldest-touched eviction)
  - `user_data = await state_for(chat_id, user_id)` and `chat_data = await state_for(chat_id, 0)`
  - `clear_state(chat_id, user_id)` drops a conversation slot.

### Handler Wrappers (`helper/handlers.py`)
- Wraps `MessageHandler`, `CallbackQueryHandler`, `ChatMemberHandler`, `ChatJoinRequestHandler`, `EditedMessageHandler`, and `ConversationHandler` (flattens `entry_points`, `states`, `fallbacks` into Kurigram handlers).
- `_wrap(callback)` builds `Ctx` and dispatches via `KeyedUpdateProcessor.do_process_update(ctx, callback(ctx))` so updates for the same `(chat_id, user_id)` conversation stay strictly ordered while other conversations run concurrently.
- Tracks active `Ctx` in `_current_ctx: ContextVar` (`current_ctx()`).

### Conversation Scope & Freshness (`helper/scope.py`)
- `flow_scope(ctx)` returns `ctx.user_data`; `clear_flow_scope(ctx, keys=...)` clears all or selected keys.
- `callback_is_current(ctx, scope, *, chat_key, message_key)` **fails closed**: returns `False` if `live_chat` or `live_msg` in `scope` are not `int`, or if `query.message.chat.id != live_chat` or `query.message.id != live_msg`.

---

## 2. Authorization Guards & Identity (`helper/guards.py`, `helper/identity.py`)

### Role Ranks & Outrank Rules (`helper/guards.py`)
- `_UNKNOWN_TIER_RANK = 99` (fail-closed: unknown tier names refuse actions).
- `required_rank(min_role)` looks up `db.users_roles.ROLE_RANK`.
- `outranks(executor_role, target_role)`: returns `True` if `target_role` is empty/None, otherwise requires `role_rank(executor_role) > role_rank(target_role)` (equal rank is refused).
- **Access & Enforcement Gates (all read roles `fresh=True` and fail closed on DB error):**
  - `staff_access(user_id, min_role)` -> `StaffAccess` (`ALLOWED`, `DENIED`, `LOOKUP_FAILED`). Owner always passes (`is_owner(user_id, fresh=True)`).
  - `enforcement_verdict(executor_id, target_id, min_role="moderator")` -> `(EnforcementVerdict, target_label)` (`ALLOWED`, `OUTRANKED`, `RANK_INSUFFICIENT`, `LOOKUP_FAILED`). Re-verified at enforcement time (post-proof window).
  - `enforcement_refusal(...)` -> localized refusal string or `None`.
  - `resolve_and_check(msg, executor_id, target_id, min_role)` -> `(executor_role, target_role)` or `(None, None)` after replying on `msg`.
  - `classify_and_check(...)` -> runs `identity.classify` and `resolve_and_check` in parallel; returns `(ident, target_role)` or `None`.
  - `recheck_executor_rank(msg, executor_id, min_role)` -> `bool` for conversation Done/Skip/Continue taps.
  - `require_federation_origin(msg, chat_id, chat_type, locale, allow_private=True)`: allows `private` only if `allow_private=True`; allows `cfg.is_primary_group(chat_id)`, `cfg.is_infrastructure_chat(chat_id)` (for groups/supergroups), or `db.groups_db.is_connected(chat_id, fresh=True)`. Fails closed on DB error.
  - `check_callback_staff` / `check_callback_executor`: refuses `is_anon_admin(admin)`, answers `q.answer()` in parallel with fresh role check, and edits message with `err_perm_expired` on failure.
  - `prompt_owner_mismatch` / `cancel_owner_mismatch` / `action_owner_mismatch`: verifies trailing `:<executor_id>` segment in `callback_data` matches `ctx.effective_user.id` (shows alert on mismatch; legacy payloads without executor segment fall through to rank check).
  - `can_demote_admin(executor_role, target_role)`: `owner` is never demotable; demoting `admin` requires `executor_role == "owner"`; lower roles use `outranks()`.
  - `banned_target_refusal(target_id, locale, log_label)`: refuses if target has an active ban (fail-closed on lookup error).

### Identity Classification (`helper/identity.py`)
- Special IDs: `TELEGRAM_USER_ID = 777000`, `ANONYMOUS_BOT_ID = 1087968824` (`is_anon_admin`).
- `IdentityKind`: `"self"`, `"this_bot"`, `"other_bot"`, `"telegram"`, `"anon_admin"`, `"owner"`, `"admin"`, `"developer"`, `"moderator"`, `"user"`.
- `classify(bot, executor_id, target_id, target_fname, target_is_bot)`: fetches `get_user_mention_data` and `get_effective_role(..., fresh=True)` in parallel; raises if role lookup fails (never degrades to `"user"`).
- `verify_not_bot(ctx, target_id, bot)` -> `bool | None` (`True` = human, `False` = bot, `None` = indeterminate); `is_proven_bot` returns `True` only when `verify_not_bot(...) is False`.
- `can_manage_group(bot, chat_id, user_id, fresh=False)`: `True` for federation staff (`is_staff`) or Telegram group creator (`status == "owner"`).
- `_REFUSE_KEYS`: per-action matrix (`ban`, `kick`, `mute`, `warn`, `unban`, `unmute`, `promote`, `demote`, `transfer`, `unwarn`, `resetwarns`) mapping to `frozenset[IdentityKind]` rendered via `refuse_message()` (`identity.refuse.<action>.<kind>`).
- `profile_note(ident, locale)` for `/check` (`this_bot`, `self`, `telegram`, `anon_admin`); `staff_notice(action, ident, community_name, locale)` for actions that proceed on staff targets.

---

## 3. Decorators (`helper/decorators/`)

Standard decorator order on handlers: `@decorators.ratelimiter(...)` outermost -> auth guard (`@decorators.owner_only`, etc.) -> `@decorators.log_execution` innermost.

### Authorization (`decorators/auth.py`)
- `owner_only`: `min_role=None`, checks `get_owner_id(fresh=True) == uid` (and refreshes `cache_effective_role(uid, "owner")`).
- `staff_only`: `min_role="admin"`.
- `mod_only`: `min_role="developer"`.
- `basic_mod_only`: `min_role="moderator"`.
- `permission_only(permission_key)`: checks `db.users_roles.has_permission(uid, permission_key)`.
- All decorators reject `is_anon_admin` (`refuse_anon_admin`), fail closed on DB error (`refuse_role_lookup`), and reply in `locale_for_update(ctx)` with `parse_mode=None`.

### Rate Limiting (`decorators/ratelimit.py`)
- **Backend:** `_AsyncRateLimiter` uses Redis sorted-set Lua script (`_RL_LUA`, key `rl:<prefix>:<uid>`) with automatic in-process `_RateLimiter` fallback if Redis is unavailable.
- **Global Limiter (`global_rate_limit_handler`, group `-1`):**
  - Owner is exempt (`_is_exempt` via cached `get_owner_id()`).
  - Callback queries: `_cbq_limiter` (`20` calls / `10.0s`, prefix `cbq`).
  - Prefixed commands (matching `cfg.prefixes`; plain chat messages are never rate-limited):
    - Staff (`moderator`+): `_cmd_staff_limiter` (`16` calls / `30.0s`, prefix `cmd_staff`).
    - Regular users: `_cmd_limiter` (`8` calls / `30.0s`, prefix `cmd`).
- **Per-Handler Throttle Presets (`@ratelimiter(throttle)`, key `h:<module>.<func>`):**
  - `THROTTLE_READ`: `8` / `30.0s`
  - `THROTTLE_CALLBACK`: `15` / `30.0s`
  - `THROTTLE_CALLBACK_DEEP`: `20` / `30.0s`
  - `THROTTLE_STAFF`: `10` / `30.0s`
  - `THROTTLE_MODERATION`: `5` / `60.0s`
  - `THROTTLE_FEDERATION`: `3` / `60.0s`
  - `THROTTLE_BULK`: `3` / `300.0s`
  - `THROTTLE_CRITICAL`: `1` / `300.0s`
  - Owner bypasses per-handler quotas; denied users receive `replies.rate_limit_text(wait, locale, plain=True)` (clamped to `>= 1s`).

### Tracing (`decorators/tracing.py`)
- `@log_execution`: binds `update_id`, `user_id`, `chat_id` to request logging context (`bind_request_context`), logs `[<func>] uid=<uid> enter` and `ok (X.Xms)` or `raised after X.Xms` at `DEBUG`, and always calls `clear_request_context()` in `finally`.

---

## 4. Target Extraction & Identity Refresh (`helper/extraction/`, `helper/targets.py`)

### Target Resolution (`extraction/resolve.py`)
- `parse_user_id_token(token)`: ASCII digits only (`-?[0-9]+`), rejects `<= 0` (group/channel IDs).
- `extract_target(ctx, args, bot, prefer_explicit=False)` priority:
  1. Reply sender (`_reply_target` via `reply_uid`, skipping `ANONYMOUS_BOT_ID` and `TELEGRAM_USER_ID`). **Override rule:** if `args[0]` is explicit (`first_arg_is_explicit`) and verifies live as a different user (`verified=True`), the explicit target overrides the reply. If `prefer_explicit=True` (read-only views like `/check`), any resolving arg (including partial name search) wins over reply.
  2. Numeric ID (fast path from `users_cache` unless `verified=True` or placeholder name; otherwise `bot.get_chat(uid)` checking `_is_private_chat`).
  3. `@username` (`bot.get_chat` -> `db.mtproto.resolve_username` -> `_cached_username_target` only when MTProto is down and `not verified`).
  4. Partial name search (`db.users_cache.search_by_name`, only when `prefer_explicit=True`).
  5. `text_mention` entity, then `mention` entity (sliced using UTF-16-LE byte offsets).
- `extract_mod_target(ctx, args, bot)` returns `((target_id, target_name), has_explicit_target)` so callers know whether `args[0]` was consumed.

### Identity Refresh (`extraction/refresh.py`)
- `_SYNC_MAX_AGE_S = 7 * 24 * 3600` (7 days).
- `sync_user_identity(bot, target_id)`: returns fresh cached `(first_name, username, last_name)` if complete and `<= 7d` old; otherwise probes `bot.get_chat`, `db.mtproto.resolve_user`, and a bounded concurrent `get_chat_member` sweep across `active_groups()` (`_RESOLVE_SWEEP_CONCURRENCY = 10`, `_RESOLVE_SWEEP_TIMEOUT = 15.0s`), then upserts `users_cache`.
- `launch_identity_refresh(bot, target_id)`: fire-and-forget background refresh via `TaskTracker("identity refresh")` gated by `identity_needs_refresh(doc)`.

### Shared Entry Sequences (`helper/targets.py`)
- `resolve_executor_target`: fetches `get_effective_role(..., fresh=True)` and `extract_target` in parallel.
- `classify_and_load_role`: runs `identity.classify` and `get_effective_role(..., fresh=True)` in parallel.
- `resolve_staff_target` / `run_staff_action`: shared entry for single-action commands (`unmute`, `unwarn`, `resetwarns`).
- `resolve_mod_target` -> `ModTarget`: shared entry for multi-step moderation commands (`ban`, `kick`, `mute`, `warn`).

---

## 5. Rich Formatting & Transport (`helper/rich/`)

Built for Telegram Bot API 10.3 rich messages (`InputRichMessage` via Kurigram `send_rich_message` / `reply_rich` / `edit_message_text`).

| Module | Exports & Purpose |
|---|---|
| `style.py` | `esc(text)` (`html.escape(..., quote=True)`), `bold` (`<b>`), `italic` (`<i>`), `underline` (`<u>`), `strike` (`<s>`), `spoiler` (`<tg-spoiler>`), `subscript` (`<sub>`), `superscript` (`<sup>`). |
| `formats.py` | `heading(text, level=2)` (`<h1>`..`<h6>`), `paragraph` (`<p>`), `quote` (`<blockquote [expandable]>` + `<cite>`), `pull_quote` (`<aside>`), `code` (`<code>`), `pre` (`<pre><code>`), `code_block` (`<pre><code class="language-...">`), `highlight` (`<mark>`), `footnote` (`<tg-reference>`), `footnote_ref` (`<a href="#...">`), `anchor`, `divider` (`<hr/>`), `line_break` (`<br/>`), `footer` (`<footer>`), `math` (`<tg-math>`), `math_block` (`<tg-math-block>`), `time_tag` (`<tg-time>`), `emoji` (`<tg-emoji>`). |
| `list.py` | `bullet_list` (`<ul><li>`), `ordered_list` (`<ol start type reversed>`), `checklist` (`<input type="checkbox">`), `details` (`<details [open]><summary>`). |
| `table.py` | `table(headers, rows, bordered=True, striped=False, compact=False, caption=None, raw_cells=False)` -> `<table ...>`. |
| `media.py` | `photo`, `video`, `slideshow` (`<tg-slideshow>`), `collage` (`<tg-collage>`), wrapped in `<figure>` with `<figcaption>` when captioned. |
| `link.py` | `link`, `user_ref`/`mention` (`tg://user?id=...`, bold if `<= 0`), `chat_id_to_link_id`, `message_link` (`https://t.me/c/...`), `appeal_deep_link` (`?start=appeal_<ban_id>`), `resolve(bot, chat_id)` (cached 300s per-chat lock, `get_chat` -> `https://t.me/<username>` or `invite_link`). |
| `text.py` | `style(text)` (passthrough), `blocks(text, command_header, alias_header, detail_header, caption)`: converts multiline plain/mini-markup text into `<p>`, `<ul>`, `<ol>`, and two-column `<table bordered>` for `<code>cmd</code>` lines; no-op if `_BLOCK_TAGS` already present. |
| `button.py` | `button()` (`<tg-button>`), convenience wrappers (`callback_button`, `url_button`, `copy_button`, `web_app_button`, `login_button`, `switch_button`, `switch_current_button`, `switch_chosen_button`, `disabled_button`), `button_row(align=left\|center\|right)`, `button_rows`, and `buttons_from_markup(reply_markup)` (all-or-nothing conversion from `InlineKeyboardMarkup`; fails if `callback_data` > 64 bytes or cell invalid). Style map: `default`->none, `blue`->`primary`, `green`->`success`, `red`->`danger`, plus `link`. |
| `msg.py` | `html_message`, `blocks_message`, `send_rich`, `send_text`, `reply_rich_result`, `reply_rich`. `_message_with_buttons` appends `<hr/>` + `<tg-button-row>`s when `buttons_from_markup` succeeds. |
| `edit.py` | `edit_rich`, `safe_edit`, `safe_edit_cb`, `safe_edit_message` (swallows `"message is not modified"`/`"hasn't changed"` as `True`; `"message to edit not found"`/`"chat not found"` as `False`), `clear_markup_cb`, `answer_alert`, `answer_ack`, `answer_and_edit`, `ack_and_render`, `cb_error_edit`, `send_log` (posts to `cfg.logs`), and payload parsers `callback_text`, `callback_text_of`, `callback_args`, `callback_args_optional`, `callback_numbers`. |

---

## 6. Message Builders (`helper/messages/`)

- **`audit_logs.py`:** `LogBuilder` fluent builder (heading + bulleted fields + dividers + `fmt_date`/`fmt_time` in UTC) and builders: `ban_log`, `ban_update_log`, `proof_caption_new` (plain text), `proof_caption_update` (plain text), `mute_log`, `unmute_log`, `kick_log`, `resetwarns_log`, `warn_log`, `unwarn_log`, `unban_log`, `appeal_received_log`, `appeal_submitted_log`, `appeal_approved_edit`, `appeal_rejected_edit`, `appeal_unban_log`, `promoted`, `demoted`, `ownership_transferred`, `promote_request_log`, `promote_approved_log`, `promote_rejected_log`, `group_connected_log`, `group_connection_rejected_log`, `group_disconnected_log`, `group_bot_removed_log`, `broadcast_log`.
- **`panels.py`:** `about_msg`, `about_section_labels`, `about_section_msg`, `render_groups(groups, detailed, locale)` (caps at `_MAX_RENDER_CHARS = 3800`).
- **`replies.py`:** `HelpEntry` TypedDict, `module_help(...)` (canonical section order: Commands, Who, Where, What, Flow, `details`, Target syntax, Examples), `applied_summary(...)` (`.empty`, `.progress`, `.progress_clean`, `.none`, `.partial`, `.full`), and localized error/permission/refusal/rate-limit helpers backed by `common.toml`.

---

## 7. Complete `callback_data` Namespace Registry

All `callback_data` payloads are capped at **64 bytes** (`_CALLBACK_MAX_BYTES = 64`). Authoritative reference: `docs/reference/callbacks.md` & `docs/reference/buttons.md`.

| Domain | Callback Patterns | Built By | Handled By |
|---|---|---|---|
| **Start / Menus** | `back_to_start`, `close_msg`, `menu_groups`, `menu_groups_simple`, `menu_groups_details` | `buttons/menus.py`, `buttons/common.py` | `start.py` |
| **About / Additional** | `about_menu`, `about_section_<n>`, `additional_menu` | `buttons/topics.py`, `buttons/menus.py` | `about.py`, `additional.py` |
| **Help** | `help_menu`, `help_menu_group`, `helpc_main`, `help_<mod>`, `helpc_<mod>`, `helps_<mod>:<idx>`, `helpcs_<mod>:<idx>` | `buttons/topics.py`, `help.py` | `help.py` |
| **Privacy** | `privacy_menu`, `privacy_policy_menu`, `privacy_section_<n>` | `buttons/topics.py` | `privacy.py` |
| **Language** | `language_menu`, `lang:list:(user\|group)`, `lang:set:(user\|group):<locale>` | `buttons/menus.py`, `buttons/language.py` | `language.py` |
| **Groups** | `groups_details`, `groups_simple` | `buttons/menus.py::tcgroups_btn` | `groups.py` |
| **Stats** | `stats_main`, `stats_admins`, `stats_users:<page>`, `stats_chats:<page>`, `stats_bans:<page>`, `stats_bans_search`, `stats_search_back`, `stats_search_cancel` | `buttons/stats.py`, `buttons/drills.py` | `stats.py` |
| **Check** | `checkme_detail:<ban_id>`, `checkme_back:<ban_id>`, `check_main:<target>`, `check_bans:<target>:<page>`, `check_ban_item:<target>:<ban>`, `check_warns:<target>`, `check_warn_chat:<target>:<chat>:<page>`, `check_kicks:<target>:<page>`, `check_mutes:<target>:<page>`, `check_appeals:<target>:<page>` | `buttons/check.py`, `buttons/drills.py` | `check_panels.py` / `check.py` |
| **Ban** | `ban_cancel`, `ban_continue`, `ban_done_proof`, `rules_step:pick:<id>`, `rules_step:done\|other\|clear\|cancel` | `buttons/ban.py`, `buttons/flows.py`, `buttons/rules.py` | `ban_actions.py`, `ban_confirmation.py`, `ban_rules_step.py` |
| **Kick / Mute / Warn** | `<action>_cancel`, `<action>_skip_reason` (unused), `<action>_skip_proof`, `<action>_done_proof`, `rules_step:*` | `buttons/flows.py`, `buttons/rules.py` | `mod_action_steps.py` |
| **Appeals** | `appeal_approve_<ban_id>[_<review_msg_id>]`, `appeal_reject_<ban_id>[_<review_msg_id>]`, `cancel_appeal` | `buttons/appeal.py` | `appeals.py`, `appeal_submit.py` |
| **Roles** | `promo_approve:<id>`, `promo_reject:<id>`, `promo_role:<role>:<target>[:<executor>]`, `promo_role_cancel:<target>[:<executor>]`, `role_change:<role>:<target>[:<executor>]`, `role_change_cancel:<target>[:<executor>]`, `demote_confirm:<target>[:<executor>]`, `demote_cancel:<target>[:<executor>]` | `buttons/admin.py` | `admins.py`, `promote_steps.py` |
| **Rules** | `rules_ack:<version>:<member>`, `rules_show:<key>`, `rules_index:<n>`, `rules_section:<n>`, `rules_prev:<n>`, `rules_next:<n>`, `rules_menu`, `rules_page:<n>`, `rules_edit_draft`, `rules_panel`, `rules_preview`, `rules_publish`, `rules_upload`, `rules_discard`, `rules_discard_yes`, `rules_discard_no`, `rules_cat:<key>`, `rules_cat_add`, `rules_cat_rename:<key>`, `rules_cat_up:<key>`, `rules_cat_down:<key>`, `rules_cat_del:<key>`, `rules_item_add`, `rules_categories` | `buttons/rules.py` | `rules.py`, `rules_editor.py` |
| **Connection** | `tc_verify_0` .. `tc_verify_5`, `tc_join`, `tc_cancel` | `buttons/flows.py` | `connect_verify.py` |

---

## 8. Localization (`i18n/`, `tcbot/utils/i18n.py`, `helper/locale.py`)

### Catalog Structure (`tcbot/i18n/{en-US,id-ID}/`)
- **Locales:** `en-US` (`DEFAULT_LOCALE = "en-US"`) and `id-ID` (`_LOCALE_ALIASES = {"id": "id-ID"}` for legacy preferences/callbacks).
- **29 TOML files per locale:** `about.toml`, `additional.toml`, `admins.toml`, `appeals.toml`, `banning.toml`, `broadcasting.toml`, `button.toml`, `checking.toml`, `common.toml`, `connecting.toml`, `demote.toml`, `disconnecting.toml`, `greeting.toml`, `groups.toml`, `help.toml`, `identity.toml`, `kicking.toml`, `language.toml`, `maintenance.toml`, `muting.toml`, `netspeed.toml`, `privacy.toml`, `proof.toml`, `reason.toml`, `rules.toml`, `start.toml`, `stats.toml`, `unbanning.toml`, `warnings.toml`.
- **Key Flattening:** `load_catalog()` loads `*.toml` per locale directory; file stem is the top-level prefix (e.g., `privacy.toml` `[section.collect]` `label` -> `privacy.section.collect.label`). All leaf values must be strings; malformed TOML or missing `DEFAULT_LOCALE` raises `I18nError(ValueError)` at load time.

### Template Engine (`tcbot/utils/i18n.py`)
- `t(key, locale=None, *, plain=False, **kwargs)`:
  - Keyword placeholders only (positional args raise `I18nError`).
  - Falls back per key to `DEFAULT_LOCALE`; missing key everywhere logs an error and returns `[key]` (escaped in rich mode).
  - **Modes:**
    - Rich mode (`plain=False`, default): HTML-escapes literal text and placeholder values (unless wrapped in `Safe(...)`), and converts mini-markup spans: `` `code` `` -> `<code>...</code>`, `*bold*` -> `<b>...</b>`, `~italic~` -> `<i>...</i>`.
    - Plain mode (`plain=True`): keeps raw text and strips mini-markup delimiters (used for `q.answer()` alerts, button labels, and `parse_mode=None` replies).
  - **Strictness:** Rejects `None` placeholder values, unbalanced backticks/asterisks/tildes/braces, empty spans, braces inside spans, nested formatting inside `*bold*`/`~italic~`, and non-bare field names (`[A-Za-z_][A-Za-z0-9_]*`).
- `display_name(locale)` reads `button.language_name` (`"English (US)"`, `"Bahasa Indonesia"`).

### Locale Resolution (`helper/locale.py` & `utils/i18n.py`)
- Precedence (`resolve_locale`):
  1. `explicit` (when passed)
  2. `user_locale` (if `chat_type == "private"`) or `group_locale` (otherwise)
  3. `community_locale` (`db.settings_db.get_community_locale()`, consulted only if tier 2 is absent/unknown)
  4. `DEFAULT_LOCALE` (`"en-US"`)
- Helpers in `helper/locale.py`:
  - `effective_locale(chat_type, user_id, chat_id)`: reads only the preference needed for `chat_type` (never raises; falls back to `DEFAULT_LOCALE` on DB error; cancellation propagates).
  - `locale_for_update(ctx)` -> `effective_locale` for `ctx.effective_chat` / `ctx.effective_user`.
  - `locale_for_user(user_id)` -> `private` tier for direct messages (ban notices, appeal updates).
  - `locale_for_chat(chat)` -> `group` tier for chat events without an actor (join/leave events).
