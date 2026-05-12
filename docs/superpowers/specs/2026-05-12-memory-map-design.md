# Memory Map — Design Spec

**Date:** 2026-05-12  
**Feature:** Vector memory scatter plot visualization in TenacitOS mission-control  
**Location:** New "Memory Map" tab inside `/memory` page

---

## Context

Pirion's memory is indexed nightly via `openclaw memory index --force` using Google Gemini (`gemini-embedding-001`, 3072 dims). Vectors and text chunks are stored in `/root/.openclaw/memory/pirion.sqlite`. Currently 41 chunks across ~10 files. The mission-control dashboard already has a `/memory` page for reading/editing `.md` files; this adds a visual "map" tab showing how memory chunks cluster semantically.

---

## Architecture

### Data flow

```
pirion.sqlite (41 vectors × 3072 dims)
        ↓
GET /api/memory/vectors
  - opens DB with { allowExtension: true }
  - loads sqlite-vec extension
  - reads chunks (id, source, file, text) + vectors from chunks_vec
  - runs t-SNE → 41 points in 2D
  - returns [{x, y, id, source, file, preview, chunkIndex}]
        ↓
<MemoryMap /> React component
  - recharts ScatterChart (already installed, no new deps except tsne-js)
  - color per source file
  - hover tooltip: chunk preview (first 120 chars)
  - click: dispatches file selection to /memory page editor
```

### New dependency

`tsne-js` (~2KB, MIT) — pure JS t-SNE, no native binaries, works in Node.js server context.

---

## Files

### 1. `src/app/api/memory/vectors/route.ts`

```
GET /api/memory/vectors?agent=pirion

- Requires auth (same mc_auth cookie check as other routes)
- Opens /root/.openclaw/memory/{agent}.sqlite with allowExtension: true
- Loads vec0.so from openclaw node_modules
- Queries:
    SELECT c.id, c.source, c.file, c.text, v.embedding
    FROM chunks c JOIN chunks_vec v ON c.id = v.id
- Runs t-SNE on embedding matrix (perplexity=5 for ~40 points)
- Returns JSON: { points: [{x, y, id, source, file, preview}], files: string[] }
- Caches result in memory for 5 minutes (recompute is fast ~100ms)
```

### 2. `src/components/memory/MemoryMap.tsx`

```
Props: { onFileSelect: (file: string) => void }

- useEffect → fetch /api/memory/vectors
- recharts <ScatterChart>:
    - CustomDot: circle, color by file, size=8
    - <Tooltip>: shows file name + text preview
    - <Legend>: list of source files with colors
- On dot click: calls onFileSelect(file) to open in editor
- Loading state: spinner
- Empty state: "No hay vectores indexados todavía"
- TenacitOS dark theme colors (CSS variables)
```

### 3. Modify `src/app/(dashboard)/memory/page.tsx`

```
- Add 'map' to tab state: 'files' | 'map'
- Add "Memory Map" tab button next to existing tabs
- Render <MemoryMap onFileSelect={handleFileSelect} /> when tab === 'map'
- handleFileSelect: sets selected file and switches back to 'files' tab
```

---

## Color scheme

File colors from TenacitOS palette cycling through:
`--color-accent` (red), `--color-success` (green), `--color-warning` (yellow),  
`--color-info` (blue), `#9B59B6` (purple), `#1ABC9C` (teal)...

---

## Error handling

- If sqlite-vec fails to load → return `{ points: [], error: "Vector store unavailable" }`
- If no vectors → return empty points, show empty state in UI
- Auth failure → 401 (same as all other routes)

---

## Out of scope

- No server-sent events / real-time updates (reloads on tab switch)
- No zoom/pan on the scatter (recharts limitation, acceptable for 41 points)
- No edge drawing between related nodes (add later if needed)
- No other agents (only pirion for now, agent param reserved)
