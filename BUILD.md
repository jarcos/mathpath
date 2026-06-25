# Building MathPath — Distributables & Reproducible Builds

MathPath ships as a self-contained desktop app via
[electron-builder](https://www.electron.build/). The renderer bundle already
contains every lesson (imported at build time), so the installer is fully
offline — no content files or network access are needed at runtime.

## Prerequisites

- **Node.js 20 LTS** (recommended). Newer majors (24/26) can break the
  `better-sqlite3` native build against Electron's V8; if you hit V8 errors,
  use Node 20 or follow the rebuild steps below.
- Platform toolchain for native modules:
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Windows:** Visual Studio Build Tools (C++ workload)
  - **Linux:** `build-essential`, `python3`
- You build **on the target OS**. electron-builder does not cross-compile native
  modules — build the macOS app on macOS, Windows on Windows, Linux on Linux.

## Install

`node_modules` is **platform-specific** (native `better-sqlite3` + Rollup
binaries) and is never committed. Always install fresh on each machine:

```bash
npm install        # also runs electron-rebuild for better-sqlite3 (postinstall)
```

If the native module fails to load (e.g. after a Node upgrade), rebuild it for
Electron explicitly:

```bash
npm install --ignore-scripts
node node_modules/electron/install.js
npx electron-rebuild -f -w better-sqlite3
```

## Verify content first

The build is gated on content correctness. `predist` runs this automatically,
but you can run it manually:

```bash
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

`npm run dist` first runs `predist` → `verify:content` + `electron-vite build`
(producing `out/`), then `electron-builder` packages `out/` into installers
under `dist/`.

### What gets packaged

- `out/**` — compiled main, preload, and renderer (renderer already embeds all
  lesson content).
- `package.json` — the manifest.
- `better-sqlite3` is **asar-unpacked** so its prebuilt `.node` binary loads at
  runtime.
- `sources/` (copyrighted reference material) and `content/` source JSON are
  **not** shipped — content is compiled into the renderer; `sources/` is
  gitignored and never distributed.

The SQLite database is created at runtime in the OS user-data folder
(`app.getPath('userData')/mathpath.db`), not inside the app bundle, so updates
never clobber user progress.

## Reproducible builds

For byte-stable, auditable builds:

1. **Pin the toolchain.** Use the Node version in `.nvmrc`/CI and install with
   `npm ci` (honors `package-lock.json` exactly) rather than `npm install`.
2. **Pin Electron + electron-builder** — both are exact-ranged in
   `package.json`; `package-lock.json` locks the full tree.
3. **Set a fixed timestamp** to avoid embedding build dates:
   `SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) npm run dist`.
4. **Disable publishing/signing noise** for local repro: builds default to
   `publish: null`. Code-signing is environment-specific and excluded from the
   reproducible core (sign as a separate, documented step).
5. **Record the inputs.** The git commit, `package-lock.json` hash, Node version
   and OS fully determine the output; capture them alongside the artifacts.

## Code signing & notarization (optional, per-platform)

Not required to run locally. For distribution outside your own machine:

- **macOS:** set `CSC_LINK` / `CSC_KEY_PASSWORD` (Developer ID cert) and
  `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` for notarization.
  Hardened runtime + entitlements are already configured in
  `electron-builder.yml` and `build/entitlements.mac.plist`.
- **Windows:** set `CSC_LINK` / `CSC_KEY_PASSWORD` to an Authenticode cert.

Unsigned builds run fine locally; users may need to bypass Gatekeeper /
SmartScreen on first launch.

## App icon

Optional — see `build/README.md`. Without a custom icon the default Electron
icon is used.
