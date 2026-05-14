/**
 * Semantic Search API
 * POST /api/memory/semantic-search
 * Body: { query: string, limit?: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), '.openclaw', 'memory', 'pirion.sqlite');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

interface ChunkRow {
  id: string;
  path: string;
  source: string;
  start_line: number;
  end_line: number;
  text: string;
  embedding: string;
  updated_at: number;
}

interface SemanticResult {
  id: string;
  snippet: string;
  source: string;
  filePath: string;
  score: number;
  updatedAt: string;
  startLine: number;
  endLine: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : dot / d;
}

function extractSnippet(text: string, query: string): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 5);
  const qw = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  for (const line of lines) {
    const lo = line.toLowerCase();
    if (qw.some((w) => lo.includes(w))) {
      const c = line.replace(/^#+\s*/, '').trim();
      return c.length > 250 ? c.slice(0, 250) + '...' : c;
    }
  }
  const meaningful = lines.filter((l) => !l.startsWith('#') && l.trim().length > 10);
  const s = meaningful.slice(0, 3).join(' ').trim();
  return s.length > 250 ? s.slice(0, 250) + '...' : s || text.slice(0, 250);
}

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch(GEMINI_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text: query }] } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini embedding failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  const emb = data?.embedding?.values;
  if (!Array.isArray(emb) || emb.length === 0) throw new Error('No embedding from Gemini');
  return emb;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = (body.query as string)?.trim() || '';
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

    if (query.length < 2) return NextResponse.json({ error: 'Query too short' }, { status: 400 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const queryEmb = await embedQuery(query);

    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      'SELECT id, path, source, start_line, end_line, text, embedding, updated_at FROM chunks'
    ).all() as ChunkRow[];
    db.close();

    const scored: SemanticResult[] = [];
    for (const row of rows) {
      try {
        const emb = JSON.parse(row.embedding);
        if (!Array.isArray(emb) || emb.length === 0) continue;
        const ml = Math.min(queryEmb.length, emb.length);
        const score = cosineSimilarity(queryEmb.slice(0, ml), emb.slice(0, ml));
        scored.push({
          id: row.id,
          snippet: extractSnippet(row.text, query),
          source: row.source,
          filePath: row.path,
          score,
          updatedAt: new Date(row.updated_at).toISOString(),
          startLine: row.start_line,
          endLine: row.end_line,
        });
      } catch { /* skip */ }
    }

    scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({ query, results: scored.slice(0, limit), totalChunks: rows.length });
  } catch (error) {
    console.error('[semantic-search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    );
  }
}
