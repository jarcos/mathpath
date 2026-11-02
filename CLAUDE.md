# MathPath — CLAUDE.md

MathPath is an **offline Electron + React + Vite desktop app** for self-learning
maths from pre-university level up to ML/AI. Single-user, fully local: all
progress, attempts, settings and study plans live in a **SQLite** file
(better-sqlite3) in the OS user-data folder. No accounts, no runtime API keys;
the only network access is the opt-in update check.

## Core principles (do not violate)

- **Offline-first.** Never add runtime network calls or API-key dependencies. All
  lesson content is pre-generated at build time and stored in `content/`. The one
  exception is the **opt-in updater** (`src/main/updater.js`, electron-updater):
  it only reads the public GitHub Releases of `jarcos/mathpath`, only when the
  `autoUpdate` setting is on or the learner presses "Check for updates", and
  sends nothing about the learner. Don't widen it.
- **Correctness is gated.** LLM-generated maths can be wrong. Every lesson answer
  and `acceptedAlt` MUST pass `npm run verify:content` (mathjs symbolic/numeric
  checks in `src/shared/validate.js`). Run it after any content change before
  considering a task done.
- **Bilingual.** Every lesson stores English + Spanish (EN default, ES toggle via
  i18next). Text answers must not depend on one language — supply both via
  `acceptedAlt` (e.g. `yes`/`sí`).
- **Textbook depth.** Lessons are written to textbook depth with a cited
  "Sources & further reading" section (lesson schema `references` field, an array
  of `{source, detail:{en,es}|string}`). Cite real sources (Stewart, Larson,
  Salas, Strang, Polya, UOC modules, AIMA, Goodfellow, etc.).

## Commands

```bash
npm install            # deps + Electron + Pyodide core (use Node 22, see .nvmrc)
npm run dev            # launch with hot reload
npm run verify:content # mathjs-check every answer/acceptedAlt  ← run before finishing
npm run build          # production build into ./out
npm run dist           # package an installer for the current OS (see BUILD.md)
```

## Architecture

```
src/
  main/        Electron main process + SQLite data layer (db.js) + IPC handlers
  preload/     Secure contextBridge — the only renderer ↔ main channel
  shared/      validate.js — mathjs answer checker, used by BOTH app and verifier
  renderer/    React UI (Vite)
    src/
      AppContext.jsx   language + progress state, loc() content selector, theme
      lib/plan.js      adaptive 30-day scheduler (pure, testable)
      components/      MathText (KaTeX), FunctionGraph (custom SVG plotter on mathjs),
                       Exercise, ProgressBar
      pages/           Dashboard, SubjectView, LessonView
content/         per-subject lessons + subjects.json + index.js
scripts/         verify-content.mjs
sources/         math/ + ai/ source material; see sources/INDEX.md
docs/project.html  project dashboard (timeline + drag-drop kanban, localStorage)
```

- Math rendering: **KaTeX**. Graphs: **custom SVG plotter** (`FunctionGraph.jsx`)
  built on mathjs — not function-plot.
- **Light/dark theme:** state in AppContext, persisted in SQLite `settings` key
  `theme`, applied via `data-theme` on `documentElement`; light overrides live in
  `styles.css` under `:root[data-theme="light"]`. FunctionGraph picks colors by theme.

## mathjs gotchas

- Complex forms with `i` (e.g. `i^2`, `(1+i)(1-i)`) are NOT reduced and FAIL
  equivalence checks — never use i-forms in `acceptedAlt`; give the plain
  real/numeric answer.
- Matrix exercises use scalar answers (det / trace / entry) so mathjs can verify them.

## Curriculum status

**Both tracks complete** (textbook depth, all verified). 241 lessons / 972
exercises / 2151 checks passing (`npm run verify:content`).

Math ladder: algebra (20), functions (16), calculus (12), linear-algebra (23),
linear-maps (16).

AI/ML track: statistics (16, M11), ml-foundations (18, M12), neural-networks
(16, M13), deep-learning (18, M14), nlp-transformers (16, M15),
reinforcement-learning (16, M16), knowledge-representation (14, M17),
computer-vision (14, M18), ai-foundations (14, M19), active-inference (12, M20).
`ai-foundations` and `active-inference` are reading-based (text / MCQ + light
math). See `CURRICULUM.md` and `sources/INDEX.md`.

**M21 complete**: electron-builder packaging (`npm run dist` / `dist:mac` /
`dist:win` / `dist:linux`), config in `electron-builder.yml`, mac entitlements in
`build/`, reproducible-build docs in `BUILD.md`. **All milestones done.**

## Workflow rules

- Generate subject-by-subject; verify each with `npm run verify:content` before
  moving on.
- After completing any lesson or milestone, **refresh the dashboard** at
  `docs/project.html` (description, requirements, milestone timeline, kanban).
- Don't commit `node_modules` / `out`. They may have been built in a Linux sandbox;
  on macOS run a fresh `npm install` under Node 22.
- `better-sqlite3` (v13+) loads prebuilt Node-API binaries in both Node and
  Electron: never add an `electron-rebuild` step back.
- On macOS 27 the stock Electron binary (ad-hoc, linker-signed, no sealed
  resources) fails `codesign --verify --deep --strict`, and the OS moves it to
  the Trash as malware when launched. Check the signature before running
  `npm run dev`.
