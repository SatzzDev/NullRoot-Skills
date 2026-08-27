---
name: disk-cleaner
description: "Safe disk cleanup: apt, logs, caches (uv, pip, playwright)."
category: devops
---

# Disk Cleaner Skill

Safe disk cleanup for Ubuntu/Linux servers. Removes caches, logs, and unused packages without touching system files.

## Usage

```bash
/home/saturia/.hermes/skills/disk-cleaner/scripts/clean.sh
```

## What It Cleans (Safe)

| Target | Typical Size | Command |
|--------|--------------|---------|
| apt cache | 100-500 MB | `apt clean && apt autoclean && apt autoremove --purge -y` |
| systemd journal | 100-500 MB | `journalctl --vacuum-size=50M` |
| `~/.cache/uv` | 500 MB - 2 GB | `rm -rf ~/.cache/uv` |
| `~/.cache/electron` | 50-200 MB | `rm -rf ~/.cache/electron` |
| `~/.cache/node-gyp` | 50-150 MB | `rm -rf ~/.cache/node-gyp` |
| `~/.cache/pip` | 20-100 MB | `rm -rf ~/.cache/pip` |
| `~/.cache/ms-playwright` | 300-800 MB | `rm -rf ~/.cache/ms-playwright` |
| `~/.cache/typescript` | 10-50 MB | `rm -rf ~/.cache/typescript` |
| `~/.cache/yt-dlp` | 10-50 MB | `rm -rf ~/.cache/yt-dlp` |

## What It Does NOT Touch

- `/usr`, `/lib`, `/bin` — system files
- `/var/lib/mysql` — database
- `/home/saturia/.hermes/hermes-agent` — Hermes installation
- `/var/lib/snapd` — review manually with `snap list`

## Steps (Manual)

1. `df -h /` — note before
2. `sudo apt clean && sudo apt autoclean && sudo apt autoremove --purge -y`
3. `sudo journalctl --vacuum-size=50M`
4. `rm -rf ~/.cache/uv ~/.cache/electron ~/.cache/node-gyp ~/.cache/pip ~/.cache/typescript ~/.cache/yt-dlp`
5. Optional: `rm -rf ~/.cache/ms-playwright` (hapus jika Playwright tidak digunakan)
6. `df -h /` — note after

## Disk Analysis

```bash
# Top consumers
du -sh /* 2>/dev/null | sort -rh | head -10
du -sh ~/.hermes/* 2>/dev/null | sort -rh | head -10
du -sh ~/.cache/* 2>/dev/null | sort -rh
```

## Pitfalls

- Jangan hapus `~/.hermes/hermes-agent/node_modules` — Hermes akan broken
- `snapd` makan ~1.6 GB — cek `snap list` dan remove yang tidak dipakai
- `~/.cache/ms-playwright` diperlukan jika Hermes menggunakan browser tools
