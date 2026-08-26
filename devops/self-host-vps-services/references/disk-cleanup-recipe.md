# VPS Disk Cleanup Recipe

Use when disk hits 100% (`ENOSPC` during npm install or file writes).

## Quick wins (systematic order, ~3.5GB freed)

```bash
# 1. Clear /tmp and npm cache (~600MB)
rm -rf /tmp/* /tmp/.* 2>/dev/null || true
rm -rf ~/.npm
npm cache clean --force

# 2. Clear language toolchain caches (~2.5GB)
rm -rf ~/.cache/uv ~/.cache/yarn ~/.cache/pip ~/.cache/ms-playwright \
       ~/.cache/electron ~/.cache/node-gyp

# 3. Clear ML caches (~300MB)
rm -rf ~/.cache/huggingface

# 4. Docker cleanup (~300MB)
sudo docker system prune -af --volumes

# 5. APT cleanup (~2MB)
sudo apt-get clean
sudo apt-get autoremove -y

# 6. System logs (~30MB)
sudo rm -f /var/log/syslog.1 /var/log/auth.log.1 /var/log/btmp
sudo truncate -s 0 /var/log/syslog
sudo journalctl --vacuum-time=7d

# Verify
df -h /
```

## After cleanup: check big folders

```bash
du -sh ~/* ~/.* 2>/dev/null | sort -hr | head -20
```

**Do NOT delete these (still in use):**
- `.hermes/` (3.3GB) — Hermes Agent core + state DB
- `.venv/` (900MB) — Python venv for projects
- `.local/lib/` (800MB) — Python packages (litellm, transformers)
- `.kiro-server/` (500MB) — VSCode remote server (check `ps aux | grep kiro` first)
- `.9router/` (45MB) — 9Router config + sqlite DB

## Preventing future ENOSPC

Before installing large repos (OmniRoute, n8n, Jexactyl):
1. `df -h /` → ensure 5-10GB free
2. If < 5GB, run steps 1-3 above preemptively
3. Monitor during install: `watch -n5 df -h /`
