# MathPath

> An offline desktop app to learn mathematics from pre-university level all the way to machine learning and AI.

MathPath is a single-user, fully-offline **Electron** application that teaches maths and ML as a structured ladder: it starts with pre-university algebra and climbs through functions, calculus and linear algebra into a full **AI / machine-learning track**. Lessons mix clear explanations with **worked examples**, **live graphs**, **runnable Python**, and **exercises checked symbolically** — so `1/2`, `0.5` and `2/4` are all accepted, and `(x+1)^2` matches `x^2+2x+1`.

Everything runs locally. No accounts, no telemetry, and no network unless you opt in to update checks. Your progress lives in a local SQLite file.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform: Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)
![Lessons](https://img.shields.io/badge/lessons-241-6c8cff.svg)
![Bilingual](https://img.shields.io/badge/i18n-EN%20%2F%20ES-8a6cff.svg)

---

## ⬇️ Download

Grab the latest packaged app from the [**Releases**](../../releases/latest) page.

- **macOS (Apple Silicon)** — `MathPath-*-arm64.dmg` (or `-arm64-mac.zip`). Signed with a Developer ID and notarized by Apple, so it opens normally: drag it to Applications and launch.
- **Windows** — `MathPath-Setup-*.exe` (NSIS installer), produced by CI (see [Building & releasing](#-building--releasing)). It isn't code-signed yet, so SmartScreen may warn: **More info → Run anyway**.

Prefer to run from source? See [Getting started](#-getting-started).

---

## ✨ Features

- **Two complete tracks, 241 lessons across 15 subjects.**
  - *Mathematics* — Pre-University Algebra, Functions & Pre-Calculus, Calculus, Linear Algebra & Geometry, Linear Maps & Transformations.
  - *AI & Machine Learning* — Statistics & Probability, ML Foundations, Neural Networks, Deep Learning, NLP & Transformers, Computer Vision, Reinforcement Learning, Knowledge Representation, AI Foundations & Philosophy, Active Inference.
- **Runnable Python, offline.** Computational lessons embed real snippets and code exercises (NumPy / Pandas / SciPy / scikit-learn / SymPy) that execute in-app via a bundled [Pyodide](https://pyodide.org) runtime — no network. TensorFlow/PyTorch appear as clearly-labelled static reference (Pyodide can't run them).
- **Symbol glossary + notation boxes.** Every symbol (λ, σ, ∇, …) is named; each lesson shows a "Symbols in this lesson" box, and a searchable Glossary page covers the whole curriculum — bilingual.
- **Textbook-depth lessons** with intuition, worked examples, prerequisite recall boxes, a cited "Sources & further reading" section, and live SVG function graphs.
- **Rich exercises** — symbolic short-answer (validated with [mathjs](https://mathjs.org)), runnable code exercises (graded by returned value), and conceptual multiple-choice with per-option explanations. Step-by-step solutions and hints on demand; your solved state persists.
- **Spaced review** — every exercise you solve comes back in a daily **Today's review** session just as you start to forget it, scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) and rated automatically (first try, with a hint, or after the solution). Sessions mix lessons, and a miss points you to the lesson and the prerequisites you haven't mastered yet.
- **Mastery, not checkboxes** — a lesson completes itself once you solve 80% of its exercises without opening the solution, and every lesson shows where you stand: practised, mastered or due for review.
- **My plan** — pick a goal (say, complete NLP & Transformers) and minutes per day: MathPath works out every lesson it builds on that you haven't done, spreads them over the coming days by estimated time (keeping room for reviews), and shows your finish date, today's progress towards your daily minutes, streak and activity.
- **Placement tests** — one question per lesson, no hints; the lessons you already know are marked complete so you start where you really are.
- **Subject exams** — mixed questions from across a subject, no hints, pass at 80%; every answer also counts as a review, and you get the lessons to go over.
- **Fresh numbers every time** — template exercises draw new values on each visit, in reviews and exams (with "Another like this"), so practice isn't remembering answers. Every template is verified on dozens of instances.
- **Curriculum map** — every lesson of every subject at a glance, coloured by your level; pick one to see what it builds on and what builds on it. Prerequisites also show your level inside each lesson.
- **Adaptive 30-day plan** per subject, with prev/next lesson navigation and a "resume where you left off" card.
- **Bilingual** (English / Spanish) UI *and* content, **light & dark** themes — all remembered.
- **Local-only data** — progress, attempts, review schedule, settings and plans in SQLite in your OS user-data folder.
- **Opt-in updates** — turn on "Check for updates automatically" (or press "Check for updates") on the dashboard and new versions download in the background and install on restart. It only asks GitHub for the latest release; nothing about you is sent. Off by default.

---

## 🚀 Getting started

### Prerequisites

- **Node.js 22 LTS** (22.12 or newer, see `.nvmrc`), and npm. Electron 45 requires it.
- For the in-app **Run** (Python) feature: **Python 3** with `numpy pandas scikit-learn scipy sympy` is only needed to run the content *verifier* (`npm run verify:code`); the app itself ships Pyodide and needs nothing extra.

### Install & run

```bash
git clone https://github.com/jarcos/mathpath.git
cd mathpath
npm install                  # deps + Electron + Pyodide core
npm run setup:pyodide:wheels # one-time: download the science wheels for offline Run (~130 MB)
npm run dev                  # launch with hot reload
```

`npm install` runs a `postinstall` step that copies the Pyodide core into `src/renderer/public/pyodide/`. `setup:pyodide:wheels` then fetches the NumPy/Pandas/SciPy/scikit-learn/SymPy wheels so code runs fully offline. Both folders are git-ignored. `better-sqlite3` ships prebuilt Node-API binaries for macOS, Windows and Linux, so nothing is compiled and no C++ toolchain is needed.

> **Use Node 22 (`nvm use`).** Under Node 24 the Electron download has been seen to unzip only partially. If `npm run dev` says Electron "failed to install correctly", run `rm -rf node_modules/electron && npm install` under Node 22.

### Scripts

```bash
npm run verify           # all gates: content (mathjs) + glossary + code (CPython) + code (Pyodide)
npm run verify:content   # mathjs-checks every answer / acceptedAlt
npm run verify:glossary  # glossary integrity + symbol detection
npm run verify:code      # executes every runnable snippet & code-exercise (needs the Python libs)
npm run verify:pyodide   # the same, in the bundled Pyodide with the in-app grader (needs the wheels)
npm test                 # unit tests: learning rules, database + migrations (node --test)
npm run build            # production build into ./out
npm run dist:mac         # package macOS  -> dist/*.dmg, *.zip   (builds first)
npm run dist:win         # package Windows -> dist/*.exe (NSIS)  (builds first; run on Windows)
npm run dist:linux       # package Linux  -> dist/*.AppImage, *.deb (builds first)
```

Native modules don't cross-compile and the Windows installer needs a Windows host, so multi-platform packaging is done in CI — see below.

---

## 🏗 Building & releasing

Packaging uses [electron-builder](https://www.electron.build/). The included GitHub Actions workflow (`.github/workflows/release.yml`) builds **macOS** and **Windows** (and Linux) on their native runners and attaches the installers to a GitHub Release whenever a `v*` tag is pushed:

```bash
npm version patch          # or edit package.json version
git push --follow-tags     # tag push triggers the release build for all OSes
```

Each release also carries `latest-mac.yml`, `latest.yml` and `.blockmap` files: the in-app updater reads them, so don't delete them from a release. You can also run the workflow manually from the **Actions** tab (workflow_dispatch). Bundle size note: the offline Python wheels add ~130 MB; see [`BUILD.md`](BUILD.md) for trimming, signing and reproducible-build notes.

---

## 📚 How the content works

Each lesson is a JSON file under `content/<subject>/`. Every learner-facing string is an `{ "en": ..., "es": ... }` pair; prose supports `**bold**` and LaTeX via `$inline$` / `$$display$$` (KaTeX).

**Section types:** `prose`, `example`, `graph` (`fn` plotted with the SVG plotter), `prereq` (links prior lessons), and `code` (runnable Python, or `runnable: false` static reference).

**Exercise `answerType`s:** `number`, `expression`, `set`, `text` (all mathjs-graded), `mcq` (choices with explanations), and `code` (a function graded by its returned value in Pyodide).

A curated, bilingual `content/glossary.json` powers the symbol glossary and the auto "Symbols in this lesson" boxes.

### Correctness gates

Because content is authored with LLM assistance, **everything is verified** before it ships (`npm run verify`):

1. **mathjs** — every answer parses and every `acceptedAlt` is equivalent to the canonical answer; every graph function evaluates.
2. **glossary** — structural integrity + symbol-detection across all lessons.
3. **code** — every runnable snippet (EN *and* ES) and every code-exercise reference solution is executed (CPython, restricted to the Pyodide-supported libraries) and its output/tests checked. TensorFlow/PyTorch static snippets are checked in an optional tier when those libraries are present.
4. **Pyodide** — the same snippets and solutions run again in the bundled Pyodide, graded exactly as the app grades them, so what the learner sees in-app matches the stated output.

### Adding a subject or lesson

1. Create the lesson JSON under `content/<subject>/` and reference it in `content/subjects.json`.
2. Keep all text bilingual; make answers verifiable; keep lesson and exercise ids unique.
3. Prerequisites: a lesson builds on the previous lesson of its subject, on the lessons its `prereq` box links to, and (for a subject's first lesson) on the subjects in that subject's `requires`. They must come earlier in the curriculum order — `verify:content` checks it.
4. Run `npm run verify`.

**Template exercises.** A `number`, `expression` or `set` exercise becomes a template with `params` (e.g. `{ "a": { "int": [2, 9] } }`), optional `derived` values and a `where` condition (mathjs), and `[[a]]` / `[[a|+]]` (signed term: "+ 3", "- 2") anywhere in its text, answer and solution. It must also give an independent `check` (a mathjs condition over the parameters and `answer`) or `equivalentTo` (an expression the answer must equal, e.g. `derivative('[[a]]*x^[[n]]', 'x')`). `verify:content` checks 40 instances of each. See `src/shared/params.js`.

---

## 🗂 Project structure

```
src/
  main/        Electron main process + SQLite data layer (versioned migrations) + IPC handlers
               + review.js (FSRS scheduling)
               + rendererServer.js (loopback server for the packaged renderer)
  preload/     Secure contextBridge (the only renderer ↔ main channel)
  shared/      validate.js (mathjs checker) · notation.js (symbol detection)
               · pygrade.js (code-exercise grader, shared with the verifier)
               · learning.js (review ratings, mastery rules)
               · curriculum.js (prerequisite graph) · planner.js (study planner, streaks)
               · params.js (template exercises)
  renderer/    React UI (Vite)
    src/
      AppContext.jsx     language, theme, progress & learning state
      lib/plan.js        adaptive 30-day scheduling
      lib/mastery.js     per-lesson mastery from the learning state
      lib/pyodide.js     lazy, offline Pyodide runner (Python runs in lib/pyodide.worker.js)
      components/        MathText, FunctionGraph, Exercise, CodeBlock, NotationBox, MasteryBadge
      pages/             Dashboard, SubjectView, LessonView, ReviewView, PlanView,
                         PlacementView, ExamView, MapView, GlossaryView
    public/pyodide/      bundled Pyodide runtime + wheels (git-ignored, generated)
content/       lesson JSON (the curriculum), subjects.json, glossary.json
scripts/       verify-content.mjs · verify-glossary.mjs · verify-code.py · verify-pyodide.mjs
               copy-pyodide.mjs · fetch-pyodide-wheels.mjs
test/          unit tests (node --test): learning rules, database + migrations
build/         app icons (.icns/.ico/.png) + macOS entitlements
.github/workflows/release.yml   multi-OS packaged-release CI
```

Security: the renderer is sandboxed, with `contextIsolation` on and `nodeIntegration` off; it can only call the methods whitelisted in `src/preload/index.js`. It can't navigate away from the app, and only `https` links open (in the system browser). The packaged app's loopback server only serves files inside the renderer folder, and only to its own host.

---

## 📖 About the content & sources

The lessons are **original explanatory material**, written to teach each topic from first principles, citing the textbooks that informed them (Stewart, Larson, Salas, Strang, Pólya, Russell & Norvig's *AIMA*, Goodfellow et al.'s *Deep Learning*, UOC engineering-maths modules, and more).

**Those reference works are copyrighted and are NOT included in this repository.** The `content/` lessons do not reproduce them. To study from the originals, obtain them legally and place them in a local, git-ignored `sources/` folder.

---

## 🤝 Contributing

Contributions welcome — new lessons, translations, bug fixes. Please:

1. Keep all learner-facing text bilingual (`en` + `es`).
2. Make content verifiable: `npm run verify` must pass.
3. Keep lessons original (don't paste copyrighted text); cite sources in the `references` field.

---

## 📄 License

[MIT](LICENSE) © 2026 Jose Arcos.

The MIT license covers the application code and the original lesson content in this repository. It does not grant any rights to third-party reference works, which are not distributed here.
