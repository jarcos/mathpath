# MathPath Content Upgrade — Spec (draft for sign-off)

Outcome of the scoping interview on 2026-06-25. Two asks: (1) lessons assume too
much / notation like λ is never named; (2) ML/DL/AI subjects should teach code,
not just math. This spec records every decision so the build can proceed without
re-litigating scope.

## Goals
1. **Name every symbol.** No symbol (λ, σ, ∇, Σ, ∂, …) appears without being read
   aloud at least once. Inline first-use gloss + a global, searchable glossary.
2. **Deeper theory.** Advanced lessons get intuition-before-formalism, a
   prerequisites recall box, more worked examples, and more visuals.
3. **Runnable code.** ML/DL/AI + computational-math lessons gain Python that the
   learner can run in-app, plus runnable code exercises.
4. **Stay offline-first and correctness-gated.** No runtime network. Every
   answer, every snippet, every code exercise is checked before "done".

## Decisions (locked)

| Area | Decision |
|---|---|
| Scope | **Entire curriculum** (all 241 lessons). |
| Notation | **Inline first-use gloss + global symbol glossary** page. |
| Code runtime | **Runnable in-app via Pyodide (WASM)**, bundled locally. |
| Code QA | **Execute snippets in the verify step.** |
| Deep-learning code | **Hybrid** — NumPy/Pandas/scikit-learn runnable in Pyodide; **TensorFlow/PyTorch shown as static, labelled reference**. |
| Verify env (runnable code) | **Pyodide in verify** → exact app/CI parity. |
| Verify env (static TF/PyTorch) | **Separate CPython+TF job** that actually executes them. |
| Code scope | **AI/ML track (M11–M20) + computational math** (calculus, linear-algebra, statistics, linear-maps). Algebra/functions stay math-only. |
| Glossary everywhere | Notation glossary + inline gloss applies to **all** subjects. |
| Exercise types | All four: **applied numeric**, **runnable code**, **MCQ w/ explanations**, **deeper fill-in-blank**. |
| Code-exercise grading | **Compare returned value** — learner defines a fixed-signature function; app calls it on test inputs with numeric tolerance. |
| Rollout | **Build shared infra, then batch straight through** the curriculum (no per-subject approval gate). |
| Depth means | **All of**: intuition before formalism, prerequisites recall box, more worked examples, more visuals. |

## Architecture changes

### Lesson schema (`content/`)
New section types (renderer + schema):
- `notation` — list of `{symbol, read:{en,es}, meaning:{en,es}}`. Feeds both the
  in-lesson box and the global glossary.
- `prereq` — recall box: `{lessons:[id], note:{en,es}}`.
- `code` — `{lang:"python", runnable:bool, code:{en,es}, expectedOutput, lib:[...]}`.
  `runnable:false` = static reference (the TF/PyTorch case), clearly labelled.
  Bilingual = same code, comments localized via the `{en,es}` pair.

New exercise `answerType`:
- `code` — `{signature, tests:[{args, expected, tol}], starter:{en,es}}`. Graded by
  calling the learner's function in Pyodide and comparing returned values within
  tolerance.
- `mcq` — `{choices:[{text:{en,es}, correct, why:{en,es}}]}`.

Existing `number`/`text`/`expression`/`set` stay; "applied numeric" exercises just
use richer `number`/`expression` prompts so mathjs still grades them.

### Renderer (`src/renderer/`)
- `LessonView` Section switch gains `notation`, `prereq`, `code`.
- New `CodeBlock` component: locally-bundled syntax highlighter (no CDN), Run
  button when `runnable`, output pane.
- Lazy Pyodide loader (`lib/pyodide.js`): init on first Run, load wheels from a
  bundled local path; cache the interpreter for the session.
- New **Glossary** page/route, fed by a curated `content/glossary.json`
  (bilingual: symbol → how-to-read → meaning), seeded by scanning lessons.
- `Exercise` component gains `code` (editor + Run + check) and `mcq` paths.

### Offline-first
Pyodide core + the Pyodide-stack wheels (numpy, pandas, scikit-learn, sympy,
matplotlib) are **downloaded at build time and bundled** into the app. Runtime
loads them from `file://` only — no network, consistent with the core principle.
Expect a meaningful bundle-size increase (tens of MB); accepted as the cost of
in-app execution.

### Correctness gates (three of them)
1. **mathjs** — unchanged, for number/text/expression/set answers.
2. **Pyodide verify** — `verify:content` (or a sibling script) boots Pyodide in
   Node and executes every `runnable` snippet + every `code` exercise's tests,
   asserting stated outputs. This is the *parity* gate: what passes CI is exactly
   what runs in-app.
3. **CPython+TF verify (optional/separate job)** — a venv with NumPy/Pandas/
   scikit-learn/TensorFlow/PyTorch executes the static DL snippets so their output
   is real, not hand-written. Heavier deps; runs as its own job.

Nothing is "done" until all applicable gates pass.

## Theory-depth pattern (applied to advanced lessons)
Each upgraded advanced lesson: open with intuition/motivation → `prereq` recall
box → formal definition → 2–3 worked examples of increasing difficulty → visuals
(FunctionGraph or static SVG) → existing references. λ-style notation named inline
on first use and in a `notation` box.

## Milestone plan
- **M22 — Glossary + notation pass.** Build glossary infra + Glossary page; sweep
  all 241 lessons for unnamed symbols; add inline gloss + `notation` boxes.
- **M23 — Code infra.** `code` section + `code`/`mcq` exercise types; CodeBlock;
  Pyodide loader + bundled wheels; both new verify gates. Prove on one subject.
- **M24 — Depth + code rollout.** Batch through AI/ML + computational-math
  subjects: intuition/prereq/worked-examples/visuals + runnable code + upgraded
  exercises. Verify each subject before moving on.
- **M25 — Math-ladder depth pass.** Apply depth/exercise upgrades (no code) to
  algebra/functions/etc.
- Refresh `docs/project.html` after each milestone; commit+push per milestone.

## Assumed defaults (decided, not asked — flag if wrong)
- Glossary is **curated** in `content/glossary.json`, seeded by scanning lessons;
  inline gloss pulls "how-to-read" from the same registry.
- Pyodide is **lazy-initialized** on first Run, not at app launch.
- Bilingual code = one code string with **comments localized** per language; logic
  identical across EN/ES.
- Code exercises use a **fixed function signature** per exercise (required by the
  "compare returned value" choice).

## Risks / watch-items
- **Bundle size**: bundling Pyodide + wheels is tens of MB; affects installer size
  and `npm run dist`. (Accepted.)
- **Pyodide↔CPython parity**: float formatting / lib-version drift between the two
  verify gates; mitigated by tolerance-based comparison.
- **CI weight**: the CPython+TF job is heavy and slow; kept as a separate job.
- **Volume**: 241 lessons across notation + depth + code + 4 exercise styles is a
  large, multi-week build; milestones keep it shippable in slices.
