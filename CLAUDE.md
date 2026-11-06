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
npm test               # unit tests (node --test): learning rules, DB + migrations
npm run build          # production build into ./out
npm run dist           # package an installer for the current OS (see BUILD.md)
```

## Architecture

```
src/
  main/        Electron main process + SQLite data layer (db.js) + IPC handlers
               db.js — versioned migrations (PRAGMA user_version); never edit a
                 shipped migration, append a new one and cover it in test/db.test.js.
                 Before migrating it saves mathpath.db.before-vN; review cards are
                 re-synced from attempts on every start (syncCards).
                 lesson_progress.source ('manual' | 'mastery' | 'placement', v3)
                 keeps placement-test lessons out of today's study (getTodayStudy);
                 attempts.misses + mode (v4) mark answers right first time
                 (firstTry) and keep lesson-only misses (getMissesToday);
                 notes (v5): a lesson's note + bookmark, a row only while it
                 has one or the other; a reset keeps them, backups carry them
               review.js — FSRS scheduling (ts-fsrs 5.x; 6.x needs Node 24), in
                 local days; implicitReview gives FIRe-style partial credit to
                 the prerequisites of a clean review (creditPrereqs in db.js)
               rendererServer.js — loopback server for the packaged renderer
               backup.js — export / import / reset of the progress (Settings).
                 A backup is JSON: {app, format, schema, appVersion, exportedAt,
                 tables}; importProgress (db.js) replaces every table in one
                 transaction, reading only the columns this schema knows and
                 refusing values of the wrong type or cards review.js can't
                 read; `autoUpdate` stays as it is on this computer. Main
                 picks every file with its own dialogs (never a path from the
                 renderer) and saves userData/backups/mathpath-<time>-before-
                 <import|reset>.json first, keeping the newest 10. A new table
                 that holds progress must be added to BACKUP_TABLES (and to
                 TABLE_SINCE, so older backups load with it empty)
               exports.js — notes as Markdown and the page as PDF
                 (printToPDF, no backgrounds; renderer @media print styles),
                 each saved through main's own dialog
               index.js — also the text size: `zoom` setting → webContents zoom
  preload/     Secure contextBridge — the only renderer ↔ main channel
               (built as CJS: the window is sandboxed)
  shared/      validate.js — mathjs answer checker, used by BOTH app and verifier.
                 checkAnswer says why an answer is wrong (unparsed, form, common
                 mistake, set count/partial); exercise fields requireForm +
                 given (the prompt's expression, must be refused) and
                 commonMistakes. Text answers forgive accents, a plural and one
                 slip (5+ letters); verify:content checks the slip accepts no
                 other answer of the course. previewTex: the "Reads as" preview
               pygrade.js — code-exercise grader, used by BOTH app and verify:pyodide
               learning.js — review ratings + mastery rules (main AND renderer);
                 guessable answers (MCQ, yes/no) count only when right first time
               curriculum.js — prerequisite graph (renderer AND verify:content)
               planner.js — cross-subject study planner + streaks (pure)
               navigation.js — back / forward history (each view with its
                 scroll), restoreView (the `lastView` setting, reopened at
                 start; an exam or placement test reopens as its subject) and
                 pickResume ("Continue": the lesson worked on last, from
                 getRecentLessons in db.js, or the next one not completed)
               search.js — the Cmd+K index (lessons by title, section titles
                 and text in EN + ES, glossary symbols), accent-insensitive
               stats.js / sheet.js — Statistics page numbers; the subject
                 cheat sheet's display formulas and the notes as Markdown
               params.js — template exercises: `params`/`derived`/`where`,
                 `[[name]]` and `[[name|+]]` placeholders. Every template needs
                 an independent `check` or `equivalentTo`; verify:content tests
                 40 instances (answers, check, TeX rendering)
  renderer/    React UI (Vite)
    src/
      AppContext.jsx   language + progress + learning state, loc() selector, theme;
                       savePdf draws the page in the light theme while it prints
      lib/plan.js      adaptive 30-day scheduler (pure, testable)
      lib/mastery.js   per-lesson mastery level from the learning state
      lib/studyPlan.js the study goal (settings key `studyGoal`) + its lessons
      lib/pyodide.js   runs Python in lib/pyodide.worker.js (stop + 30 s timeout)
      lib/keys.js      shortcuts: ⌘K search, ⌘[ ⌘] / Alt+←→ and the mouse's side
                       buttons (App.jsx), N for the next lesson, Enter on an MCQ
                       option, ⌘/Ctrl+Enter in a code exercise; never while typing
      lib/notes.js     a lesson's note (autosaved) + bookmark; all the notes
      components/      MathText (KaTeX), FunctionGraph (custom SVG plotter on mathjs),
                       Exercise (lesson / review modes), MasteryBadge, ProgressBar,
                       SearchPalette (Cmd+K), ActivityHeatmap
      pages/           Dashboard, SubjectView, LessonView, ReviewView, PlanView,
                       PlacementView, ExamView, MapView, NotesView, StatsView,
                       SheetView (cheat sheet → PDF), SettingsView (appearance,
                       goal, backups, shortcuts, updates). After an import or a reset,
                       AppContext.reloadData re-reads everything and remounts
                       the pages (key on <main>)
content/         per-subject lessons + subjects.json + index.js. Prerequisites: the
                 previous lesson, the lesson's `prereq` box, and subjects.json
                 `requires` for a subject's first lesson; all must come earlier in
                 the curriculum order (verify:content enforces it)
scripts/         verify-content.mjs, verify-glossary.mjs, verify-code.py (CPython),
                 verify-pyodide.mjs (bundled Pyodide + in-app grader)
test/            node --test unit tests
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

**Both tracks complete** (textbook depth, all verified). 255 lessons / 1215
exercises (36 of them templates) / 6227 checks passing (`npm run verify:content`).
M35 (in progress) deepens calculus, linear-algebra and linear-maps in place, one
subject per release; calculus (v0.8.0) and linear-algebra are done. Existing exercises never change (progress
and review cards point at their ids).

Math ladder: algebra (20), functions (16), calculus (12), linear-algebra (23),
linear-maps (16), multivariable (14, M32: Taylor, partial derivatives, gradient,
directional derivatives, linearization, chain rule, Jacobian, Hessian, critical
points, convexity, gradient descent & Newton, Lagrange). ML's gradient-descent
and backprop lessons link to its gradient and chain-rule lessons.

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
- CI (`.github/workflows/ci.yml`) runs `npm test`, `npm run verify` and the build
  on every push to main and every PR; release.yml repeats them before packaging.
- Don't commit `node_modules` / `out`. They may have been built in a Linux sandbox;
  on macOS run a fresh `npm install` under Node 22.
- `better-sqlite3` (v13+) loads prebuilt Node-API binaries in both Node and
  Electron: never add an `electron-rebuild` step back.
- On macOS 27 the stock Electron binary (ad-hoc, linker-signed, no sealed
  resources) fails `codesign --verify --deep --strict`, and the OS moves it to
  the Trash as malware when launched. Check the signature before running
  `npm run dev`.
