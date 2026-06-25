# Build resources

`electron-builder` reads packaging assets from this folder
(`directories.buildResources` in `electron-builder.yml`).

## App icon (optional)

MathPath builds fine without a custom icon — electron-builder falls back to the
default Electron icon. To brand the app, drop the following files here and
un-comment the matching `icon:` lines in `electron-builder.yml`:

| Platform | File         | Size                         |
|----------|--------------|------------------------------|
| macOS    | `icon.icns`  | 512×512 or 1024×1024         |
| Windows  | `icon.ico`   | 256×256 (multi-size ICO)     |
| Linux    | `icon.png`   | 512×512                      |

A single 1024×1024 `icon.png` placed here is also accepted — electron-builder
will derive the per-platform formats automatically.

## entitlements.mac.plist

Minimal macOS hardened-runtime entitlements required for Electron's V8 JIT and
for loading the `better-sqlite3` prebuilt native binary. MathPath is offline and
requests no network/device entitlements.
