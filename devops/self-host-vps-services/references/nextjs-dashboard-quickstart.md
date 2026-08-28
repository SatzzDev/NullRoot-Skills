# Next.js Dashboard Quickstart (Bun + GitHub Actions Monitor Example)

Minimal Next.js 16 dashboard deployed to VPS with Cloudflare Tunnel, styled after 9Router's dark theme.

## Stack
- **Runtime:** Bun (v1.4.0+) for fast installs and dev server
- **Framework:** Next.js 16 (App Router)
- **API Integration:** GitHub Actions via `@octokit/rest`
- **Styling:** Inline styles (9Router aesthetic: dark `#0f0f0f` bg, coral `#E66550` accent)

## Setup

```bash
mkdir ~/github-actions-dashboard && cd ~/github-actions-dashboard
~/.bun/bin/bun init -y
~/.bun/bin/bun add next@latest react@latest react-dom@latest @octokit/rest
```

## Structure

```
app/
  layout.tsx          # Root layout
  page.tsx            # Dashboard page (client component)
  api/
    workflows/
      route.ts        # API route for GitHub data
.env.local            # GITHUB_TOKEN
next.config.js
package.json
```

## Minimal Files

**package.json** (dev script on custom port):
```json
{
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  }
}
```

**.env.local** (GitHub PAT with `repo` + `workflow` scope):
```
GITHUB_TOKEN=ghp_...
```

**app/api/workflows/route.ts** (fetch workflow runs):
```typescript
import { Octokit } from '@octokit/rest';
import { NextResponse } from 'next/server';

export async function GET() {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const repos = [
    { owner: 'SatzzDev', repo: 'NullRoot-Skills' },
    // add more
  ];

  const results = await Promise.all(
    repos.map(async ({ owner, repo }) => {
      const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
        owner, repo, per_page: 10,
      });
      return {
        repo: `${owner}/${repo}`,
        runs: runs.workflow_runs.map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          created_at: r.created_at,
          updated_at: r.updated_at,
          html_url: r.html_url,
        })),
      };
    })
  );

  return NextResponse.json({ repos: results });
}
```

**app/page.tsx** (dark theme dashboard with auto-refresh):
```typescript
'use client';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const res = await fetch('/api/workflows');
      setData(await res.json());
    };
    fetch();
    const interval = setInterval(fetch, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  // Render metrics, repo grid, recent runs panel
  // Style: bg #0f0f0f, cards #1a1a1a, accent #E66550
}
```

## Run

```bash
~/.bun/bin/bun run dev
# Dev server: http://localhost:3001
```

## Deploy Behind Cloudflare Tunnel

1. Add ingress to `/etc/cloudflared/config.yml`:
   ```yaml
   - hostname: github.saturia.codes
     service: http://localhost:3001
   ```
2. `sudo systemctl restart cloudflared`
3. **Register public hostname** via Cloudflare Zero Trust dashboard:
   - Networks → Tunnels → (select tunnel) → Public Hostnames → Add
   - Subdomain: `github`, Domain: `saturia.codes`, Service: `http://localhost:3001`
   - (DNS CNAME alone will 404 — tunnel needs explicit hostname registration)

## Production (Optional)

Run production build with systemd:
```bash
~/.bun/bin/bun run build
# Create systemd service with ExecStart=~/.bun/bin/bun run start
```

For production, prefer `bun run build` + `bun run start` over dev mode to avoid CORS issues and reduce memory.

## 9Router Design Pattern

- **Container:** `#0f0f0f` (near-black)
- **Cards:** `#1a1a1a`, border `#2a2a2a`, rounded 8px
- **Accent/Brand:** `#E66550` (coral/tomato orange)
- **Text:** `#e5e5e5` (light gray), labels `#9ca3af`, muted `#6b7280`
- **Status colors:** success `#22c55e`, fail `#ef4444`, running `#f59e0b`
- **Typography:** system-ui, clean hierarchy, bold titles in accent color

Layout: header + metrics grid + two-column (main content + right panel for recent activity).
