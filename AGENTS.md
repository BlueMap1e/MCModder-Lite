**This file MUST be written and edited in English.**

# MCModder-Lite agent notes

A trimmed hard fork of [Mcmodder](https://github.com/Charcoal-Black/Mcmodder) (AGPL-3.0).
Features that do not pull their weight (attitudes/Supabase, GIF editor, ECharts dashboards,
achievements, GTCEu, request queues, JSON import UI, structure editor, entertainment extras)
have been removed. Do not reintroduce them without an explicit request.

## Commands

```bash
npm run dev      # vite-plugin-monkey dev server; install the served script into Tampermonkey for HMR
npm run build    # vue-tsc (type check) && vite build  ->  dist/mcmodder-lite.user.js
npm run lint     # eslint src
npm run format   # prettier --write src
npm run verify   # lint + lint:config + format:check (the static local gate)
npm run check    # full gate: verify + build + public smoke + security smoke (read-only, ~2 min)
npm run smoke:public    # public-page smoke only (Chromium + GM shim, no login)
npm run smoke:security  # XSS regression only (payload injected as page text before the script)
GF_UNMINIFIED=1 npm run build   # unminified bundle for GreasyFork submission (its rules ban minified code)
```

- `npm run build` is the release gate: `vue-tsc` runs first, so type errors and unused
  locals/parameters fail it (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`).
- There is no unit test suite inside the repo. Validate with `npm run verify` + `npm run build`,
  then exercise behavior in a browser on mcmod.cn. `npm run check` chains the reproducible
  parts (static gate → build → `scripts/smoke-public.mjs` → `scripts/security-smoke.mjs`); both
  smoke scripts drive real mcmod.cn pages through Playwright with a GM shim, need no login and
  touch no site data. They report SKIPPED rather than failing when mcmod.cn's CAPTCHA blocks
  the runner (expect this on datacenter IPs). CI runs only the public-page smoke.
- Manual-only checks live in `docs/release-checklist.md` (admin sinks, editor flows, night
  mode). The editor/center E2E with a logged-in state is **not** committed: a local Playwright
  harness may exist outside the repo; it injects `dist/mcmodder-lite.user.js` into real pages
  with a GM shim. A GM shim is not Tampermonkey's sandbox (no Xray, no HttpOnly cookies, no
  cross-tab sync), so anything depending on those still needs a real-browser pass.
- The shippable artifact is `dist/mcmodder-lite.user.js` (copy into Tampermonkey).

## Working rules

- **Reuse the existing mechanism.** Each feature area has one established entry point
  (see "Where to change what"); do not add a second convention for the same job.
- **`CHANGELOG.md` is user-owned.** Never edit it unless explicitly instructed.
- Comments, config titles/descriptions, and UI copy are Chinese, matching the existing style.
- **Every setting must be read by code.** Before adding a setting, add the reader; before
  removing a feature, delete its setting from `ConfigLoader.ts` and `Settings`. Dead toggles
  that do nothing were a known regression in this fork.
- **A setting must gate its entire behavior surface — CSS included.** Rules that restyle
  site-native DOM for a gated feature (e.g. compact layouts in `base.css` targeting
  `.oredict-item-list` / `.rank-list-block`) must be scoped under a marker class that the
  feature's `run()` adds to `<html>` (see `OredictPageInit` / `RankInit`); otherwise turning
  the feature off leaves a half-applied layout that is worse than vanilla. Prefer styling the
  feature's own namespaced DOM (`.mcmodder-*`) over overriding host class names. This leak was
  inherited from upstream's 2.0.1 monolith → repo refactor, which moved feature CSS into the
  static stylesheet while gating only the JS. Note that `mcmodderUI.css` is a legacy
  appearance layer injected **unconditionally** (its `mcmodderUI` setting is dead), so the
  same rule applies inside it: any block restyling site-native DOM must carry a feature
  marker class — an unscoped oredict block there broke the vanilla list layout until it was
  scoped (fixed 2026-11-04).
- `eslint.config.ts` exemptions are closed lists (legacy `src/main.ts`, host integrations
  that cannot avoid `any`). Never add new files to silence your own code.
- `import type` is mandatory for type-only imports (`verbatimModuleSyntax`). Delete unused
  locals/parameters; the build fails on them.

## Security and performance invariants

- Treat host-page content, remote API responses and user-supplied JSON as untrusted text. Never
  build HTML from them: use text nodes / `setAttribute`, and when a string must become HTML,
  escape it at the final sink with `Utils.escapeHTML`.
- Validate URLs before writing `href` / `src` with `Utils.safeURL`; only `http(s)` and
  site-relative paths are allowed.
- Linkify user content with `Utils.linkifyTextNodes` (TreeWalker over text nodes); never
  `.html()` plus string replacement.
- `Utils.createRequest` owns error / timeout / abort handling; do not dispatch
  `GM_xmlhttpRequest` elsewhere. Request logs record URL, purpose and body size only — never
  body content.
- The script never reads or writes `_uuid` (the site's HttpOnly session cookie). Multi-account
  switching and per-account credential storage were removed on purpose (2026-11-04): the
  feature was half-dead and its risk outweighed the benefit. Multi-account is the browser's
  job (profiles / containers). `GM_cookie` is used only for `yxd_token`, and that write is read
  back and verified. Do not reintroduce account switching.
- Do not bulk-delete or rewrite CSS. Add scoped rules only, and re-check long pages plus night
  mode visually.
- Avoid full-DOM `getComputedStyle` passes. Prefilter with `[style]` and only normalize inline
  styles.
- Gate always-on observers by page / selector and give them a timeout; a document-level
  observer that lives for the whole session is a bug. **Exception — `center.mcmod.cn` is an
  SPA**: its content (including `.common-comment-block`) renders only after data fetches, so
  any gate evaluated at `main()` time misses it; the editor observer must attach
  unconditionally there (fixed 2026-11-06: the static gate left the lazy comment editor of
  the message board permanently un-themed). Same caveat applies to any future "only if X
  exists now" check. Corollary: when several defensive skips guard the same call path
  (missing-global guard + attach gate + readiness bail), re-read the whole path — each is
  correct alone, together they multiply silent-failure modes; a bail that can be permanent
  must either retry or log loudly.

## Maintenance notes (2026-11)

- **Do not bulk-delete CSS.** `base.css` (~87 KB), `mcmodderUI.css` (~34 KB) and `bbs.css`
  (~37 KB) contain legacy overrides whose deletion has broken night mode before. Remove a rule
  only with CSS-coverage evidence and a before/after screenshot of every affected page.
- `mcmodderUI.css` is injected unconditionally because the old `mcmodderUI` setting was
  removed. Treat it as the skin; scope structural rules with a marker class instead of
  reintroducing a global toggle.
- `ItemTabInit` is not dead: `canRun()` returns false, but `ItemPageInit` and
  `OredictPageInit` instantiate it directly. Never delete a file based on `canRun()` alone.
- Global keyboard shortcuts must return early when the event target is an `input`,
  `textarea`, `select` or `isContentEditable`; otherwise they swallow native Ctrl+A/C/Z on
  every page where the owner is mounted.
- Editor enhancements must be defensive: editor globals / UEditor DOM may be absent on 404 or
  restricted pages. Guard `editor`, wrap `init()` in try/catch, and skip rather than throw.
- Changing a setting's `value:` default only affects users who never toggled it — persisted
  settings win. Say so when reporting such a change; forcing everyone over needs a one-off
  migration, which also overrides the choice of people who wanted the old default.
- `uploadFileButton` rides on the site's **undocumented** UEditor endpoints (`uploadfile` /
  `listfile`); if the site changes them the button fails silently. It is off by default, and
  `Values.ueditorFileAccept` must list every extension the setting description promises.
- Deferred cleanup (do not start without a plan): zero-reference `Utils` helpers / `Values`
  data, splitting `ConfigLoader` / `Utils` / `Values`, per-page CSS or bundle splitting.
  The 2.4 MB bundle costs ~16 ms eval on desktop and ~84 ms at 4x CPU throttle; splitting
  mainly helps low-end devices and adds loading / debugging complexity.
- Known verification gaps: admin pages need a separate `admin.mcmod.cn` login state; `yxd_token`
  HttpOnly is unverified. Treat these as open, not as design decisions.

## Host-page constraints

- The script runs at `document-start` inside mcmod.cn pages. Host globals (`$`/jQuery,
  `editor`, `swal`, `PublicLangData`, `echarts`, ...) are declared in `src/Mcmod.d.ts` but
  only exist on real pages: touch them only inside `Init.run()` or event callbacks, never at
  module scope. Nothing in `src/` runs under plain Node.
- GM APIs go through the `$` alias (`import { GM_getValue } from "$"`,
  `vite-plugin-monkey/client`). Never use `localStorage`/`sessionStorage` for app data.
- All network traffic goes through `Utils.createRequest` (rate limit via
  `minimumRequestInterval`, log to `mcmodderLogger`, automatic `yxd_token` retry). Never call
  `GM_xmlhttpRequest` directly.
- External libraries:
  - No `@require` / CDN script: every third-party library is bundled at build time, so installing
    the userscript fetches no remote code. Add new libraries through `package.json` + `import`,
    never through `@require`.
  - Bundled npm libs: `codemirror` (v5), `js-beautify`, `vue`, `dexie`, `diff`, `dompurify`,
    `pinyin-match`, `turndown`, `turndown-plugin-gfm`.
  - mcmod.cn's own libraries: jQuery, SweetAlert (`swal`), Bootstrap, UEditor (`editor`),
    ECharts (`echarts`, only read by the class-page radar fix). Use page globals.
  - Do not upgrade the intentionally old pins (jQuery, SweetAlert) or swap host libraries for
    npm packages; compatibility with the legacy site is the reason for both.

## Where to change what

- **Page-specific feature** -> new `Init` subclass in `src/init/` (`canRun()` = URL/DOM gate,
  `run()` = DOM work), registered in `src/loader/InitLoader.ts`. Never put page logic in
  `src/main.ts`.
- **SPA-like pages** (center, admin) -> sub-inits in `src/init/center/` / `src/init/admin/`
  dispatched by `MutationObserver`, following `CenterInit` / `AdminInit`. `AdminBaseInit`
  subclasses are matched by their `h1.title` and run on every navigation: repeatable
  rendering in `run()`, one-time listeners/timers in `firstRun()`.
- **Editor behavior** -> `src/ueditor/`: `UEditor` (DOM unwrap, styles, table-wall
  normalization, dialog styling) and `AdvancedUEditor` (Markdown/HTML editors, stats,
  autolink, tools). `Mcmodder.editorLoad()` instantiates them; there is no `Init` subclass
  for the editor.
  - **Table-wall watchdog invariants** (`UEditor.init` / `scheduleBodySync`):
    `contentChange` and the body `MutationObserver` are "content really changed" signals and
    must call `scheduleBodySync(true)`; `selectionchange` and the 1.5 s watchdog must call
    `scheduleBodySync()` so they only run the cheap, idempotent trailing-paragraph check.
    `updateEditorStats()` serializes the whole body and forces layout — never call it from the
    cheap path.
  - `ensureTrailingParagraph()` must return whether it changed the DOM, must be idempotent,
    and must **not** rebuild the trailing paragraph's `innerHTML` (UEditor bookmarks/caret
    live there). Add a `<br>`, strip `nowrap` declarations, leave other nodes alone.
- **New setting** -> add the key to `Settings` (`src/types/types.d.ts`), register it with an
  `add*Config` call in `src/loader/ConfigLoader.ts` (id, title, description, default, optional
  `visible`), and reuse the matching control in `src/vue/components/input/`. Add the reader in
  the same change.
- **Persisted state** -> `ConfigRepository` (`getSettings`/`setSettings`, reactive
  `getSettingsRef`/`get*WritableRef`, number-list variants, `*Profile` per uid, `*Class` per
  classID). Prefer it over raw `GM_*Value` calls for keys it covers.
- **Reactive/storage-cached keys** -> register with `StorageBuffer.addCacheableItem` in
  `src/loader/StorageBufferLoader.ts`; global config-to-behavior watchers (night mode, page
  width) live in `Mcmodder.watchRef()`.
- **Scheduled tasks** -> `src/schedulerequest/` (only auto check-in remains). Add a
  `ScheduleRequestType` in `src/schedulerequest/types/` and register it in
  `src/loader/ScheduleRequestLoader.ts`.
- **JSON storage layer** -> `src/jsonframe/repository/` (`ItemRepository`: GM storage vs
  Dexie/IndexedDB, switched by the `itemRepository` setting under 数据存储). It feeds the
  auto-link local search in `src/vue/components/AutoLink.vue`; the JSON import UI that used to
  live next to it is gone.
- **Vue components** -> not an SPA: mount ad hoc into host DOM nodes with
  `createApp(Component, { parent: mcmodder })`; components take a `parent: Mcmodder` prop.
  Read the vendored skills under `.agents/skills/` before Vue work.
- **Plain-DOM widgets** -> `src/widget/*` (`MainText`, draggable/compare frames,
  `Swiper`, `TimerUtils`). **Editable tables** -> `src/table/*`, command/undo pattern
  (`Command` + `src/table/command/`). **Field indexes** -> `src/fieldindex/`.
- **Popovers** (`Popover`-rooted components mounted outside the Vue tree) ->
  `src/widget/popover/`: `PopoverController.ts` is the type-agnostic machinery,
  `InputListPopoverController.ts` is the remaining singleton subclass. The Vue side is shared
  through `src/vue/composables/usePopoverHost.ts`.
- **Global CSS** -> `src/css/*.css`, collected by `src/loader/StyleLoader.ts` into the
  `--mcmodder-*` palette plus one injected `<style>`. Component CSS is auto-collected by the
  `cssSideEffects` hook into `<style data-mcmodder-vue-css>`. UEditor dialog iframes get the
  same `parent.css` injected (see `UEditor.attachDialogStyleListener`) after their `<html>` is
  tagged with the `mcmodder-ueditor-dialog` marker class; dialog-specific rules live in
  `base.css` scoped by that class.
- **`bbs.css` is not in `StyleLoader`.** It is imported raw by `src/main.ts` and injected only
  when `initBbsDarkMode()` runs (bbs domain + `bbsNightMode` on). Rules in it never apply on
  the main site — night rules for main-site DOM belong in `base.css`. Misplacing them is silent:
  the rule simply does nothing (that is how the homepage splash text stayed unreadable at night).

## Key files

- `src/main.ts` — `document-start` bootstrap: anti-flash overlay, `bbs.mcmod.cn` night mode,
  waits for host jQuery, then constructs `Mcmodder`.
- `src/Mcmodder.ts` — composition root: services, `InitLoader`, `StyleLoader`, `main()`.
- `src/loader/*` — `ConfigLoader`, `StyleLoader`, `StorageBufferLoader`,
  `ScheduleRequestLoader`, `MenuCommandLoader`, `InitLoader`.
- `src/config/` — `ConfigUtils` (option registration) and `ConfigRepository` (typed GM-storage
  facade).
- `src/StorageBuffer.ts` — GM key -> Vue `shallowRef` cache with cross-tab sync via
  `GM_addValueChangeListener`.
- `src/types/types.d.ts` — global types: `AppStorage`, `Settings`, `Profile`, `Class`, `Item`,
  table types; `src/types/props.d.ts` / `emits.d.ts` hold component contracts.
- `src/Values.ts` — constants: hostname, asset URLs, menu commands, defaults.
- `src/editrule/` — item/class/tab edit rules used by the editor init flow.

## Versioning and release

- Bump `version` in both `package.json` and `vite.config.ts` (userscript metadata) together.
- Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` (user-owned; only with explicit
  instruction); the release job extracts that section into the GitHub release notes — the
  version in the section title must match `package.json`, or the extraction finds nothing.
- CI (`.github/workflows/build.yaml`) builds every push. A commit message containing
  `[release]` uploads `dist/mcmodder-lite.user.js` and creates tag `v<version>` (suffixed
  `_N` if the tag already exists).
