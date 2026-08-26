---
name: node-native-module-debug
description: Node fails with a missing prebuilt binary error.
---

# Debug missing native (prebuilt) Node module binaries

## Trigger
A Node project won't start and the error stack shows, nested under the real culprit:
- `Error: Cannot find module './davey.linux-x64-gnu.node'` (or another `.node` file) thrown from a package's `index.js` `requireNative`, AND
- `Error: Cannot find module '@snazzah/davey-linux-x64-gnu'` (or similar `@scope/pkg-platform-arch`) in the same `requireStack`.

The two-part error means the package expects a platform-specific prebuilt binary that was never installed on this machine.

## Why it happens
Packages like `@snazzah/davey` ship their native binary as an **optionalDependency** keyed by platform: `@snazzah/davey-linux-x64-gnu`, `@snazzah/davey-win32-x64-msvc`, `@snazzah/davey-darwin-arm64`, etc. npm installs only the variant matching the OS you ran `npm install` on. If `node_modules` was populated on Windows (so only `davey-win32-x64-msvc` exists) and then run on Linux/WSL, the Linux binary is absent → the require fails.

## Fix
1. Read the exact missing platform package name + version from the parent package's `package.json` → `optionalDependencies` (e.g. `@snazzah/davey-linux-x64-gnu@0.1.12`).
2. Confirm your target platform: `node -e "console.log(process.platform, process.arch)"` and the libc (WSL2 Ubuntu = glibc → use the `-gnu` variant, NOT `-musl`).
3. Install JUST that binary in the project dir — no need to wipe all of `node_modules`:
   `npm install @snazzah/davey-linux-x64-gnu@0.1.12`
4. Re-run the app. It should now print its ready line (e.g. `✅ Logged in as …`).

## Pitfalls
- **Auto-restart wrappers loop forever.** Some bots ship a `runner.js` that `spawn`s the real entry and restarts it on crash + hot-reloads via `fs.watch`. On a native-module crash it prints `⚠ Process exited with code 1. Restarting...` every ~1s and never stops. **Kill the background process BEFORE you start fixing**, or you fight a restart loop while editing.
- `npm ci` or copying `node_modules` across OSes drops the platform binary. Prefer `npm install` on each OS, or commit the lockfile and install on the target OS.
- If `ls node_modules/@scope/` shows only `*-win32-x64-msvc`, you're running the wrong-OS binaries — install the Linux/mac one.

## Verification
`ls node_modules/@snazzah/davey-linux-x64-gnu/` should list the `.node` file; the app starts cleanly.

See `references/nullroot-session.md` for a real transcript (nullroot-bot Discord bot, Aug 2026).
