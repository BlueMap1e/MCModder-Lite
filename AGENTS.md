**Language: English by default** — it is what agents read, and it keeps the mixed
code/identifier/path text unambiguous. Chinese is fine where the text quotes site/UI copy;
keep code identifiers and paths verbatim.

# MCModder-Lite agent notes

**Objective function — read this first.**

**The user's requirement is the goal. Everything below is defaults, facts and guardrails.**

- When a default conflicts with the requirement, execute the requirement and state the
  deviation in the deliverable. **Never silently downscale a requirement** — either
  implement it, or come back with the tradeoff and let the user decide.
- Drafts are cheap: build + on/off screenshot + show. **Commits only after user approval.**
  Full gates run once, after the user signs off, before a release. Breaking a draft and
  fixing it in the next screenshot round is the expected loop, not a violation.
- Timidity is a failure mode. Moving fast on the requirement outranks procedural caution;
  the defaults below exist to prevent _released_ damage, not to slow down drafts.
- Do not touch anything the user has frozen; when frozen, wait for the trigger.

A trimmed hard fork of [Mcmodder](https://github.com/Charcoal-Black/Mcmodder) (AGPL-3.0).
Removed modules (attitudes/Supabase, GIF editor, ECharts dashboards, achievements, GTCEu,
request queues, JSON import UI, structure editor, entertainment extras) stay removed unless
the user explicitly asks. Campaign histories, closed campaigns and post-mortems live in
`Repos\PROJECT-HISTORY.md` (next to HANDOFF.md, outside the repo).

## T0 — hard red lines (never violate; everything else is a default)

1. **Injection safety**: host-page content, remote responses and user JSON are untrusted.
   Never build HTML from them (text nodes / `setAttribute`; `Utils.escapeHTML` at the final
   sink). Validate URLs with `Utils.safeURL` before writing `href`/`src`.
2. **Identity**: never change the userscript `namespace`
   (`https://github.com/BlueMap1e/MCModder-Lite`) — it orphans every install's settings.
3. **Upstream boundary**: `Charcoal-Black/Mcmodder` is read-only — never merge; nothing
   lands in upstream space (push / PR / issue / comment) without the user's explicit
   instruction.
4. **No cross-repo issue references** in commit messages (`owner/repo#N`): GitHub's push
   scan posts a permanent `referenced` event that survives force push. Write 「上游 issue N」.
5. **Never read or write `_uuid`**; multi-account stays out (the browser's job).
6. **No `@require`, no runtime remote loads** — everything bundles at build time
   (`package.json` + `import`).

## Commands

```bash
npm run dev      # vite-plugin-monkey dev server; install the served script into Tampermonkey for HMR
npm run build    # vue-tsc (type check) && vite build  ->  dist/mcmodder-lite.user.js
npm run lint     # eslint src
npm run format   # prettier --write src
npm run verify   # lint + lint:config + format:check + cycle gate (the static local gate)
npm run check    # full gate: verify + build + public smoke + security smoke (read-only, ~2 min)
npm run test:logic  # logic tests for pure-decision modules (139 assertions, plain node via tsx, no site)
npm run smoke:public    # public-page smoke only (Chromium + GM shim, no login)
npm run smoke:security  # XSS regression only (payload injected as page text before the script)
GF_UNMINIFIED=1 npm run build   # unminified debug bundle (debug only)
```

- `npm run build` is the release gate: `vue-tsc` runs first, so type errors and unused
  locals/parameters fail it (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`).
- No browser/unit test suite; DOM behavior is validated by smokes + real-page exercise.
  **Pure-decision logic has logic tests** (`npm run test:logic`): real-body `.ts` suites in
  `scripts/logic-tests/`, run by `tsx` (the `"$"` virtual module resolves through
  `tsconfig.test.json` → `scripts/test-stubs/monkey-client.mjs` GM stub — stubs only allow
  loading). Suites live there, NOT in `src/`: `src/` stays browser-pure (no module-scope
  `window`/`document`, no unguarded `import.meta.glob`).
- Manual-only checks live in `docs/release-checklist.md` (admin sinks, editor flows, night
  mode). The logged-in E2E harness is **not** committed (lives outside the repo); a GM shim
  is not Tampermonkey's sandbox (no Xray, no HttpOnly cookies, no cross-tab sync) — anything
  depending on those still needs a real-browser pass.
- The shippable artifact is `dist/mcmodder-lite.user.js` (copy into Tampermonkey).

## Technical facts (how the code and site actually behave)

- `ConfigRepository.getSettings` returns the live cached object (StorageBuffer shares one
  array/object per key) — in-place mutation corrupts the cache; copy first
  (`[...arr].reverse()`).
- `Utils.addStyle` injects CSS through jQuery `.html()`, which parses the text as HTML — a
  literal `<style>` string would split the stylesheet in two. Refer to tags in prose as
  "style 元素".
- `ItemTabInit` is instantiated directly by `ItemPageInit` / `OredictPageInit` even though
  `canRun()` returns false — `canRun()` alone never proves a file dead.
- Editor globals / UEditor DOM may be absent on 404 or restricted pages — guard `editor`,
  wrap `init()` in try/catch, skip rather than throw.
- Changing a setting's `value:` default only affects users who never toggled it — persisted
  settings win. Forcing everyone over needs a one-off migration.
- The cycle gate (`scripts/check-cycles.mjs`, verify's 4th step): a cycle is benign iff at
  least one edge is a pure `import type`; all-value-import cycles fail the gate.
- The shipped bundle is ~1.6 MB; `?raw` CSS is comment/whitespace-stripped at build by the
  `minifyRawCss` plugin in `vite.config.ts` — deliberately NOT esbuild CSS minify, whose
  cross-position rule merging rewrites cascade order.
- The script runs at `document-start` inside mcmod.cn pages. Host globals (`$`/jQuery,
  `editor`, `swal`, `PublicLangData`, `echarts`, ...) are declared in `src/Mcmod.d.ts` but
  only exist on real pages, so they are touched inside `Init.run()` / event callbacks, not
  at module scope. Nothing in `src/` runs under plain Node.
- App data lives in GM storage through the `$` alias (`import { GM_getValue } from "$"`,
  `vite-plugin-monkey/client`); `localStorage`/`sessionStorage` belong to the host page
  realm, not to the script.
- All network traffic goes through `Mcmodder.web.createRequest` (`WebFetchUtils`; rate
  limit via `minimumRequestInterval`, log to `mcmodderLogger`, automatic `yxd_token`
  retry) — a raw `GM_xmlhttpRequest` silently loses all three. `GM_cookie` is used only
  for `yxd_token` (write is deliberately `httpOnly: false` — site-native shape; see
  `WebFetchUtils.ts`).
- Host pages ship different jQuery versions (measured: homepage 1.8.2, `/tools/cbcreator/`
  1.7.2, list pages 2.1.0) — shared code stays jQuery-1.7-compatible. mcmod.cn's own
  libraries (jQuery, `swal`, Bootstrap, UEditor, `echarts`) are the API; they are not
  replaced with npm packages.
- `pangu` is evaluated inside the content iframe: its `spacingPage` XPath binds to the
  evaluating realm's global `document`, so a bundled module would silently space the wrong
  document.
- Dynamic `import()` requires `inlineDynamicImports` (already set in `vite.config.ts`) —
  without it the dynamic chunk becomes a separate file a single-file userscript cannot
  carry. The GM-shim harness cannot reproduce this; loading-structure changes get clicked
  once on a real machine.
- Site-JS-rendered DOM (verify.html lists, center pages, editor surfaces) may not exist when
  the script starts — poll for readiness (300ms × 20 pattern, see `callEditor` /
  `pollCompacted`) before structural DOM changes; inject style only after the structural
  change succeeded.
- `center.mcmod.cn` is an SPA: content renders only after data fetches, so observers there
  attach unconditionally (no `main()`-time gating). When several defensive skips guard the
  same call path, re-read the whole path — each is correct alone, together they multiply
  silent-failure modes.

## Working defaults (deviate when the requirement demands; state the deviation)

- **User-facing text** (comments, config titles/descriptions, UI copy) is Chinese,
  matching the existing style.
- **`CHANGELOG.md` is the public release history**: user-facing behavior changes only — no
  internal process or decision narrative (HANDOFF / PROJECT-HISTORY / commit messages).
  Version bumps, release timing and the announcement post stay the user's call.
- **Settings discipline**: every panel key is read by code (dead toggles were a known
  regression); new user-visible features default ON but are killable; bug fixes, startup
  plumbing and security pipelines may be unswitched — a tweak too small for a key gets a
  "deliberately unswitched" comment.
- **A setting gates its entire behavior surface — CSS included.** Rules that restyle
  site-native DOM for a gated feature are scoped under a marker class that the feature's
  `run()` adds to `<html>`; prefer styling the feature's own namespaced DOM (`.mcmodder-*`).
  `mcmodderUI.css` is the legacy skin layer (gated by `mcmodderUISkin`, default on; contains
  no night rules).
- `eslint.config.ts` exemptions are closed lists — new files don't get added to silence
  code.
- Refactoring is allowed when the task calls for it; keep the diff explainable by the task.
- `import type` for type-only imports (`verbatimModuleSyntax`); unused locals/parameters
  fail the build.
- Default: no bulk CSS deletes — deviate with CSS-coverage evidence and before/after
  screenshots of every affected page (`base.css` ~114 KB / `mcmodderUI.css` ~34 KB /
  `bbs.css` ~53 KB carry legacy overrides that have broken night mode before).
- **Global CSS rules are page-density multipliers** — a rule touching element classes
  (`.btn`, `.form-control`, `.col-lg-6`, bare `input`) fires on EVERY page. Enumerate the
  page types a rule touches; single-page exemptions use compound selectors with a comment
  naming the page. Layout flips go through the draft-screenshot loop, which surfaces
  night-mode fallout before release.
- **Informational text walls on site pages (banners, notes, usage hints) are condensable
  or removable under an opt-in gate** — they are content, not workflow. The workflow
  red line protects functional controls, not text.
- Avoid full-DOM `getComputedStyle` passes; prefilter with `[style]`.
- Gate always-on observers by page / selector and give them a timeout (the SPA exception
  is in Technical facts).
- Global keyboard shortcuts return early when the target is an `input`, `textarea`,
  `select` or `isContentEditable` (otherwise native Ctrl+A/C/Z get swallowed). Before
  picking a shortcut, check browser menu accelerators and site-native bindings; prefer
  taking over a site-native documented key via capture phase.
- **Warnings for destructive actions belong ON the destructive action, shown once**;
  persisted one-time hints / hover text / setting descriptions are the passive channels;
  recurring modals are the last resort.
- `uploadFileButton` rides on undocumented UEditor endpoints (`uploadfile`/`listfile`) —
  fails silently if the site changes them; off by default;
  `Values.ueditorFileAccept` lists every extension the description promises.
- **Night-mode icon fixes on bbs use CSS mask + inline data-URI SVG** (no FontAwesome sheet
  there; GIF/PNG sprites are 1-bit hard transparency): `::before` with
  `mask: url("data:image/svg+xml;utf8,...") center / contain no-repeat` +
  `background-color: currentColor`, hand-drawn SVGs on a unified bounding box. Avoid flex
  on containers that also hold non-item children.
- Conventions live here (rules) and in HANDOFF.md (environment facts) — a rule recorded
  anywhere else is a rule nobody can find. **Adding a rule retires an old one** — this file
  does not grow.

## Where to change what

- **Page-specific feature** -> new `Init` subclass in `src/init/` (`canRun()` = URL/DOM gate,
  `run()` = DOM work), registered in `src/loader/InitLoader.ts`. `src/main.ts` is the
  bootstrap — page logic lives in Init subclasses.
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
    `contentChange` and the body `MutationObserver` are "content really changed" signals →
    `scheduleBodySync(true)`; `selectionchange` and the 1.5 s watchdog → `scheduleBodySync()`
    (cheap, idempotent trailing-paragraph check only). `updateEditorStats()` serializes the
    whole body and forces layout — it stays off the cheap path.
  - `ensureTrailingParagraph()` returns whether it changed the DOM, is idempotent, and does
    not rebuild the trailing paragraph's `innerHTML` (UEditor bookmarks/caret live there):
    add a `<br>`, strip `nowrap` declarations, leave other nodes alone.
- **New setting** -> add the key to `Settings` (`src/types/types.d.ts`), add one declarative
  entry to the `settings` array in `src/loader/ConfigLoader.ts` (id, title, description, type,
  default, optional `visible`), and reuse the matching control in `src/vue/components/input/`.
  Add the reader in the same change. Internal keys may live in `Settings` without a panel row
  (precedent: `markdownIt`, `lastRequestTime`) — they still need a reader.
- **Persisted state / context-bound helpers** -> `ConfigRepository` (`getSettings`/`setSettings`,
  reactive `getSettingsRef`/`get*WritableRef`, number-list variants, `*Profile` per uid,
  `*Class` per classID, keybinding matching, class-name maps, item-type lookups). Prefer it
  over raw `GM_*Value` calls for keys it covers.
- **Network requests** -> `WebFetchUtils`: call `mcmodder.web.createRequest(...)` (see
  Technical facts for what that layer carries).
- **Pure static helpers** -> `Utils`.
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
  its own storage, decision logic and a `__logic-test.cjs` runnable with plain node.
  Host-DOM rewriting / host-element restyling breaks that contract — the coupling is what
  killed TabEditInit (PROJECT-HISTORY §四). Cross-domain data goes through GM storage —
  IndexedDB is origin-isolated. (Exemplar: `src/background/`.)
- **Vue components** -> not an SPA: mount ad hoc into host DOM nodes with
  `createApp(Component, { parent: mcmodder })`; components take a `parent: Mcmodder` prop.
- **Plain-DOM widgets** -> `src/widget/*` (`MainText`, draggable/compare frames,
  `Swiper`, `TimerUtils`). **Editable tables** -> `src/table/*`, command/undo pattern
  (`Command` + `src/table/command/`). **Field indexes** -> `src/fieldindex/`.
- **Popovers** -> `src/widget/popover/`: `PopoverController.ts` is the type-agnostic
  machinery, `InputListPopoverController.ts` is the remaining singleton subclass. Vue side
  shared through `src/vue/composables/usePopoverHost.ts`.
- **Global CSS** -> `src/css/*.css`, collected by `src/loader/StyleLoader.ts` into the
  `--mcmodder-*` palette plus one injected `<style>`. Component CSS is auto-collected by the
  `cssSideEffects` hook into `<style data-mcmodder-vue-css>`. UEditor dialog iframes get the
  same `parent.css` injected after their `<html>` is tagged with the
  `mcmodder-ueditor-dialog` marker class; dialog-specific rules live in `base.css` scoped by
  that class.
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
  facade plus context-bound helpers: keybinding matching, class-name maps, item-type lookups).
- `src/WebFetchUtils.ts` — stateful network layer, constructed once as `Mcmodder.web`.
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
  (docs-only pushes skip CI entirely). A weekly cron (Mon 05:00 UTC+8) runs both smokes as
  a site-compatibility sentry, and `workflow_dispatch` allows manual full runs. Publishing is
  restricted to `main` **push events** and waits for build + both smokes; the tag is created
  at the pushed commit (`--target`), and `release.cjs` refuses to publish unless the first
  `## [...]` heading in `CHANGELOG.md` equals `package.json`'s version. `npm run pack`
  enforces the same check.
- The literal `[release]` anywhere in a push's head commit message triggers the release job.
  Later commits touching a released version avoid that literal — `release.cjs` skips when
  the tag already exists, but keeping it out of messages keeps CI history clean.
