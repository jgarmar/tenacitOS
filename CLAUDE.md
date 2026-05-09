# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TenacitOS Mission Control — a Next.js 16 + React 19 dashboard for monitoring and controlling an OpenClaw AI agent installation. It runs on LXC 115 (Debian) on a Proxmox homelab, served via `npm start` on port 3000, managed by systemd as `mission-control.service`.

## Commands

```bash
npm run dev      # dev server on 0.0.0.0:3000
npm run build    # production build (required before restarting service)
npm run lint     # eslint check
```

Deployment after changes:
```bash
npm run build && systemctl restart mission-control
```

No test suite exists. TypeScript type-checking: `npx tsc --noEmit`.

## Architecture

### Data flow
All data comes from the OpenClaw runtime on the same machine via:
- **`openclaw` CLI** — called with `execSync` from API routes (cron, agents, sessions, skills, actions, git)
- **`/root/.openclaw/`** filesystem — read directly for config (`openclaw.json`), memory, workspace files, sessions (JSONL)
- **SQLite** (`data/activities.db`) — activity log populated by `scripts/collect-activities.py` (runs every 5 min via crontab), queried by `/api/activities/*`
- **`data/configured-skills.json`** — instance-specific skill registry (gitignored), read at runtime by `src/lib/skill-parser.ts`

### Path resolution
`src/lib/paths.ts` centralizes all OpenClaw filesystem paths. Use these constants instead of hardcoding. Override via env vars for local dev (`OPENCLAW_DIR`, `OPENCLAW_WORKSPACE`).

### Auth
Cookie-based: middleware checks `mc_auth` cookie against `AUTH_SECRET` env var. API routes return 401 JSON; page routes redirect to `/login`. Public routes: `/login`, `/api/auth/*`, `/api/health`.

### Layout system
The dashboard shell (`src/app/(dashboard)/layout.tsx`) uses three TenacitOS components from `src/components/TenacitOS/`:
- **Dock** — left sidebar (desktop) / bottom nav bar (mobile <768px)
- **TopBar** — top bar, adjusts width for mobile
- **StatusBar** — bottom status bar (desktop only)

Main content margin: `marginLeft: 68px` (desktop) / `0` (mobile). The layout and both bars use `useState + useEffect` to detect mobile — no SSR mismatch since all three are `"use client"`.

### Office 3D
`src/components/Office3D/` — React Three Fiber scene. Key files:
- `Office3D.tsx` — root canvas, polls `/api/office` every 5s for agent states
- `MovingAvatar.tsx` — avatar locomotion. Obstacle buffer is `radius + 0.4` (critical: was `+1.5` which blocked home positions). `onPositionUpdate` throttled to >0.1 unit changes to avoid render cascades.
- `agentsConfig.ts` — `POSITION_POOL` defines desk positions; agent data overridden at runtime from `/api/office`

### Branding / instance config
`src/config/branding.ts` — all instance-specific strings (agent name, owner, social handles) read from `NEXT_PUBLIC_*` env vars in `.env.local`. Never hardcode these values in components.

### API conventions
- All API routes use `execSync`/`execFileSync` from `child_process` to call the `openclaw` CLI — no direct HTTP to the gateway
- Service allowlists are hardcoded in each route file: `SYSTEMD_SERVICES = ["mission-control", "openclaw-gateway"]`, `PM2_SERVICES = []`
- System monitor routes (`/api/system/*`) read from `/proc/stat`, `/proc/net/dev`, `df`, `ufw`, `tailscale` — Linux-only, will fail on macOS

### Design system
Dark theme only. CSS variables in `src/app/globals.css`: `--bg`, `--surface`, `--surface-elevated`, `--accent` (#FF3B30 red), `--text-primary/secondary/muted`, `--border`. Use these variables; do not use Tailwind color utilities directly for theme colors.

### Activity pipeline
1. `scripts/collect-activities.py` — scans `/root/.openclaw/agents/*/sessions/*.jsonl` for `toolCall` events, inserts into `data/activities.db` via `INSERT OR IGNORE` (deduplication by SHA1 of session+line+toolId)
2. `src/lib/activities-db.ts` — SQLite wrapper with WAL mode, 30-day retention
3. `/api/activities`, `/api/activities/stats`, `/api/activities/stream` — serve the data

## Key env vars (`.env.local`)

| Var | Purpose |
|-----|---------|
| `AUTH_SECRET` | Cookie value for `mc_auth` auth cookie |
| `ADMIN_PASSWORD` | Login form password |
| `OPENCLAW_DIR` | Override for `/root/.openclaw` (local dev) |
| `NEXT_PUBLIC_AGENT_NAME/EMOJI` | Agent identity in UI |
| `NEXT_PUBLIC_OWNER_USERNAME` | Shown in TopBar |

## Deployment context

- Runs inside LXC 115 on Proxmox, accessible via Tailscale at `100.122.105.85:3000` or `tenazo.jgarmar.es` (via NPM Plus on LXC 114)
- SSH: `ssh root@tenazo.jgarmar.es` → `pct exec 115 -- bash`
- Mission-control source: `/root/.openclaw/workspace/mission-control`
- `data/configured-skills.json` is gitignored (instance-specific) — must be deployed manually
- Claw3D (companion 3D office app) runs as `claw3d.service` on port 3001, exposed at `claw3d.jgarmar.es`
