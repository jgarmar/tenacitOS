/**
 * Vector Memory Status API
 * GET /api/memory/vector-status
 */
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DB_PATH = path.join(os.homedir(), '.openclaw', 'memory', 'pirion.sqlite');

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });

    const chunksRow = db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as { cnt: number };
    const filesRow = db.prepare('SELECT COUNT(DISTINCT path) as cnt FROM chunks').get() as { cnt: number };
    const modelRow = db.prepare('SELECT DISTINCT model FROM chunks LIMIT 1').get() as { model: string } | undefined;
    const sourcesRows = db.prepare('SELECT DISTINCT source FROM chunks').all() as { source: string }[];
    const lastRow = db.prepare('SELECT MAX(updated_at) as ts FROM chunks').get() as { ts: number | null };

    const dimRow = db.prepare('SELECT embedding FROM chunks LIMIT 1').get() as { embedding: string } | undefined;
    let vectorDims = 0;
    if (dimRow) {
      try {
        const parsed = JSON.parse(dimRow.embedding);
        vectorDims = Array.isArray(parsed) ? parsed.length : 0;
      } catch { /* ignore */ }
    }

    db.close();

    const stat = fs.statSync(DB_PATH);
    const sizeMB = Math.round(stat.size / (1024 * 1024));

    const lastIndexedAt = lastRow?.ts ? new Date(lastRow.ts).toISOString() : null;

    return NextResponse.json({
      chunks: chunksRow.cnt,
      files: filesRow.cnt,
      model: modelRow?.model || 'unknown',
      vectorDims,
      lastIndexedAt,
      sizeMB,
      sources: sourcesRows.map((r) => r.source),
    });
  } catch (error) {
    console.error('[vector-status] Error:', error);
    return NextResponse.json({ error: 'Failed to load vector status' }, { status: 500 });
  }
}
