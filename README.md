# MathPath

> An offline desktop app to learn mathematics from pre-university level all the way to machine learning and AI.

MathPath is a single-user, fully-offline **Electron** application that teaches maths as a structured ladder: it starts with pre-university algebra and climbs through functions, calculus, and linear algebra toward the foundations of machine learning. Lessons mix clear explanations with **worked examples**, **live function graphs**, and **exercises whose answers are checked symbolically** — so `1/2`, `0.5`, and `2/4` are all accepted, and `(x+1)^2` matches `x^2+2x+1`.

Everything runs locally. No accounts, no network, no telemetry. Your progress lives in a local SQLite file.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg) ![Platform: Electron](https://img.shields.io/badge/Platform-Electron-47848F.svg)

---

## ✨ Features

- **A full maths ladder** — five subjects, 87 lessons: Pre-University Algebra, Functions & Pre-Calculus, Introduction to Calculus, Linear Algebra & Geometry, and Linear Maps & Transformations. (An AI/ML track is on the roadmap.)
- **Textbook-depth lessons** — intuition, formal statements, multiple worked examples, common pitfalls, and a cited "Sources & further reading" section on every lesson.
- **Symbolic answer checking** — exercises are validated with [mathjs](https://mathjs.org), accepting any mathematically equivalent form (fractions, decimals, rearranged expressions).
- **Step-by-step solutions** — every exercise reveals a worked solution on demand, with hints.
- **Live graphs** — a lightweight, dependency-free SVG plotter renders `y = f(x)` for parabolas, sine waves, exponentials, and more.
- **Adaptive 30-day plan** — each subject is scoped to a month; if you fall behind, the remaining lessons re-spread across the days left.
- **Bilingual** — full **English / Spanish** toggle for both the interface and all lesson content.
- **Light & dark themes** — a top-bar toggle; your choice is remembered.
- **Local-only data** — progress, attempts, settings, and study plans are stored in SQLite in your OS user-data folder.

---

## 🚀 Getting started

### Prerequisites

- **Node.js 18+** and npm (developed on Node 22+).
- On macOS: **Xcode command-line tools** (`xcode-select --install`) — needed to compile the native SQLite module.

### Install & run

```bash
git clone https://github.com/<your-username>/mathpath.git
cd mathpath
npm install      # installs deps and rebuilds better-sqlite3 for Electron
npm run dev      # launches the app with hot reload
```

`npm install` runs a `postinstall` step (`electron-rebuild`) that compiles `better-sqlite3` against your installed Electron version.

> **Note on very new Node versions.** `better-sqlite3` only needs to be built against **Electron's** bundled V8, not your system Node. If your system Node is very new (e.g. v24+) the default native build may fail. In that case install without build scripts and rebuild for Electron explicitly:
> ```bash
> npm install --ignore-scripts
> node node_modules/electron/install.js      # fetch the Electron binary
> npx electron-rebuild -f -w better-sqlite3  # build SQLite for Electron
> npm run dev
> ```

### Other scripts

```bash
npm run verify:content   # checks every lesson's answers with mathjs (build gate)
npm run build            # production build into ./out
```

---

## 📚 How the content works

Each lesson is a JSON file under `content/<subject>/`. Every learner-facing string is an `{ "en": ..., "es": ... }` pair, and prose supports `**bold**` plus LaTeX via `$inline$` and `$$display$$` (rendered with KaTeX).

```jsonc
{
  "id": "algebra-02-quadratic-equations",
  "subjectId": "algebra",
  "order": 7,
  "title": { "en": "Quadratic Equations", "es": "Ecuaciones cuadráticas" },
  "sections": [
    { "type": "prose",   "content": { "en": "...", "es": "..." } },
    { "type": "example", "title": {...}, "content": {...} },
    { "type": "graph",   "fn": "x^2 - 5*x + 6", "domain": [-1, 6], "caption": {...} }
  ],
  "exercises": [
    {
      "id": "algebra-02-e1",
      "answerType": "set",            // number | expression | set | text
      "prompt": { "en": "...", "es": "..." },
      "answer": "2, 3",
      "acceptedAlt": ["3, 2"],         // other forms also accepted
      "hint": { "en": "...", "es": "..." },
      "solution": [ { "tex": "(x-2)(x-3)=0", "en": "...", "es": "..." } ]
    }
  ],
  "references": [
    { "source": "Stewart, Redlin & Watson — Precalculus (2015)",
      "detail": { "en": "Ch. 1.5, Quadratic Equations", "es": "Cap. 1.5" } }
  ]
}
```

### Correctness gate

Because lesson content is authored with the help of an LLM, **every exercise is verified**: `npm run verify:content` parses each answer with mathjs, evaluates each graph function, and asserts that every `acceptedAlt` is mathematically equivalent to the canonical answer. The build should be gated on this passing.

### Adding a subject or lesson

1. Create the lesson JSON under `content/<subject>/`.
2. Reference it in `content/subjects.json` (set the subject `status` to `"available"`).
3. Run `npm run verify:content`.

---

## 🗂 Project structure

```
src/
  main/        Electron main process + SQLite data layer + IPC handlers
  preload/     Secure contextBridge (the only renderer ↔ main channel)
  shared/      validate.js — mathjs symbolic/numeric answer checker
  renderer/    React UI (Vite)
    src/
      AppContext.jsx     language, theme & progress state
      lib/plan.js        adaptive 30-day scheduling (pure, testable)
      components/        MathText (KaTeX), FunctionGraph (SVG), Exercise, ...
      pages/             Dashboard, SubjectView, LessonView
content/       lesson JSON (the curriculum) + index loader
scripts/       verify-content.mjs — build-time correctness gate
docs/          project.html — live project dashboard
```

Security note: the renderer runs with `contextIsolation` on and `nodeIntegration` off; it can only call the methods whitelisted in `src/preload/index.js`.

---

## 🛣 Roadmap

- ✅ **Math ladder** — Algebra, Functions, Calculus, Linear Algebra, Linear Maps (all shipped, textbook depth).
- ⏳ **AI / ML track** — Statistics & Probability, Machine Learning Foundations, Neural Networks, Deep Learning, NLP & Transformers, Reinforcement Learning, Knowledge Representation, Computer Vision, AI Foundations & Philosophy, Active Inference.
- ⏳ Packaged installers (`.dmg`, `.exe`, `.AppImage`).

See `CURRICULUM.md` for the full lesson-by-lesson map.

---

## 📖 About the content & sources

The lessons are **original explanatory material**, written to teach each topic from first principles. Each lesson cites the textbooks and references that informed it (e.g. Stewart's *Precalculus* and *Calculus*, Strang's *Introduction to Linear Algebra*, Pólya's *How to Solve It*, and UOC engineering-maths modules).

**Those reference works are copyrighted and are NOT included in this repository.** The `content/` lessons do not reproduce them. If you want the original source PDFs for your own study, obtain them legally and place them in a local (git-ignored) `sources/` folder.

---

## 🤝 Contributing

Contributions are welcome — new lessons, translations, bug fixes, or a packaged-build setup. Please:

1. Keep all learner-facing text bilingual (`en` + `es`).
2. Make exercises verifiable: run `npm run verify:content` and ensure it passes.
3. Keep lessons original (don't paste copyrighted text); cite sources in the `references` field.

---

## 📄 License

[MIT](LICENSE) © 2026 Jose Arcos.

The MIT license covers the application code and the original lesson content in this repository. It does not grant any rights to third-party reference works, which are not distributed here.
