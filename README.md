# MathPath

> An offline desktop app to learn mathematics from pre-university level all the way to machine learning and AI.

MathPath is a single-user, fully-offline **Electron** application that teaches maths and ML as a structured ladder: it starts with pre-university algebra and climbs through functions, calculus and linear algebra into a full **AI / machine-learning track**. Lessons mix clear explanations with **worked examples**, **live graphs**, **runnable Python**, and **exercises checked symbolically** — so `1/2`, `0.5` and `2/4` are all accepted, and `(x+1)^2` matches `x^2+2x+1`.

Everything runs locally. No accounts, no network, no telemetry. Your progress lives in a local SQLite file.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform: Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)
![Lessons](https://img.shields.io/badge/lessons-241-6c8cff.svg)
![Bilingual](https://img.shields.io/badge/i18n-EN%20%2F%20ES-8a6cff.svg)

---

## ⬇️ Download

Grab the latest packaged app from the [**Releases**](../../releases/latest) page.

- **macOS (Apple Silicon)** — `MathPath-*-arm64.dmg`. The build is signed but not notarized, so on first launch right-click **MathPath.app → Open → Open**, or run `xattr -dr com.apple.quarantine /Applications/MathPath.app`.
- **Windows** — `MathPath-*-Setup.exe` (NSIS installer), produced by CI (see [Building & releasing](#-building--releasing)).

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
- **Adaptive 30-day plan** per subject, with prev/next lesson navigation and a "resume where you left off" card.
- **Bilingual** (English / Spanish) UI *and* content, **light & dark** themes — all remembered.
- **Local-only data** — progress, attempts, settings and plans in SQLite in your OS user-data folder.

---

## 🚀 Getting started

### Prerequisites

- **Node.js 20 LTS** recommended, and npm.
- **macOS:** Xcode command-line tools (`xcode-select --install`) to compile the native SQLite module.
- For the in-app **Run** (Python) feature: **Python 3** with `numpy pandas scikit-learn scipy sympy` is only needed to run the content *verifier* (`npm run verify:code`); the app itself ships Pyodide and needs nothing extra.

### Install & run

```bash
git clone https://github.com/jarcos/mathpath.git
cd mathpath
npm install                  # deps + electron-rebuild of better-sqlite3 + Pyodide core
npm run setup:pyodide:wheels # one-time: download the science wheels for offline Run (~130 MB)
npm run dev                  # launch with hot reload
```

`npm install` runs a `postinstall` step that rebuilds `better-sqlite3` for Electron and copies the Pyodide core into `src/renderer/public/pyodide/`. `setup:pyodide:wheels` then fetches the NumPy/Pandas/SciPy/scikit-learn/SymPy wheels so code runs fully offline. Both folders are git-ignored.

> **Very new Node versions.** `better-sqlite3` only needs to build against *Electron's* V8. If a very new system Node breaks the native build:
> ```bash
> npm install --ignore-scripts
> node node_modules/electron/install.js
> npx electron-rebuild -f -w better-sqlite3
> npm run setup:pyodide:wheels && npm run dev
> ```

### Scripts

```bash
npm run verify           # all gates: content (mathjs) + glossary + code (CPython)
npm run verify:content   # mathjs-checks every answer / acceptedAlt
npm run verify:glossary  # glossary integrity + symbol detection
npm run verify:code      # executes every runnable snippet & code-exercise (needs the Python libs)
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

You can also run it manually from the **Actions** tab (workflow_dispatch). Bundle size note: the offline Python wheels add ~130 MB; see [`BUILD.md`](BUILD.md) for trimming, signing and reproducible-build notes.

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

### Adding a subject or lesson

1. Create the lesson JSON under `content/<subject>/` and reference it in `content/subjects.json`.
2. Keep all text bilingual; make answers verifiable.
3. Run `npm run verify`.

---

## 🗂 Project structure

```
src/
  main/        Electron main process + SQLite data layer + IPC handlers
  preload/     Secure contextBridge (the only renderer ↔ main channel)
  shared/      validate.js (mathjs checker) · notation.js (symbol detection)
  renderer/    React UI (Vite)
    src/
      AppContext.jsx     language, theme & progress state
      lib/plan.js        adaptive 30-day scheduling
      lib/pyodide.js     lazy, offline Pyodide loader for in-app Python
      components/        MathText, FunctionGraph, Exercise, CodeBlock, NotationBox
      pages/             Dashboard, SubjectView, LessonView, GlossaryView
    public/pyodide/      bundled Pyodide runtime + wheels (git-ignored, generated)
content/       lesson JSON (the curriculum), subjects.json, glossary.json
scripts/       verify-content.mjs · verify-glossary.mjs · verify-code.py
               copy-pyodide.mjs · fetch-pyodide-wheels.mjs
build/         app icons (.icns/.ico/.png) + macOS entitlements
.github/workflows/release.yml   multi-OS packaged-release CI
```

Security: the renderer runs with `contextIsolation` on and `nodeIntegration` off; it can only call the methods whitelisted in `src/preload/index.js`.

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
