# Building MathPath — Distributables & Reproducible Builds

MathPath ships as a self-contained desktop app via
[electron-builder](https://www.electron.build/). The renderer bundle already
contains every lesson (imported at build time), so the installer is fully
offline — no content files or network access are needed at runtime. The only
exception is the opt-in updater (see [Updates](#updates-electron-updater)).

## Prerequisites

- **Node.js 22 LTS** (22.12 or newer, pinned in `.nvmrc` and CI). Electron 45
  requires it.
- No C++ toolchain: `better-sqlite3` (v13+) uses Node-API and ships prebuilt
  binaries for macOS, Windows and Linux (x64 + arm64), so the same binary loads
  in Node and in Electron without a rebuild.
- You build **on the target OS**. electron-builder does not cross-compile native
  modules — build the macOS app on macOS, Windows on Windows, Linux on Linux.

## Install

`node_modules` is **platform-specific** (Electron + Rollup binaries) and is
never committed. Always install fresh on each machine:

```bash
npm install        # postinstall copies the Pyodide core
```

If Electron reports it "failed to install correctly", its download was unzipped
only partially (seen under Node 24). Reinstall it under Node 22:

```bash
rm -rf node_modules/electron
npm install
```

## Verify content first

The build is gated on content correctness. `predist` runs this automatically,
and the release CI runs it before packaging, but you can run it manually:

```bash
npm run verify           # all four gates (needs the Pyodide wheels, see below)
npm run verify:content   # mathjs-checks every answer & acceptedAlt
```

## Build the distributable

```bash
npm run dist          # current OS, default targets
npm run dist:mac      # macOS  -> dist/*.dmg, *.zip
npm run dist:win      # Windows -> dist/*.exe (NSIS installer)
npm run dist:linux    # Linux   -> dist/*.AppImage, *.deb
npm run dist:dir      # unpacked app dir only (fast smoke test, no installer)
```

`npm run dist` first runs `predist` → `verify` + `electron-vite build`
(producing `out/`), then `electron-builder` packages `out/` into installers
under `dist/`.

### What gets packaged

- `out/**` — compiled main, preload, and renderer (renderer already embeds all
  lesson content).
- `package.json` — the manifest.
- The app ships as plain files (`asar: false`), so `better-sqlite3`'s prebuilt
  `.node` binary loads directly at runtime.
- `sources/` (copyrighted reference material) and `content/` source JSON are
  **not** shipped — content is compiled into the renderer; `sources/` is
  gitignored and never distributed.

The SQLite database is created at runtime in the OS user-data folder
(`app.getPath('userData')/mathpath.db`), not inside the app bundle, so updates
never clobber user progress.

## Reproducible builds

For byte-stable, auditable builds:

1. **Pin the toolchain.** Use the Node version in `.nvmrc`/CI and install with
   `npm ci --ignore-scripts && npm run setup:pyodide` (honors
   `package-lock.json` exactly) rather than `npm install`. Without
   `--ignore-scripts`, `npm ci` node-gyp-compiles `better-sqlite3` because the
   lockfile doesn't record its `gypfile: false`.
2. **Pin Electron + electron-builder** — both are exact-ranged in
   `package.json`; `package-lock.json` locks the full tree.
3. **Set a fixed timestamp** to avoid embedding build dates:
   `SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) npm run dist`.
4. **Disable publishing/signing noise** for local repro: builds default to
   `publish: null`. Code-signing is environment-specific and excluded from the
   reproducible core (sign as a separate, documented step).
5. **Record the inputs.** The git commit, `package-lock.json` hash, Node version
   and OS fully determine the output; capture them alongside the artifacts.

## Code signing & notarization

### macOS — sign + notarize so a downloaded app opens with no warnings

Hardened runtime, entitlements, and `notarize: true` are already configured
(electron-builder 26 reads the team ID, `L3WX9JGL2T`, from `APPLE_TEAM_ID`). electron-builder auto-discovers the **Developer ID Application**
certificate from your login keychain, so a local `npm run dist:mac` already
*signs* the app. To also *notarize* it (required for a downloaded build to open
without Gatekeeper prompts), provide Apple credentials in the environment, then
build:

```bash
# one-time: create an app-specific password at appleid.apple.com
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="L3WX9JGL2T"
npm run dist:mac     # signs with Developer ID, notarizes, and staples the ticket
```

(App Store Connect API keys also work: `APPLE_API_KEY` / `APPLE_API_KEY_ID` /
`APPLE_API_ISSUER`.) Without these vars the build still succeeds — signed but not
notarized.

Verify the result:

```bash
spctl -a -vvv -t install "dist/mac-arm64/MathPath.app"   # expect: accepted, source=Notarized Developer ID
xcrun stapler validate "dist/MathPath-0.1.0-arm64.dmg"   # expect: The validate action worked!
```

### CI (recommended for releases)

The release workflow signs + notarizes on the macOS runner when these **repo
secrets** are set (Settings → Secrets and variables → Actions):

- `CSC_LINK` — base64 of your Developer ID `.p12` (`base64 -i cert.p12 | pbcopy`)
- `CSC_KEY_PASSWORD` — the `.p12` export password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

`CSC_*` are scoped to the macOS job so they are never used as a Windows
certificate. With no secrets, CI still produces an (ad-hoc-signed, un-notarized)
build.

### Windows

Currently shipped unsigned (SmartScreen may warn → *More info → Run anyway*). To
sign, add an Authenticode cert as `CSC_LINK` / `CSC_KEY_PASSWORD` for the Windows
job.

## Updates (electron-updater)

The packaged app can update itself from the GitHub Releases of the public
`jarcos/mathpath` repo. It is **opt-in** (off by default): the learner turns on
"Check for updates automatically" on the dashboard, or presses "Check for
updates". New versions download in the background and install on restart.

- `publish: github` in `electron-builder.yml` writes `app-update.yml` into the
  app and `latest-mac.yml` / `latest.yml` + `*.blockmap` next to the
  installers. CI still packages with `--publish never` and attaches all of them
  to the release; a release without them is invisible to the updater.
- macOS updates download the `.zip` (not the `.dmg`) and only apply when the old
  and new app are signed with the same Developer ID, so keep signing in CI.
- Windows updates use the NSIS installer. `nsis.artifactName` has no spaces
  because GitHub turns spaces into dots on upload, which would break the URL in
  `latest.yml`.
- Code: `src/main/updater.js` (state pushed to the renderer on `updates:state`)
  and `src/renderer/src/components/Updates.jsx`. Under `npm run dev` the updater
  reports "unsupported".
- Releases marked as prerelease are not offered (electron-updater's default).
- The first version with the updater (0.1.4) has to be installed by hand once.

## App icon

Optional — see `build/README.md`. Without a custom icon the default Electron
icon is used.

## In-app Python (Pyodide) — offline runtime

Lessons in the AI/ML and computational-math tracks include **runnable Python**
(the **Run** button). Execution uses [Pyodide](https://pyodide.org) (CPython on
WebAssembly) entirely on-device — no network at runtime, consistent with the
offline-first principle.

- `pyodide` is a normal dependency. After `npm install`, the **postinstall** step
  runs `scripts/copy-pyodide.mjs`, which copies the Pyodide **core** (loader,
  wasm, stdlib) into `src/renderer/public/pyodide/`. That folder is git-ignored
  and is served at `/pyodide/` by Vite/Electron.
- The npm `pyodide` package ships **core only** — the science wheels are not
  included. Run **`npm run setup:pyodide:wheels`** once to download the wheels for
  `numpy pandas scipy scikit-learn sympy` (+ deps) for the installed Pyodide
  version into the same folder (≈ 131 MB). After this the runtime is fully offline
  (verified: Pyodide loads all five libs from the local bundle with no network).
- Re-copy core any time with `npm run setup:pyodide`; re-fetch wheels with
  `npm run setup:pyodide:wheels` (idempotent — skips wheels already present).
- The loader (`src/renderer/src/lib/pyodide.js`) is lazy: Pyodide boots on the
  first **Run**, and per-lesson packages (`numpy`, `pandas`, `scikit-learn`,
  `scipy`, `sympy`) load on demand from the local copy.
- Python runs in a Web Worker (`lib/pyodide.worker.js`), never on the UI thread.
  The learner can **Stop** a run, and runs are stopped after 30 s of execution;
  either way the worker is terminated and the next run starts a fresh one.
- **Bundle size:** copying all wheels adds hundreds of MB. To slim installers,
  copy only the wheels you actually use (numpy/pandas/scikit-learn/scipy/sympy +
  their deps) instead of the whole dist.
- **TensorFlow / PyTorch** snippets are shown as **static reference** (Pyodide
  cannot run them). They are marked `runnable: false` and are verified separately
  by the code gate in a CPython env that has TF installed.

### Correctness gate for code

`npm run verify` runs four gates: `verify:content` (mathjs), `verify:glossary`,
`verify:code` and `verify:pyodide`. `verify:code` (`scripts/verify-code.py`)
executes every runnable snippet (both EN and ES) and every code-exercise
reference solution in CPython — restricted to the Pyodide-supported library set —
and checks the stated output / test results. It needs `numpy pandas scikit-learn
scipy sympy` installed (`pip install ...`); heavy libs (tensorflow/torch) are an
optional tier that is skipped with a notice if absent.

`verify:pyodide` (`scripts/verify-pyodide.mjs`) runs the same snippets and
reference solutions in the bundled Pyodide, through the grader the app uses
(`src/shared/pygrade.js`). It catches what only differs in-app — library
versions, print formats, warnings, value conversion — and needs the bundled
runtime + wheels (`npm run setup:pyodide && npm run setup:pyodide:wheels`).
