# Azure NAT + Wings Allocation Issues

## Problem

On Azure VPS with NAT-based public IP routing (floating IP not directly assigned to interface), Docker cannot bind to the public IP address. Wings fails to start game server containers with:

```
Error response from daemon: failed to bind host port 5.62.139.35:3030/tcp: cannot assign requested address
```

## Root Cause

Azure routes the public IP (`5.62.139.35`) to the VPS via NAT at the edge, but the interface only sees the private internal IP (`172.16.0.4`). Docker can only bind to IPs that exist on a local interface:

```bash
ip addr show | grep "inet "
# Output:
inet 127.0.0.1/8 scope host lo
inet 172.16.0.4/24 metric 100 brd 172.16.0.255 scope global eth0
inet 172.19.0.1/16 brd 172.19.255.255 scope global pelican0
inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
# Notice: 5.62.139.35 is NOT present
```

## Solution: Use 0.0.0.0 Allocation

Set the allocation IP to `0.0.0.0` — this binds to all interfaces and lets Azure's NAT forward traffic:

```sql
UPDATE allocations SET ip='0.0.0.0' WHERE ip='5.62.139.35';
```

Then restart Wings:

```bash
sudo systemctl restart wings
```

Containers will bind successfully, and inbound traffic to `5.62.139.35:port` reaches the container via Azure's NAT.

## Side Effect: Subdomains Plugin

The Pelican **Subdomains** plugin disables the **New Subdomain** button for allocations with `0.0.0.0` IP (it treats this as a non-routable address and refuses to create DNS records).

**Workaround for Subdomains:**
- Manually create A records in Cloudflare: `subdomain.saturia.codes` → `5.62.139.35`
- Or use SRV records for game servers that support it (e.g., Minecraft)
- The plugin's validation is overly strict for NAT environments — `0.0.0.0` is the only way to bind on Azure VPS

## When This Applies

- Azure VPS with floating/elastic IP
- Any cloud provider using edge NAT (public IP not on the VM's interface)
- Cloudflare Argo Tunnel setups where the public IP is routed, not assigned

If `ip addr` does not show the public IP, use `0.0.0.0` allocations.
