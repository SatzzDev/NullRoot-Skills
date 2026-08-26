# Reference: nullroot-bot session (2026-08-19)

## Context
Local Discord bot `nullroot-bot` lives at `/home/satzz/NullRoot` (Discord.js 14, voice, gemini AI, autohd).
User said "jalanin nullroot" → run the bot.

## Symptom
Ran `node runner.js` (auto-restart wrapper). Looped forever:
```
[10:56] ⚠ Process exited with code 1. Restarting...
[10:56] ◆ Starting index.js...
```

`process(action=log)` showed the real error:
```
Error: Cannot find module './davey.linux-x64-gnu.node'
    Require stack: /home/satzz/NullRoot/node_modules/@snazzah/davey/index.js
Error: Cannot find module '@snazzah/davey-linux-x64-gnu'
    Require stack: /home/satzz/NullRoot/node_modules/@snazzah/davey/index.js
```

## Root cause
`node_modules/@snazzah/` contained only `davey` + `davey-win32-x64-msvc`.
`node_modules` had been installed on Windows (win32-x64-msvc), so the Linux prebuilt was absent.
Target: `linux x64`, glibc 2.43 → needs `@snazzah/davey-linux-x64-gnu`.

davey's optionalDependencies (all @0.1.12):
darwin-x64, darwin-arm64, linux-x64-gnu, linux-x64-musl, linux-arm64-gnu,
linux-arm64-musl, linux-arm-gnueabihf, android-arm*, win32-*, freebsd-x64, wasm32-wasi.

## Fix applied
1. `process(action=kill)` the looping runner.js background process.
2. `cd /home/satzz/NullRoot && npm install @snazzah/davey-linux-x64-gnu@0.1.12`
   (install only the platform binary — no full reinstall needed)
3. Re-run `node runner.js` → bot logs in cleanly.

## Notes
- console.clear() in runner.js wipes prior output each restart; use process(action=log) to recover the stack.
- tcsetattr "Inappropriate ioctl" on kill is harmless (background pty).
