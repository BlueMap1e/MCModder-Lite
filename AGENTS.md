**Language: English by default** — it is what agents read, and it keeps the mixed
code/identifier/path text unambiguous. Chinese is fine where the text quotes site/UI copy;
keep code identifiers and paths verbatim.

# MCModder-Lite agent notes

A trimmed hard fork of [Mcmodder](https://github.com/Charcoal-Black/Mcmodder) (AGPL-3.0).
Removed modules (attitudes/Supabase, GIF editor, ECharts dashboards, achievements, GTCEu,
request queues, JSON import UI, structure editor, entertainment extras) stay removed unless
the user explicitly asks.

**Upstream**: `Charcoal-Black/Mcmodder` is a read-only reference — never merge it; port
manually when needed. Nothing lands in upstream space (push / PR / issue / comment) except
on the user's explicit instruction. **Commit messages in our repos must never contain
cross-repo issue references** (any `owner/repo#N` form): GitHub's push scan posts a
permanent `referenced` event to that issue's timeline, and the event survives amend /
force push / commit deletion (empirically confirmed 2026-11-20). If an upstream issue must
be mentioned, write 「上游 issue N」 plain text. The user's own repos
(BlueMap1e/MCModder-Lite, BlueMap1e/Mcmodder) are free to operate — commits, releases,
branch pushes, rollbacks.

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
GF_UNMINIFIED=1 npm run build   # unminified debug bundle (debug only; GF channel and pack-time variant removed)
```

- `npm run build` is the release gate: `vue-tsc` runs first, so type errors and unused
  locals/parameters fail it (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`).
- No unit test suite. Validate with `verify` + `build`, then exercise behavior on real
  mcmod.cn pages. `npm run check` chains the reproducible parts; both smokes drive real pages
  through Playwright with a GM shim, need no login and touch no site data. They report
  SKIPPED instead of failing when the site's CAPTCHA blocks the runner. CI runs both smokes,
  and `release` waits for them.
- Manual-only checks live in `docs/release-checklist.md` (admin sinks, editor flows, night
  mode). The logged-in E2E harness is **not** committed (lives outside the repo); a GM shim
  is not Tampermonkey's sandbox (no Xray, no HttpOnly cookies, no cross-tab sync) — anything
  depending on those still needs a real-browser pass.
- The shippable artifact is `dist/mcmodder-lite.user.js` (copy into Tampermonkey).

## Working rules

- **Reuse the existing mechanism.** Each feature area has one established entry point
  (see "Where to change what"); do not add a second convention for the same job.
- **`ConfigRepository.getSettings` returns the live cached object** (StorageBuffer shares
  one array/object per key). Never mutate it in place — copy first (`[...arr].reverse()`).
- **Userscript metadata `namespace` must never equal upstream Mcmodder's** (upstream uses
  `http://www.mcmod.cn/`; ours is `https://github.com/BlueMap1e/MCModder-Lite`). Tampermonkey
  identifies scripts by namespace+name: a shared namespace makes installs drift and
  cross-contaminates GM storage. Do not change our namespace again — it orphans every
  existing install's settings.
- **Never put a literal `<style>` / `</style>` string anywhere in `src/css/*.css`, comments
  included.** `Utils.addStyle` injects CSS through jQuery `.html()`, which parses the text
  as HTML — a literal tag splits the whole stylesheet in two and silently kills every rule
  after it. Refer to tags in prose as "style 元素".
- **`CHANGELOG.md` is the public release history.** Edit it when the work calls for it
  (add the prepared version's section, fix wrong entries), keep the format, never invent
  entries. Version bumps, release timing and the announcement post stay the user's call.
  Entries are user-facing release notes: describe behavior changes only — no internal
  process, actors or decision narrative (audit sources, 用户裁定, testing dates belong
  in HANDOFF / commit messages, not here).
- Comments, config titles/descriptions, and UI copy are Chinese, matching the existing style.
- **Every setting must be read by code.** Before adding a setting, add the reader; before
  removing a feature, delete its setting from `ConfigLoader.ts` and `Settings`. Dead toggles
  that do nothing were a known regression in this fork.
- **New user-visible features default to ON but must be killable.** Bug fixes, startup
  plumbing and security pipelines are the only exceptions; if a tweak is too small to
  deserve a key, say so in a comment next to the code ("deliberately unswitched").
- **A setting must gate its entire behavior surface — CSS included.** Rules that restyle
  site-native DOM for a gated feature must be scoped under a marker class that the feature's
  `run()` adds to `<html>`; otherwise turning the feature off leaves a half-applied layout
  worse than vanilla. Prefer styling the feature's own namespaced DOM (`.mcmodder-*`) over
  overriding host class names. `mcmodderUI.css` is the legacy skin layer, gated by the
  `mcmodderUISkin` setting (default on) — the same rule applies inside it, and it contains
  no night rules (toggling it off is safe for night mode).
- `eslint.config.ts` exemptions are closed lists (legacy `src/main.ts`, host integrations
  that cannot avoid `any`). Never add new files to silence your own code.
- This codebase is legacy by nature: refactoring is allowed when the task calls for it —
  no blanket ban, just keep the diff explainable by the task.
- `import type` is mandatory for type-only imports (`verbatimModuleSyntax`). Delete unused
  locals/parameters; the build fails on them.

## Security and performance invariants

- Treat host-page content, remote API responses and user-supplied JSON as untrusted text.
  Never build HTML from them: use text nodes / `setAttribute`, and when a string must become
  HTML, escape it at the final sink with `Utils.escapeHTML`.
- Validate URLs before writing `href` / `src` with `Utils.safeURL`; only `http(s)` and
  site-relative paths are allowed.
- Linkify user content with `Utils.linkifyTextNodes` (TreeWalker over text nodes); never
  `.html()` plus string replacement.
- `Utils.createRequest` owns error / timeout / abort handling; do not dispatch
  `GM_xmlhttpRequest` elsewhere. Request logs record URL, purpose and body size only — never
  body content.
- The script never reads or writes `_uuid` (the site's HttpOnly session cookie). Multi-account
  switching and per-account credential storage were removed on purpose; multi-account is the
  browser's job — do not reintroduce it. `GM_cookie` is used only for `yxd_token`; the write
  is read back with `GM_cookie.list` (a mismatch is logged; the retry proceeds regardless).
  The write is deliberately `httpOnly: false` — non-HttpOnly is the site-native shape (the
  token lands via `document.cookie`, which cannot set HttpOnly); see the comment in `Utils.ts`.
- Do not bulk-delete or rewrite CSS. Add scoped rules only, and re-check long pages plus night
  mode visually.
- Avoid full-DOM `getComputedStyle` passes. Prefilter with `[style]` and only normalize inline
  styles.
- Gate always-on observers by page / selector and give them a timeout; a document-level
  observer that lives for the whole session is a bug. **Exception — `center.mcmod.cn` is an
  SPA**: content renders only after data fetches, so gates evaluated at `main()` time miss
  it; observers must attach unconditionally there. Corollary: when several defensive skips
  guard the same call path, re-read the whole path — each is correct alone, together they
  multiply silent-failure modes; a bail that can be permanent must either retry or log loudly.
- **Site-JS-rendered DOM (verify.html lists, center pages, editor surfaces) may not exist
  when the script starts.** Before any structural DOM change, poll for the target's readiness
  (300ms × 20 pattern, see `callEditor` / `pollCompacted`); inject style only after the
  structural change succeeded; on failure fall back to the native shape and log loudly.

## Maintenance notes

- **Do not bulk-delete CSS.** `base.css` (~114 KB), `mcmodderUI.css` (~34 KB) and `bbs.css`
  (~53 KB) contain legacy overrides whose deletion has broken night mode before. Remove a
  rule only with CSS-coverage evidence and before/after screenshots of every affected page.
- **Global CSS rules are page-density multipliers.** A rule touching element classes
  (`.btn`, `.form-control`, `.col-lg-6`, bare `input`) fires on EVERY page — the denser
  the form area, the bigger the blast radius. Two full rounds of regressions (2026-11-21,
  crafting-table page) came from such rules whose conflicts had been masked by the old
  two-column layout. Discipline: (a) when adding/changing a global rule, enumerate the
  page types it touches; (b) for single-page exemptions use compound selectors
  (`.col-lg-6.input-group`, `:not(.btn-link)`) with a comment naming the page; (c) flipping
  any layout default REQUIRES a full visual audit of the affected page in night mode, not
  just structural assertions — style conflicts live outside any feature gate.
- `ItemTabInit` is instantiated directly by `ItemPageInit` / `OredictPageInit` even though
  `canRun()` returns false — `canRun()` alone never proves a file dead.
- Global keyboard shortcuts must return early when the event target is an `input`,
  `textarea`, `select` or `isContentEditable`; otherwise they swallow native Ctrl+A/C/Z on
  every page where the owner is mounted.
- **Keyboard shortcuts**: before picking one, check browser menu accelerators and
  site-native bindings — mcmod.cn edit pages bind keys in **inline scripts**, so
  page-source forensics is mandatory. Prefer taking over a site-native documented key with
  a capture-phase listener over inventing a new one — a site's own key is guaranteed to
  reach the page on every machine (see the Alt+X takeover in `AdvancedUEditor.advinit`).
- Conventions live here, not in code comments or chat logs — a rule recorded anywhere else
  is a rule nobody can find. A working decision's reason lands in this file (rule) or
  HANDOFF.md (environment facts).
- **Warnings for destructive actions belong ON the destructive action, shown once.** Entry
  warnings fire on every page load for habitual users ("first creation" is per-instance, not
  per-lifetime); state-drift warnings based on HTML comparison cannot attribute who changed
  the content, so they fire on the user's own legitimate edits. Persisted one-time hints,
  hover text and setting-description copy are the passive channels; recurring modals are the
  last resort.
- Editor enhancements must be defensive: editor globals / UEditor DOM may be absent on 404
  or restricted pages. Guard `editor`, wrap `init()` in try/catch, and skip rather than throw.
- Changing a setting's `value:` default only affects users who never toggled it — persisted
  settings win. Forcing everyone over needs a one-off migration.
- `uploadFileButton` rides on the site's undocumented UEditor endpoints (`uploadfile` /
  `listfile`); if the site changes them the button fails silently. It is off by default, and
  `Values.ueditorFileAccept` must list every extension the setting description promises.
- **Night-mode icon fixes on bbs use CSS mask + inline data-URI SVG, never fonts or
  filters.** The bbs domain has no FontAwesome font sheet (probe-verified), and GIF/PNG
  sprites are 1-bit hard transparency — their anti-aliasing pixels turn into jaggies on
  dark backgrounds, so filters/scale cannot fix them. Pattern: `::before` carries the
  icon (`mask: url("data:image/svg+xml;utf8,...") center / contain no-repeat` +
  `background-color: currentColor`), so color follows the night text variable and text
  content is untouched. Keep every hand-drawn SVG on a unified bounding box — unequal
  viewBox margins read as misalignment. `minifyRawCss` string protection keeps data URIs
  intact (verified). Do not reach for flex on containers that also hold non-item children
  (a username `p` becomes a squeezed flex item — `text-align: center` + `inline-block`
  is the safe centering there).
- Deferred cleanup (do not start without a plan): splitting `ConfigLoader` / `Utils` /
  `Values`, per-page CSS or bundle splitting. Dead-file scanning lives in the e2e
  workspace as `dead-files2.mjs`; trust a "DEAD" verdict only after grepping the symbol
  repo-wide. The shipped bundle is ~1.6 MB, and `?raw` CSS is comment/whitespace-stripped
  at build by the `minifyRawCss` plugin in `vite.config.ts` — deliberately NOT esbuild
  CSS minify, whose cross-position rule merging rewrites cascade order; splitting mainly
  helps low-end devices and adds loading / debugging complexity.
  **Utils split has an upstream reference plan** (Charcoal-Black/Mcmodder dcc3692:
  request/fetch methods move to a new `WebFetchUtils`, config-related to
  `ConfigRepository`) — do NOT cherry-pick it (our Utils has diverged); port the
  structure. It also resolves the one real runtime cycle dpdm found
  (`Utils.ts ⇄ ConfigRepository.ts`, double value import). `npx dpdm src/main.ts`
  reports the cycle list: type-only cycles (closed by `import type { Mcmodder }`
  from every init/widget) are harmless runtime-wise and outnumber real ones ~20:1.

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
  - **No `@require`, no runtime remote loads**: nothing is fetched at install time or from
    the network at runtime — every third-party library is bundled at build time
    (`package.json` + `import`); never through `@require` or a runtime `<script src>`.
    Two pins to preserve: `markdown-it` stays at exact 11.0.1 and `pangu` at exact 4.0.7
    (7.2.x regressed spacing). `pangu` must keep being evaluated inside the content
    iframe — its `spacingPage` XPath binds to the evaluating realm's global `document`,
    so bundling it as a module would silently space the wrong document.
  - **Dynamic `import()` requires `inlineDynamicImports`** (already set in
    `vite.config.ts` build.rollupOptions): without it rollup emits the dynamic chunk as a
    separate file that a single-file userscript cannot carry, and at runtime the relative
    specifier 404s. The GM-shim harness cannot reproduce this (it lacks the TM bridge) —
    any change to the loading structure must be clicked once on a real machine.
  - Bundled npm libs: `codemirror` (v5), `js-beautify`, `vue`, `dexie`, `diff`, `dompurify`,
    `pinyin-match`, `turndown`, `turndown-plugin-gfm`, `markdown-it` (11.0.1, Markdown
    editor), `pangu` (4.0.7, 中英间添加空格), `markdown-it-cjk-friendly` (applied to the
    markdown-it instance in `performMarkdownIt`: fixes CommonMark emphasis failing at
    punctuation+CJK boundaries).
  - Type-aware ESLint subset: `eslint.config.ts` runs 12 curated
    `@typescript-eslint` type-checked rules over `src/**/*.ts` via `projectService`
    (high-signal only — the `no-unsafe-*`/`no-explicit-any` family is deliberately NOT
    adopted; host integrations would drown the output). Do not add those noise-family
    rules; if a new type-checked rule fires on interface-conformance `async` methods with
    no `await` (AppRepository implementations), use a scoped disable with the interface
    rationale, as in `src/jsonframe/repository/`.
  - mcmod.cn's own libraries: jQuery, SweetAlert (`swal`), Bootstrap, UEditor (`editor`),
    ECharts (`echarts`, read for night-mode re-theming on class/center/play-server pages).
    Use page globals.
  - **Shared code must stay jQuery-1.7-compatible**: host pages ship different jQuery
    versions (measured: homepage 1.8.2, `/tools/cbcreator/` 1.7.2, list pages 2.1.0). Any
    API newer than 1.7 blows up only on some hosts.
  - Do not replace mcmod.cn's own libraries (jQuery, SweetAlert, Bootstrap, UEditor) with npm
    packages: the host page's globals are the API, and their versions differ per page.

## Where to change what

- **Page-specific feature** -> new `Init` subclass in `src/init/` (`canRun()` = URL/DOM gate,
  `run()` = DOM work), registered in `src/loader/InitLoader.ts`. Never put page logic in
  `src/main.ts`.
- **Eval-time early injection** (document-start level, bypasses InitLoader) -> leaf module
  following the `earlySplash.ts` / `CodeBrushInit.ts` pattern: only the `$` alias imported,
  host-side logic injected as page-context script text in `String.raw` (no backticks, no
  `${` in the content). Justification for bypassing InitLoader lives in each module's header.
- **SPA-like pages** (center, admin) -> sub-inits in `src/init/center/` / `src/init/admin/`
  dispatched by `MutationObserver`, following `CenterInit` / `AdminInit`. `AdminBaseInit`
  subclasses are matched by their `h1.title` and run on every navigation: repeatable
  rendering in `run()`, one-time listeners/timers in `firstRun()`.
- **bbs.mcmod.cn features** -> leaf modules installed from the `main.ts` bbs branch:
  the bbs domain never constructs `Mcmodder`/`InitLoader`/`ConfigRepository`, settings
  are read raw via `GM_getValue("mcmodderSettings")`, and a missing key means the panel
  default applies (gate with `!== false` semantics). Module body goes in `src/init/`
  with a header note explaining the bypass (precedent: `BbsImageAspectFix.ts`).
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
- **New setting** -> add the key to `Settings` (`src/types/types.d.ts`), add one declarative
  entry to the `settings` array in `src/loader/ConfigLoader.ts` (id, title, description, type,
  default, optional `visible`), and reuse the matching control in `src/vue/components/input/`.
  Add the reader in the same change. Internal keys may live in `Settings` without a panel row
  (precedent: `markdownIt`, `lastRequestTime`) — they still need a reader.
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
  auto-link local search in `src/vue/components/AutoLink.vue`.
- **Self-contained feature modules** -> own top-level `src/<name>/` directory with
  its own storage, decision logic and a `__logic-test.cjs` runnable with plain node —
  **never** rewrite host DOM or restyle host elements (exemplar: `src/background/`,
  the local background pool ported from upstream ea11ab8; counter-exemplar: the
  removed TabEditInit, whose in-place page rewrite caused two rounds of style
  conflicts). Cross-domain data (settings in center, pages in www) must go through
  GM storage — IndexedDB is origin-isolated.
- **Vue components** -> not an SPA: mount ad hoc into host DOM nodes with
  `createApp(Component, { parent: mcmodder })`; components take a `parent: Mcmodder` prop.
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
  the main site — night rules for main-site DOM belong in `base.css`.

## Key files

- `src/main.ts` — `document-start` bootstrap: anti-flash overlay, `bbs.mcmod.cn` night mode,
  waits for host jQuery, then constructs `Mcmodder`.
- `src/init/CodeBrushInit.ts` — eval-time leaf module (see "Eval-time early injection"):
  code-highlight registration / preview bridge / language self-detection.
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
- Add a `## [x.y.z] - YYYY-MM-DD` section to `CHANGELOG.md` for the version being released
  (the section title must match `package.json` exactly); the release job extracts that
  section into the GitHub release notes — a mismatched title means empty notes.
- CI (`.github/workflows/build.yaml`): push triggers only when code/build paths change
  (`src/**`, `scripts/**`, configs, workflows — docs-only pushes skip CI entirely; the
  smokes hit the real site and their failures are non-deterministic under site-side rate
  limiting, so they must not run on every push). A weekly cron (Mon 05:00 UTC+8) runs both
  smokes as a site-compatibility sentry, and `workflow_dispatch` allows manual full runs.
  Publishing is restricted to `main` **push events** (scheduled/manual runs never release)
  and waits for build + both smokes; the tag is created at the pushed commit (`--target`),
  and `release.cjs` refuses to publish unless the first `## [...]` heading in
  `CHANGELOG.md` equals `package.json`'s version. `npm run pack` enforces the same check.
- The literal `[release]` anywhere in a push's head commit message triggers the release job.
  Later commits touching a released version must avoid that literal — `release.cjs` skips
  when the tag already exists, but keeping it out of messages keeps CI history clean.
