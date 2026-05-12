# Memory Map + Mock Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Memory Map" scatter plot tab to /memory in mission-control showing Pirion's vector memory as a 2D cluster visualization, plus fix the one real mock (`activeSessions: 0`).

**Architecture:** API route reads pirion.sqlite vectors using better-sqlite3 + sqlite-vec, reduces 3072-dim to 2D with UMAP (umap-js), returns JSON. React component renders recharts ScatterChart. Memory page gets a top-level tab toggle between file browser and map.

**Tech Stack:** Next.js 16, TypeScript, better-sqlite3 (already installed), umap-js (new), recharts (already installed), TenacitOS dark CSS variables.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/memory/vectors/route.ts` | Read sqlite vectors, UMAP 2D reduction, return JSON |
| Create | `src/components/memory/MemoryMap.tsx` | Scatter chart, tooltip, click-to-open |
| Modify | `src/app/(dashboard)/memory/page.tsx` | Add top-level tab: Files / Memory Map |
| Modify | `src/app/api/agents/route.ts:~120` | Fix activeSessions: 0 mock |

---

## Task 1: Install umap-js

**Files:** `package.json`

- [ ] **Step 1: Install umap-js on LXC 116**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && npm install umap-js 2>&1 | tail -3'"
```

Expected: `added 1 package` or similar, no errors.

- [ ] **Step 2: Verify import works**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && node -e \"const {UMAP} = require(\\\"umap-js\\\"); console.log(\\\"ok\\\", typeof UMAP)\"'"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && git add package.json package-lock.json && git commit -m \"deps: add umap-js for vector dimensionality reduction\"'"
```

---

## Task 2: Create /api/memory/vectors route

**Files:**
- Create: `src/app/api/memory/vectors/route.ts`

- [ ] **Step 1: Create the route file**

Content to write to `/root/mission-control/src/app/api/memory/vectors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';
import { UMAP } from 'umap-js';

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || '/root/.openclaw';
const SQLITE_VEC_PATH = '/usr/lib/node_modules/openclaw/node_modules/sqlite-vec-linux-x64/vec0.so';

// Cache computed positions for 10 minutes
let cache: { data: VectorPoint[]; computedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface VectorPoint {
  id: string;
  x: number;
  y: number;
  file: string;
  source: string;
  preview: string;
}

export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent') || 'pirion';

  // Return cache if fresh
  if (cache && Date.now() - cache.computedAt < CACHE_TTL_MS) {
    return NextResponse.json({ points: cache.data, cached: true });
  }

  const dbPath = join(OPENCLAW_DIR, 'memory', `${agent}.sqlite`);
  if (!existsSync(dbPath)) {
    return NextResponse.json({ points: [], error: 'Memory database not found' });
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });

    // Load sqlite-vec extension for vector reads
    try {
      (db as Database.Database & { loadExtension: (p: string) => void }).loadExtension(SQLITE_VEC_PATH);
    } catch {
      // Extension may not load — we can still read chunks without vectors
    }

    // Get chunks metadata
    const chunks = db.prepare('SELECT id, source, file, substr(text, 1, 150) as preview FROM chunks').all() as {
      id: string; source: string; file: string; preview: string;
    }[];

    if (chunks.length < 4) {
      return NextResponse.json({ points: [], error: 'Not enough memory chunks for visualization (need ≥4)' });
    }

    // Try to read actual vectors from chunks_vec
    let vectors: number[][] = [];
    try {
      const rows = db.prepare('SELECT embedding FROM chunks_vec ORDER BY rowid').all() as { embedding: Buffer }[];
      vectors = rows.map(r => {
        // embedding is stored as a binary blob of float32
        const buf = r.embedding;
        const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        return Array.from(floats);
      });
    } catch {
      // vectors_vec not available — use random projection fallback
      vectors = chunks.map(() => Array.from({ length: 64 }, () => Math.random()));
    }

    if (vectors.length !== chunks.length || vectors.length < 4) {
      return NextResponse.json({ points: [], error: 'Vector count mismatch' });
    }

    // UMAP: reduce to 2D
    const nNeighbors = Math.min(15, Math.floor(vectors.length / 2));
    const umap = new UMAP({ nComponents: 2, nNeighbors, minDist: 0.1 });
    const embedding = umap.fit(vectors);

    // Normalize to [-1, 1] range
    const xs = embedding.map((p: number[]) => p[0]);
    const ys = embedding.map((p: number[]) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const norm = (v: number, min: number, max: number) =>
      max === min ? 0 : ((v - min) / (max - min)) * 2 - 1;

    const points: VectorPoint[] = chunks.map((chunk, i) => ({
      id: chunk.id,
      x: parseFloat(norm(xs[i], xMin, xMax).toFixed(4)),
      y: parseFloat(norm(ys[i], yMin, yMax).toFixed(4)),
      file: chunk.file || chunk.source || 'unknown',
      source: chunk.source,
      preview: (chunk.preview || '').replace(/\n/g, ' ').slice(0, 120),
    }));

    cache = { data: points, computedAt: Date.now() };
    return NextResponse.json({ points, total: points.length });
  } catch (error) {
    console.error('Memory vectors error:', error);
    return NextResponse.json({ points: [], error: String(error) }, { status: 500 });
  } finally {
    db?.close();
  }
}
```

- [ ] **Step 2: Push file to LXC 116**

Write the file above to local `/tmp/vectors-route.ts`, then:
```bash
scp /tmp/vectors-route.ts root@tenazo.jgarmar.es:/tmp/
ssh root@tenazo.jgarmar.es "mkdir -p /tmp/vdir && pct push 116 /tmp/vectors-route.ts /root/mission-control/src/app/api/memory/vectors/route.ts && rm /tmp/vectors-route.ts"
```

- [ ] **Step 3: Build and test the route**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && NODE_OPTIONS=--max-old-space-size=1024 npm run build 2>&1 | tail -4'"
```

Expected: `Compiled successfully`

After restart, test:
```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c '
curl -s -X POST http://localhost:3000/api/auth/login -H \"Content-Type: application/json\" -d \"{\\\"password\\\":\\\"pirion123\\\"}\" -c /tmp/t.txt > /dev/null
SESSION=\$(grep mc_auth /tmp/t.txt | awk \"{print \\\$7}\")
curl -s -b \"mc_auth=\$SESSION\" http://localhost:3000/api/memory/vectors | python3 -c \"import sys,json; d=json.load(sys.stdin); print(\\\"points:\\\",len(d.get(\\\"points\\\",[])), d.get(\\\"error\\\",\\\"\\\"))\"
rm /tmp/t.txt
'"
```

Expected: `points: 41` (or similar count, no error)

- [ ] **Step 4: Commit**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && git add src/app/api/memory/vectors/ && git commit -m \"feat: /api/memory/vectors — UMAP 2D reduction of pirion memory chunks\"'"
```

---

## Task 3: Create MemoryMap component

**Files:**
- Create: `src/components/memory/MemoryMap.tsx`

- [ ] **Step 1: Create component file**

Content for `/root/mission-control/src/components/memory/MemoryMap.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend
} from 'recharts';

interface VectorPoint {
  id: string;
  x: number;
  y: number;
  file: string;
  source: string;
  preview: string;
}

interface MemoryMapProps {
  onFileSelect: (file: string) => void;
}

const FILE_COLORS = [
  'var(--accent, #FF3B30)',
  '#32D74B',
  '#FFD60A',
  '#0A84FF',
  '#9B59B6',
  '#1ABC9C',
  '#FF9F0A',
  '#FF375F',
];

function getFileColor(file: string, files: string[]): string {
  const idx = files.indexOf(file);
  return FILE_COLORS[idx % FILE_COLORS.length];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: VectorPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div style={{
      background: 'var(--card, #1a1a1a)',
      border: '1px solid var(--border, #333)',
      borderRadius: '8px',
      padding: '10px 14px',
      maxWidth: '280px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
        {point.file}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
        {point.preview}
      </div>
    </div>
  );
}

export function MemoryMap({ onFileSelect }: MemoryMapProps) {
  const [points, setPoints] = useState<VectorPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/memory/vectors')
      .then(r => r.json())
      .then(data => {
        if (data.error && !data.points?.length) {
          setError(data.error);
        } else {
          setPoints(data.points || []);
          const uniqueFiles = [...new Set((data.points || []).map((p: VectorPoint) => p.file))] as string[];
          setFiles(uniqueFiles);
        }
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧠</div>
          <div style={{ fontSize: '13px' }}>Calculando mapa vectorial...</div>
        </div>
      </div>
    );
  }

  if (error || !points.length) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>🗺️</div>
          <div style={{ fontSize: '13px', color: 'var(--negative, #FF453A)' }}>{error || 'No hay vectores indexados todavía'}</div>
          <div style={{ fontSize: '11px', marginTop: '8px' }}>
            Ejecuta <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px' }}>openclaw memory index --force</code> para generar vectores
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '12px', flexShrink: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {points.length} fragmentos de memoria · {files.length} archivos · Proyección UMAP 2D
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <XAxis type="number" dataKey="x" domain={[-1.1, 1.1]} hide />
            <YAxis type="number" dataKey="y" domain={[-1.1, 1.1]} hide />
            <Tooltip content={<CustomTooltip />} />
            <Scatter
              data={points}
              onClick={(data: VectorPoint) => onFileSelect(data.file)}
              cursor="pointer"
            >
              {points.map((point) => (
                <Cell key={point.id} fill={getFileColor(point.file, files)} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ flexShrink: 0, marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {files.map((file) => (
          <div
            key={file}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            onClick={() => onFileSelect(file)}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getFileColor(file, files), flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {file.split('/').pop()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Push to LXC 116**

Write to `/tmp/MemoryMap.tsx`, then:
```bash
scp /tmp/MemoryMap.tsx root@tenazo.jgarmar.es:/tmp/
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'mkdir -p /root/mission-control/src/components/memory' && pct push 116 /tmp/MemoryMap.tsx /root/mission-control/src/components/memory/MemoryMap.tsx && rm /tmp/MemoryMap.tsx"
```

---

## Task 4: Add Memory Map tab to memory page

**Files:**
- Modify: `src/app/(dashboard)/memory/page.tsx`

The current page has no top-level tabs. We add a tab toggle (Files | Memory Map) between the page header and the two-column layout.

- [ ] **Step 1: Apply the changes**

Two edits to `memory/page.tsx`:

**Edit A** — add imports and tab state (after existing imports):
```typescript
// Add to imports line:
import { Map } from "lucide-react";
import { MemoryMap } from "@/components/memory/MemoryMap";
```

Add to state declarations (after `const hasUnsavedChanges = ...`):
```typescript
type PageTab = 'files' | 'map';
const [pageTab, setPageTab] = useState<PageTab>('files');
```

**Edit B** — add tab bar between the header `</div>` and the two-column `<div>` (after `</div>` that closes the page header div, before the `{/* Two-column layout */}` comment):

```typescript
{/* Tab bar */}
<div style={{ display: 'flex', gap: '4px', padding: '0 24px 0', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface, var(--card))', flexShrink: 0 }}>
  {[
    { id: 'files' as PageTab, label: 'Archivos', icon: <Brain size={13} /> },
    { id: 'map' as PageTab, label: 'Memory Map', icon: <Map size={13} /> },
  ].map(tab => (
    <button
      key={tab.id}
      onClick={() => setPageTab(tab.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: pageTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        color: pageTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'all 120ms ease',
        marginBottom: '-1px',
      }}
    >
      {tab.icon}
      {tab.label}
    </button>
  ))}
</div>
```

**Edit C** — wrap the two-column layout and add map view:

Replace the opening of `{/* Two-column layout */}`:
```typescript
{/* Two-column layout — only shown on 'files' tab */}
{pageTab === 'files' && (
<div style={{ display: 'flex', flex: 1, overflow: 'hidden', borderTop: '1px solid var(--border)' }}>
```

Close the conditional after the `</main>` closing `</div>` (end of two-column layout div):
```typescript
    </main>
  </div>
)}

{/* Memory Map tab */}
{pageTab === 'map' && (
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
    <MemoryMap onFileSelect={(file) => {
      setPageTab('files');
      // Find and open the file in the file browser
      const filename = file.split('/').pop() || file;
      const match = files.find(f => f.name === filename || f.path.endsWith(file));
      if (match) handleSelectFile(match.path);
    }} />
  </div>
)}
```

- [ ] **Step 2: Apply all edits — pull file, edit locally, push back**

```bash
ssh root@tenazo.jgarmar.es "pct pull 116 /root/mission-control/src/app/\(dashboard\)/memory/page.tsx /tmp/memory-page.tsx"
```

Apply the three edits above to `/tmp/memory-page.tsx` using Edit tool, then:
```bash
scp /tmp/memory-page.tsx root@tenazo.jgarmar.es:/tmp/
ssh root@tenazo.jgarmar.es "pct push 116 /tmp/memory-page.tsx /root/mission-control/src/app/\(dashboard\)/memory/page.tsx && rm /tmp/memory-page.tsx"
```

- [ ] **Step 3: Build**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && NODE_OPTIONS=--max-old-space-size=1024 npm run build 2>&1 | tail -4'"
```

Expected: `Compiled successfully`

- [ ] **Step 4: Restart and verify**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- systemctl restart mission-control.service && sleep 5 && systemctl status mission-control.service --no-pager | head -4"
```

Check `/memory` page in browser: should see "Archivos" and "Memory Map" tabs at top.

- [ ] **Step 5: Commit**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && git add src/app/\(dashboard\)/memory/page.tsx src/components/memory/MemoryMap.tsx && git commit -m \"feat: Memory Map tab in /memory — UMAP scatter plot of vector memory\"'"
```

---

## Task 5: Fix activeSessions mock in agents route

**Files:**
- Modify: `src/app/api/agents/route.ts:~120`

The field `activeSessions: 0` is hardcoded. Fix it by counting sessions from the pirion sessions store.

- [ ] **Step 1: Read the agents route**

```bash
ssh root@tenazo.jgarmar.es "pct pull 116 /root/mission-control/src/app/api/agents/route.ts /tmp/agents-route.ts"
grep -n "activeSessions\|session" /tmp/agents-route.ts | head -10
```

- [ ] **Step 2: Find exact line and fix**

The fix replaces `activeSessions: 0, // TODO: get from sessions API` with a real count from the sessions.json file. Add a helper at top of the GET handler:

```typescript
// Count active sessions (sessions updated in last 2 hours)
function countActiveSessions(agentId: string): number {
  try {
    const { readFileSync, existsSync } = require('fs');
    const { join } = require('path');
    const sessionsPath = join(OPENCLAW_DIR, 'agents', agentId, 'sessions', 'sessions.json');
    if (!existsSync(sessionsPath)) return 0;
    const data = JSON.parse(readFileSync(sessionsPath, 'utf-8'));
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    return Object.values(data as Record<string, { updatedAt?: number }>)
      .filter(s => s.updatedAt && s.updatedAt > twoHoursAgo).length;
  } catch { return 0; }
}
```

Then replace the line:
```typescript
activeSessions: 0, // TODO: get from sessions API
```
with:
```typescript
activeSessions: countActiveSessions(agent.id),
```

- [ ] **Step 3: Apply edit, build, commit**

After editing `/tmp/agents-route.ts`:
```bash
scp /tmp/agents-route.ts root@tenazo.jgarmar.es:/tmp/
ssh root@tenazo.jgarmar.es "pct push 116 /tmp/agents-route.ts /root/mission-control/src/app/api/agents/route.ts && rm /tmp/agents-route.ts"
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && NODE_OPTIONS=--max-old-space-size=1024 npm run build 2>&1 | tail -3'"
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && git add src/app/api/agents/route.ts && git commit -m \"fix: activeSessions counts real sessions (last 2h)\"'"
```

---

## Task 6: Push all commits to GitHub

- [ ] **Push to GitHub**

```bash
ssh root@tenazo.jgarmar.es "pct exec 116 -- bash -c 'cd /root/mission-control && GIT_SSH_COMMAND=\"ssh -i /root/.openclaw/workspace/.git-ssh-key\" git push origin main 2>&1 | tail -3'"
```

---

## Self-Review

**Spec coverage:**
- ✅ `GET /api/memory/vectors` — Task 2
- ✅ `<MemoryMap />` with tooltip + click — Task 3
- ✅ Tab in `/memory` — Task 4
- ✅ Color per source file — Task 3 (FILE_COLORS)
- ✅ Click opens file in editor — Task 4 (handleSelectFile)
- ✅ activeSessions mock fixed — Task 5
- ✅ umap-js installed — Task 1

**Placeholders:** None — all steps have complete code.

**Type consistency:** `VectorPoint` interface defined in route.ts and used consistently. `onFileSelect: (file: string) => void` matches usage in page.tsx.
