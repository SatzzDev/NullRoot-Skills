---
name: agent-terminal-recovery
description: Terminal stuck cd to deleted dir, fix cwd with workdir.
---

# Agent terminal recovery (stale cwd / every command errors)

## Trigger
The `terminal` tool returns, on **every** command you run, something like:

```
/usr/bin/bash: line 3: cd: /home/satzz/<some dir>: No such file or directory
exit_code: 126
```

…even for a trivial command (`pwd`, `ls`), even when the command itself has nothing to do with that path. The path shown is the directory the user recently deleted/renamed.

## Root cause
The agent's terminal process keeps a **working directory (cwd)** between calls. If the user deletes that directory (e.g. `rm -rf ~/nodelink`), the next command the wrapper spawns tries to `cd` back into the now-gone cwd → fails → the shell aborts with exit 126 before your command runs. The truncated text the user may show you (`/tm...`, `=== ...`) is the shell's error echo, NOT your message being cut off.

## Do NOT misdiagnose as these (common wrong guesses)
- **Telegram 4096-char message limit** — rejected the instant the user says the command is well under 4096 chars. A shell cwd failure produces the *same visual "…" truncation* in a terminal screenshot, so verify the cause, never assume the limit.
- **A bad line in ~/.bashrc / ~/.profile / ~/.bash_aliases / /etc/profile.d** — these are almost always clean. Grepping them is a red herring; the failure fires for `env -i BASH_ENV=` too, proving it isn't script sourcing.

## The fix (verified working)
Pass the `workdir` parameter to the terminal tool. It resets the process cwd at the runtime level, *bypassing* the wrapper's stale-cd attempt:

```
terminal(command="pwd && ls -la", workdir="/home/satzz")
```

Use a directory you know exists (the user's `$HOME` is the safe default). After one successful call, the session's cwd is repaired and subsequent calls work normally.

### Why `env -i BASH_ENV=` does NOT fix it
`BASH_ENV` is sourced *after* the process has already spawned with its cwd. The failing `cd` happens at spawn time (wrapper-level), so clearing env vars cannot prevent it. Only `workdir` (runtime cwd reset) helps.

## Verification
After setting `workdir`, run:
```
pwd && echo "---shell alive---"
```
Expect `exit_code: 0` and the real directory. If it still shows the old `cd: ...` error, the `workdir` path itself may not exist — pick another existing dir.

## Killing a node bot with a respawn loop
After a `cd` failure or a normal session, to stop a Discord/music bot that auto-restarts (nodemon, or `bash start.sh` with a `while` loop):
1. Find the tree: `ps -eo pid,ppid,etime,cmd | grep -iE "nodelink|moonlink|src/index.ts|start.sh" | grep -v grep`
2. `kill -TERM <pids>` is often **ignored** by respawn loops — don't trust it.
3. Use `SIGKILL` on both the PID and its process group:
   ```
   for pid in 131760 131779 131828; do kill -KILL -"$pid"; kill -KILL "$pid"; done
   ```
   (The leading `-` targets the whole process group, killing children that the wrapper would otherwise respawn.)
4. Re-check after `sleep 2`; confirm `ps` shows nothing and any listened port is FREE:
   `ss -ltnp | grep <port>` → should be empty.
5. Leave VS Code server node processes (`/home/satzz/.vscode-server/...`) alone — they are not the bot.

## Pitfall: don't guess the cause from one symptom
When output looks "truncated", reproduce and read the real `exit_code` + `hint` fields from the tool result before hypothesizing. Two wrong guesses (char-limit, then startup-file) burned a turn here; reading the structured `exit_code: 126` + `cd: <deleted dir>` told the whole story immediately.

## Environment quirk: terminal user ≠ file-read user
On this host the `terminal` tool runs as **`saturia`** (uid 1000) with home **`/home/saturia`**, but the user's real files live under **`/home/satzz`** — which the file tools (`read_file`, `search_files`) CAN see, yet the terminal CANNOT (`/home/satzz: No such file or directory`). Symptoms that expose this:
- `ls /home` from terminal shows only `saturia`; a `read_file` of `/home/satzz/.bashrc` succeeds.
- Setting `workdir="/home/satzz"` fails in terminal but `workdir="/home/saturia"` works.
To operate on the user's real files, either `sudo`/`su` to `satzz` inside the terminal, or use the file tools (`read_file`/`write_file`/`patch`/`search_files`) which see the whole tree. For pure command execution, use `workdir="/home/saturia"` as the safe default.

## Reporting pitfall: never abbreviate commands with "..." in chat
The user reads the command text you paste into the chat, not just the tool output. If you shorten a command with `...` (e.g. `echo "=== proses node yg jalan ==="; ...`), the user sees "..." and believes their message was truncated or you hid something. This is the #1 reason the user thought output was "cut off" in this session — it was not the tool, it was your chat text.
**Rule:** always write the exact command you are about to run, in full, with no `...`. Tool *output* is sent full by default; only your chat-side command echo should be verbatim. If you must summarize, say so explicitly ("command shortened for readability") and paste the real command in a `terminal`-visible form or a file.
