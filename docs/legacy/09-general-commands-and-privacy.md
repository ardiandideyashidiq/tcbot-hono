# Legacy General Commands, Maintenance, Network Diagnostics & Privacy

Behavioral specification derived from the legacy Python bot (`tcbot/`) for migration to `tcbot-hono/`.

All commands are matched by `build_prefixed_filters()` (`tcbot/utils/prefixes.py`) against configured prefixes (`/`, `!`, `.` by default, from `cfg.prefixes`), lowercase-only (`[a-z][a-z0-9]*`), with optional `@<bot_username>` suffix matching the authorized bot's username case-insensitively.

---

## 1. `/start` & Main Menu (`tcbot/modules/start.py`)

- **Module:** `start.py` (`__module_name__ = None`, not listed in `/help`)
- **Command:** `/start` (prefixes: `/`, `!`, `.`; no aliases)
- **Access:** Anyone
- **Throttle:**
  - `cmd_start`: `THROTTLE_READ` (`8` calls / `30.0s`)
  - Callbacks (`on_back_to_start`, `on_menu_groups`, `on_menu_groups_details`, `on_close`): `THROTTLE_CALLBACK` (`15` calls / `30.0s`)

### Behavior by Context & Deep-Link Argument
1. **Group / Supergroup (`chat.type` in `("group", "supergroup")`, including forums):**
   - Renders `_group_start_text(botname, locale)` (`start.group.body` with `title`, `divider`, `intro`, `hint`).
   - Attaches `buttons.group_start_btn(bot_username, locale)`:
     - Row 1: `open_pm_btn(bot_username, "menu", locale)` (`https://t.me/<bot_username>?start=menu`, omitted if `bot_username` is empty)
     - Row 2: Help button (`callback_data="help_menu_group"`, `PRIMARY` / blue)
2. **Private Chat (`chat.type == "private"`) with `arg == "about"` (`/start about`):**
   - Renders `about_msg(locale)` (`panels.py`).
   - Attaches `buttons.about_sections_btn(about_section_labels(locale), locale)`.
3. **Private Chat with `appeal_<ban_id>`:**
   - Handled by the `ConversationHandler` in `appeals.py` (not `start.py`).
4. **Private Chat (default / no matching arg):**
   - Renders `_private_start_text(botname, locale)` (`start.private.body` with `title`, `divider`, `intro`, `capabilities` bullet list for bans/mutes/kicks/moderation, `usage` highlighted, `hint`).
   - Attaches `buttons.main_menu_btn(locale)`:
     - Row 1: `about_menu` (blue), `help_menu` (blue)
     - Row 2: `additional_menu` (blue), `privacy_menu` (blue)
     - Row 3: `language_menu` (blue)

### Start-Menu Callbacks
| Pattern | Handler | Behavior |
|---|---|---|
| `^back_to_start$` | `on_back_to_start` | Answers callback and edits message back to `_private_start_text` + `main_menu_btn(locale)`. |
| `^close_msg$` | `on_close` | Answers callback and deletes `q.message` via `ctx.bot.delete_messages(chat_id_of(chat), q.message.id)`. Swallows deletion errors at `DEBUG`. |
| `^(menu_groups\|menu_groups_simple)$` | `on_menu_groups` | Runs `q.answer()` and `db.groups_db.active_groups()` in parallel; renders connected groups in simple mode (`detailed=False`). |
| `^menu_groups_details$` | `on_menu_groups_details` | Same as above with `detailed=True` (shows full `chat_id` column). |

**Connected-groups error/empty handling (`_show_groups`):**
- If `active_groups()` fails: edits message with `replies.err_groups_load_failed(locale, plain=False)` and `back_to_start_btn(locale)` (never shows an empty list on DB error).
- If `groups` is empty: edits message with `t("groups.menu.empty", locale, community=cfg.community_name)` and `back_to_start_btn(locale)`.
- Otherwise: renders `render_groups(groups, detailed=detailed, locale=locale)` (truncated at `_MAX_RENDER_CHARS = 3800` chars) with `groups_menu_btn(detailed=detailed, locale=locale)` (toggle `menu_groups_details`/`menu_groups_simple` + `back_to_start`).

---

## 2. `/help` (`tcbot/modules/help.py`)

- **Module:** `help.py` (`__module_name__ = None`)
- **Command:** `/help` (no aliases)
- **Access:** Anyone
- **Throttle:** `cmd_help` uses `THROTTLE_READ` (`8` / `30s`); all help callbacks use `THROTTLE_CALLBACK` (`15` / `30s`).

### Dynamic Module Discovery (`_builder_help(locale)`)
- Iterates `ALL_MODULES` (`tcbot.modules`), imports `tcbot.modules.<mod_name>`, and calls `mod.get_help(locale)` if callable.
- Stores `content[f"help_{mod_name}"] = (h["name"], h["overview"], list(h.get("sections", [])))`.
- Topics are sorted case-insensitively by display `name`.

### Command Behavior (`cmd_help`)
- **No args:** Renders `_help_index_text(botname, locale)` (`help.index.body`) with `buttons.help_topics_btn(_topics_for_locale(locale, menu=False), locale)` (two-column topic buttons using `helpc_<slug>` + `close_msg`).
- **With args (`/help <query>`):**
  - Joins args, strips, lowercases, and looks up in `_module_map_for_locale(locale)` (maps both module slug and localized/display `name.lower()` to `help_<slug>`).
  - **Match found:** Renders `_module_text(name, overview, locale)` (`overview` passed through `rich.text.blocks()`) with `module_help_btn(section_btns, back_callback="helpc_main", locale=locale)` (or `back_to_help_cmd_btn(locale)` if no sections).
  - **Not found:** Computes up to 3 closest candidates sorted by `(query not in k, abs(len(k) - len(query)))`, renders `help.not_found.body` with `help.not_found.hint` and `help_topics_btn`.

### Help Callbacks
Two navigation paths are preserved so "Back" returns to the caller's origin:
- **Start-menu path (`is_menu_path=True`):**
  - `^help_menu$` (`on_help_menu`): Index with `help_topics_menu_btn` (includes `back_to_start` + `close_msg`).
  - `help_<mod>`: Module overview; sections use `helps_<mod>:<idx>`, Back goes to `help_menu`.
- **Command path (`is_menu_path=False`):**
  - `^helpc_main$` (`on_helpc_main`): Index with `help_topics_btn` (`close_msg` only, no `back_to_start`).
  - `helpc_<mod>`: Module overview; sections use `helpcs_<mod>:<idx>`, Back goes to `helpc_main`.
- **Group `/start` alert:**
  - `^help_menu_group$` (`on_help_menu_group`): Answers with `q.answer(t("help.group.alert", locale, plain=True), show_alert=True)` without editing.
- **Section view (`^(helps|helpcs)_\w+:\d+$`, `on_help_section`):**
  - Registered before `^(help|helpc)_\w+$` so the more-specific pattern wins.
  - Parses `<mod_slug>:<idx>`. Invalid integer -> `help.error.invalid_section` alert. Out-of-range -> `help.error.section_not_found` or `help.error.topic_not_found`.
  - Renders `help.section.body` with title `<b>{name} ➛ {label}</b>`, divider, and `blocks(section_content, command_header=..., alias_header=..., detail_header=...)`, plus `back_to_module_btn(back_module_cb, locale)`.

---

## 3. `/about` & Governance Docs (`tcbot/modules/about.py`, `tcbot/about/*`, `tcbot/acknowledge/*`)

- **Module:** `about.py` (`__module_name__ = None`, callback-only; reachable via `about_menu` button or `/start about` deep link)
- **Access:** Anyone
- **Throttle:** `THROTTLE_CALLBACK` (`15` / `30s`)

### Callbacks
| Pattern | Handler | Behavior |
|---|---|---|
| `^about_menu$` | `on_about_menu` | Renders `about_msg(locale)` (`panels.py`) with `about_sections_btn(about_section_labels(locale), locale)` (3 section buttons + `back_to_start` + `close_msg`). |
| `^about_section_\d+$` | `on_about_section` | Parses integer index `0..2`. Non-int -> `about.error.invalid_section` alert; out-of-range -> `about.error.not_found` alert. Renders `about_section_msg(idx, locale)` with `back_to_about_btn(locale)`. |

### Sections (`panels.py`: `_ABOUT_SECTIONS`)
1. `0` — `federasi` (5 bullet items + lead + tail): Voluntary federation of independent Telegram groups around Transsion devices; not a legal entity; group autonomy; cross-group bans/mutes vs per-group kicks/warns; voting for rule changes.
2. `1` — `keanggotaan` (4 bullet items + lead + tail): How groups and individuals become members; member rights (including `/checkme` and requesting data review/erasure); leaving does not end confidentiality duties or open cases.
3. `2` — `klarifikasi` (3 bullet items + lead + tail): Independent community disclaimer — no official affiliation, sponsorship, or endorsement from Shenzhen Transsion Holdings, TECNO, itel, Infinix, Carlcare, oraimo, Syinix, or related parties.

### Source Governance Documents (`tcbot/about/` & `tcbot/acknowledge/`)
- `tcbot/about/federasi.md`: Full Indonesian governance charter for TCF (definitions of TCF, Grup Anggota, Admin Federasi, Administrator, Moderator, Pengelola, Platform Komunitas, Anggota, Pengembang, Karya, Pelanggaran, Tindakan Moderasi Segera, Sanksi, Keputusan Moderasi, Keberatan, Konflik Kepentingan, Hari, Bukti; 8 enforcement principles; scope; voting rules requiring >50% of votes cast with >=50% quorum over >=7 days; 7-day notice period for stricter rules).
- `tcbot/about/keanggotaan.md`: Membership rules (3-part group admission criteria, 60-day transition for prior affiliates, start/end of membership, 30-day post-exit investigation window for prior violations, 8 member rights including `/checkme` and data deletion requests to Admin/Owner, 2 member duties).
- `tcbot/about/klarifikasi.md`: Brand independence clarification and prohibition on false claims of official affiliation (medium violation: written warning, mute up to 3 days, or restriction up to 7 days).
- `tcbot/acknowledge/persetujuan-pendiri.md`: Template for founding group admins' agreement recorded in the TCF admin coordination group.

---

## 4. `/additional` (`tcbot/modules/additional.py`)

- **Module:** `additional.py` (`__module_name__ = None`, callback-only via `additional_menu`)
- **Access:** Anyone
- **Throttle:** `THROTTLE_CALLBACK` (`15` / `30s`)
- **Behavior (`on_additional_menu`):**
  - Renders `additional_msg(locale)` (`blocks(t("additional.msg.body", locale, community=cfg.community_name))`).
  - Attaches `await buttons.additional_menu_btn(ctx.bot, locale)` (`buttons/menus.py`):
    - Resolves public links in parallel via `rich.link.resolve(bot, chat_id)` for `cfg.main_channel`, `cfg.main_group`, `cfg.appeals[0]`, and `cfg.logs[0]`.
    - Layout: Row 1: Main Channel URL (if resolved); Row 2: Discussion Group + Appeals Channel URLs (whichever resolved); Row 3: Logs Channel URL (if resolved); Row 4: `back_button("back_to_start", locale)`.
    - Unresolvable chats have their buttons omitted (no dead buttons).

---

## 5. `/language` (`tcbot/modules/language.py`)

- **Module:** `language.py` (`__module_name__ = "Language"`, registered in `/help`)
- **Commands:** `/language`, `/lang`, `/langs`
- **Access:**
  - Private chat (`scope = "user"`): Anyone (edits their own `user_locale`).
  - Group/supergroup (`scope = "group"`): Anyone can view the current group locale, but only users passing `can_manage_group(ctx.bot, chat_id, user_id)` (federation staff or Telegram group creator) receive the selection keyboard; non-permitted users get `reply_markup=None`.
- **Throttle:** `cmd_language` uses `THROTTLE_STAFF` (`10` / `30s`); callbacks use `THROTTLE_CALLBACK` (`15` / `30s`).

### Callbacks & Validation
| Pattern | Handler | Behavior |
|---|---|---|
| `^language_menu$` | `on_language_menu` | Opened from start menu; forces `scope = "user"`, renders `_panel_text("user", locale)` with `back_callback="back_to_start"`. |
| `^lang:list:(user\|group)$` | `on_lang_list` | Validates `scope == _chat_scope(chat.type)` (rejects cross-scope taps). For `"group"`, re-checks `can_manage_group(..., fresh=True)` (denies with `language.denied` alert). Re-renders option list (`back_callback="back_to_start"` for user, `None` for group). |
| `^lang:set:(user\|group):[A-Za-z]{2}(?:-[A-Za-z]{2})?$` | `on_lang_set` | 1. Checks `scope == _chat_scope(chat.type)`.<br>2. Checks `is_known_locale(raw_locale)` (else `language.unavailable` alert).<br>3. If `scope == "group"`: checks `can_manage_group(..., fresh=True)` -> checks `cfg.is_primary_group(chat_id) or cfg.is_infrastructure_chat(chat_id) or await db.groups_db.is_connected(chat_id, fresh=True)` (if false, answers ack and replies `language.not_connected`) -> calls `db.groups_db.set_group_locale(chat_id, locale)` (if `False` or raises, replies `common.retry`).<br>4. If `scope == "user"`: calls `db.settings_db.set_user_locale(user.id, locale)`.<br>5. Answers ack and edits panel to `_confirmation_text(scope, locale)` in the **newly chosen** locale with `back_to_module_btn(f"lang:list:{scope}", locale)`. |

---

## 6. `/maintenance` (`tcbot/modules/maintenance.py`)

- **Module:** `maintenance.py` (`__module_name__ = "Maintenance"`, registered in `/help`)

### Commands Summary
| Command & Aliases | Access | Throttle | Origin |
|---|---|---|---|
| `/leaveall`, `/exitall`, `/tcleave` | `@decorators.owner_only` | `THROTTLE_CRITICAL` (`1` / `300s`) | Bot PM or group |
| `/cleanup`, `/tcclean`, `/tcc` | `@decorators.staff_only` (`admin`+) | `THROTTLE_BULK` (`3` / `300s`) | Bot PM or group |
| `/tcrepair`, `/tcr` | `@decorators.staff_only` (`admin`+) | `THROTTLE_FEDERATION` (`3` / `60s`) | Bot PM or group |
| `/tcforget`, `/tcf` | `@decorators.owner_only` | `THROTTLE_FEDERATION` (`3` / `60s`) | Bot PM or group |

### Detailed Behaviors
1. **`cmd_leaveall` (`/leaveall`):**
   - Loads `db.groups_db.active_groups()` and filters out `cfg.is_primary_group(g.get("chat_id"))` (primary groups are never torn down).
   - If empty, replies `replies.err_no_connected_groups`.
   - Sends a bot-owned status message (`maintenance.status.sending`), then runs `fan_out([_leave_one(...) for g in groups])`.
   - `_leave_one` runs `bot.leave_chat(chat_id)`, `db.groups_db.deactivate_group(chat_id)`, and `send_log(bot, messages.group_disconnected_log(...))` in parallel.
   - A leave counts as `ok` only when **both** `left` and `deactivated` succeed (prevents silent "ghost" groups). Edits status message with `maintenance.leaveall.done` including `partial` and `log_failed` counts if non-zero.
2. **`cmd_cleanup` (`/cleanup`):**
   - Loads `active_groups()` and probes membership concurrently via `fan_out([_should_remove(ctx.bot, g) for g in groups])`.
   - `_should_remove`: skips primary groups (`False`), calls `bot.get_chat_member(chat_id, bot_id)` with `_MEMBERSHIP_CHECK_TIMEOUT = TELEGRAM_LOOKUP_TIMEOUT`. Returns `True` only when `status in ("left", "kicked")`. On `(BadRequest, Forbidden)` keeps group (`False`); on other exceptions re-raises so `fan_out` trips the circuit breaker.
   - Deactivates stale groups via `gather_bounded([db.groups_db.deactivate_group(...)])` (does not use `fan_out` for DB writes) and replies `maintenance.cleanup.done`.
3. **`cmd_repair` (`/tcrepair`):**
   - **No args:** Calls `db.enforcement_db.list_unsettled_runs()`. Replies `maintenance.repair.none` or `_repair_lines(runs, locale)`.
   - **With args:** Must be `/tcrepair retry <run_id> [chat_id]` (`run_id > 0`, optional non-zero `chat_id`). Calls `db.enforcement_db.redrive_run(run_id, chat_id=chat_id)`.
   - If `result.state == "queued"`: triggers `await enforcement_worker.deliver_queued_run(ctx.bot, run_id)` (errors logged, stays queued) and replies `maintenance.repair.queued`.
   - Other states (`no_failed_target`, `in_progress`, `cancelled`, `missing`) map to their corresponding `maintenance.repair.*` message.
4. **`cmd_forget` (`/tcforget <user_id> <reason>`):**
   - Parses integer `user_id > 0` and non-empty `reason` (`" ".join(args[1:]).strip()`).
   - Checks `db.users_roles.get_owner_id(fresh=True)`: **refuses** if `owner_id == user_id` (`maintenance.forget.owner` — ownership must be transferred first).
   - Calls `db.erasure_db.request_erasure(user_id, reason)` (which calls SQL `request_user_erasure(:user_id, :reason, 'operator')` into `telegram_user_erasures`) and replies `maintenance.forget.queued` with `user` and `request` IDs.

---

## 7. `/netspeed` (`tcbot/modules/netspeed.py`)

- **Module:** `netspeed.py` (`__module_name__ = "Netspeed"`, registered in `/help`)
- **Commands:**
  - `/ping`, `/p`
  - `/speedtest`, `/st` (optional flag: `full`)
- **Access:** `@decorators.owner_only`
- **Throttle:** `THROTTLE_FEDERATION` (`3` / `60s`)

### Detailed Behaviors
1. **`cmd_ping`:**
   - Records `t0 = monotonic()`, sends `netspeed.status.pinging` via `reply_rich_result`, measures `elapsed_ms(t0)`, and edits the message with `netspeed.pong.body` (`{latency}` formatted as `f"{ping_ms:.1f} ms"`).
2. **`cmd_speedtest [full]`:**
   - Checks if `"full"` (case-insensitive) is in `parse_cmd_args(msg.text)`.
   - Acquires non-blocking `_run_lock` (`threading.Lock()`). If already held, edits initial notice with `netspeed.status.busy` and returns.
   - Runs `_run_speedtest_locked(cancel, full=full)` in a dedicated single-worker `ThreadPoolExecutor` (`max_workers=1`, prefix `tcbot-speedtest`) under `asyncio.timeout(timeout_s)`:
     - Standard mode: `_SPEEDTEST_TIMEOUT = 180s`, `_DOWNLOAD_SIZES = [250, 500]`, `_UPLOAD_SIZES = [131_072, 262_144]`, `2` threads.
     - Full mode (`full`): `_SPEEDTEST_TIMEOUT_FULL = 300s`, `_FULL_DOWNLOAD_SIZES = [1000, 2000, 4000]`, `_FULL_UPLOAD_SIZES = [1_048_576, 2_097_152]`, `4` threads.
   - Uses `urllib.request` + `certifi` with `User-Agent: Ookla/1.2.0 (android; Dalvik/2.1.0/Linux; Android)` against `speedtest-config.php` and `speedtest-servers-static.php`.
   - Picks up to `_CLOSEST_SERVERS = 10` servers by great-circle distance (preferring same country when `>= 10` servers exist), pings each `_PING_SAMPLES = 2` times (`latency.txt`, expects `b"test=test"`), selects lowest latency, runs concurrent downloads/uploads, and renders 3 compact striped rich tables (Measurements, Client, Server) via `_render_result()`.
   - On `TimeoutError` or `CancelledError`, sets `cancel` (`threading.Event`) so the worker stops at the next request boundary and releases `_run_lock` in `finally`.

---

## 8. Privacy, Data Export & Erasure (`tcbot/modules/privacy.py` & `erasure_db.py`)

- **Module:** `privacy.py` (`__module_name__ = None`, callback-only; no `/privacy` command exists in the legacy bot)
- **Access:** Anyone
- **Throttle:** `THROTTLE_CALLBACK` (`15` / `30s`)

### Privacy UI Callbacks
| Pattern | Handler | Behavior |
|---|---|---|
| `^privacy_menu$` | `on_privacy_menu` | Renders `_privacy_msg(botname, locale)` summarizing stored data (Identity, Ban records, Warnings/mutes, Kick logs, Appeals, Promotion requests) + `privacy_btn(locale)` (`privacy_policy_menu`, `back_to_start`, `close_msg`). |
| `^privacy_policy_menu$` | `on_privacy_policy_menu` | Renders `_privacy_policy_index_msg(botname, locale)` + `privacy_policy_sections_btn(_section_labels(locale), locale)` (6 sections + Back to `privacy_menu` + `close_msg`). |
| `^privacy_section_\d+$` | `on_privacy_section` | Renders one of the 6 policy sections (`collect`, `why`, `access`, `retention`, `rights`, `contact`) + `back_to_privacy_policy_btn(locale)`. Invalid/out-of-range index answers with `privacy.error.invalid_section` / `privacy.error.not_found` alert. |

### Data Export & Erasure in Legacy Bot
- **Data Access / Self-Lookup ("Export"):** There is **no** automated JSON/file data export command in `privacy.py`. The privacy policy (`privacy.section.rights.item_1` and `privacy.msg.visibility`) directs users to `/checkme` (or `/check`) to view their own ban, warning, mute, and kick records.
- **Data Erasure:**
  - Users cannot self-erase via `/privacy`; `privacy.section.rights.item_2` instructs users to message a community Admin or the Owner to request review or deletion of personal data (noting that active ban records may be retained for ongoing enforcement).
  - **Operator Erasure Flow:** The Owner executes `/tcforget <user_id> <reason>` (`maintenance.py`), which calls `db.erasure_db.request_erasure(user_id, reason)` -> SQL `request_user_erasure(:user_id, :reason, 'operator')` -> inserts a row into `telegram_user_erasures` and logs `telegram.user.erasure_requested`.
  - **Scheduled Processing:** Job `user.erasure` runs every 10 minutes (`*/10 * * * *`, `timeout_seconds = 120`, `process_erasure_queue` in `database/scheduler/jobs.py`) and during daily cleanup via `sweep_pending_user_erasures(25)` -> `process_user_erasure(id)`, which anonymizes the profile, revokes live roles and moderation actions, and removes personal rows.

---

## 9. `/stats` (`tcbot/modules/stats.py` & `pipelines/stats_panels.py`)

- **Module:** `stats.py` (`__module_name__ = "Stats"`, registered in `/help`)
- **Commands:** `/tcstats`, `/tcs`
- **Access:**
  - Overview (`cmd_stats`, `stats_main`): **Anyone** (public counts: Owner, Staff total/breakdown, Users, Active Bans, Connected Chats).
  - Staff drill-downs (`stats_admins`, `stats_chats:<page>`, `stats_bans:<page>`, `stats_bans_search`, `stats_search_back`, `stats_search_cancel`, and free-text search input): **Moderator and above** (`guards.staff_access(..., min_role="moderator")`), re-checked at tap/input time.
  - Users list (`stats_users:<page>`): **Owner only** (`guards.staff_access(..., min_role="owner")`), re-checked at tap time.
- **Throttle:** `cmd_stats` uses `THROTTLE_READ` (`8` / `30s`); all callbacks and search input use `THROTTLE_CALLBACK` (`15` / `30s`).

### Callbacks & Search Flow
| Pattern | Handler | Gate | Behavior |
|---|---|---|---|
| `^stats_main$` | `on_stats_main` | Public | Renders `Stats.main` overview table + `stats_main_btn(show_staff, show_users)` + `close_msg`. |
| `^stats_admins$` | `on_stats_admins` | `moderator`+ | Renders `Stats.staff_roster` (Owner, Admins, Developers, Moderators with live identity fallback for missing names) + `stats_back_btn`. |
| `^stats_users:\d+$` | `on_stats_users` | `owner` | Paginated table (`_PAGE_SIZE = 5`) of cached users (User, ID, Username, First Seen, Last Seen) + `stats_list_nav_btn`. |
| `^stats_chats:\d+$` | `on_stats_chats` | `moderator`+ | Paginated table (`_PAGE_SIZE = 5`) of active connected groups (Group, ID, Connected By, Date, Time). |
| `^stats_bans:\d+$` | `on_stats_bans` | `moderator`+ | Clears search state; paginated table (`_PAGE_SIZE = 5`) of active bans (User, ID, Reason, Ban ID, Date, Time) + `stats_search_row`. |
| `^stats_bans_search$` | `on_stats_bans_search` | `moderator`+ | Sets `ctx.user_data[SEARCH_KEY] = True`, stores `MSG_KEY` & `CHAT_KEY`, edits card to search prompt + Cancel button. |
| `^stats_search_back$` | `on_stats_search_back` | `moderator`+ | Re-renders cached `RESULTS_KEY` or re-opens search prompt. |
| `^stats_search_cancel$` | `on_stats_search_cancel` | `moderator`+ | Clears search keys in `ctx.user_data` and returns to `stats_bans:0`. |
| Free-text (`handler_group = 5`) | `on_bans_search_input` | `moderator`+ | Active only when `ctx.user_data[SEARCH_KEY]` is set and `chat_id == CHAT_KEY`. Deletes user's query message, searches by numeric user ID (`get_active_ban`) or name (`search_by_name(..., limit=30)` -> `active_bans_for_users`), caches `RESULTS_KEY` & `stats_last_query`, and edits the panel message (with `send_text` fallback if edit fails). |
