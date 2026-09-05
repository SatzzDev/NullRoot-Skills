# Wings Config Recovery After Deletion

## Symptom

Wings fails to start with:

```
manager: failed to retrieve server configurations
```

Journalctl shows a stack trace ending with `exit-code` status 1.

## Root Cause

`/etc/pelican/config.yml` was deleted. This file contains:
- Wings authentication token for the panel API
- Node ID
- Remote panel URL

Without it, Wings cannot authenticate or fetch server configurations.

## Recovery Steps

### 1. Check for Backup

```bash
ls -la /etc/pelican/
```

If `config.yml.bak` exists, restore it:

```bash
sudo cp /etc/pelican/config.yml.bak /etc/pelican/config.yml
sudo systemctl start wings
```

### 2. If Backup is Stale or Missing

Regenerate the config using the panel's auto-configuration command:

1. **Admin panel → Nodes → [your node] → Configuration tab**
2. Copy the `wings configure` command (it includes a fresh token)
3. Run it on the VPS:

```bash
sudo wings configure --panel-url https://panel.saturia.codes \
  --token <TOKEN_FROM_PANEL> \
  --node <NODE_ID>
```

4. Start Wings:

```bash
sudo systemctl start wings
```

### 3. Verify Node ID

If the backup config points to the wrong node ID (e.g., node 1 when the actual node is 2), Wings fails with a 404 from the panel API.

Check the node ID via panel API:

```bash
curl -H "Authorization: Bearer <APP_TOKEN>" \
  https://panel.saturia.codes/api/application/nodes | jq '.data[] | {id, name}'
```

Or query the database:

```bash
mysql -u saturia -p3551 pelican -e "SELECT id, name FROM nodes;"
```

Then update `config.yml` with the correct `uuid` and `token_id`.

## Prevention

**Never run `rm -f /etc/pelican/config.yml` as part of a 'force rebuild' workflow.** Wings cannot regenerate this file autonomously — it requires panel credentials. If Wings is misconfigured, fix the config in place or regenerate via the panel's Configuration tab, not by deleting the file.

## Related Commands That Triggered This

```bash
# DANGEROUS — do not use:
sudo rm -f /etc/pelican/config.yml
sudo systemctl start wings
# Wings will crash-loop because config.yml is required
```

The correct sequence is:

```bash
sudo systemctl stop wings
# Fix config.yml in place or regenerate via panel
sudo systemctl start wings
```
