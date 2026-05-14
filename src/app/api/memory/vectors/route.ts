/**
 * Vector Memory — PCA 2D Projection API
 * GET /api/memory/vectors
 */
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), '.openclaw', 'memory', 'pirion.sqlite');

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

interface ScatterPoint {
  id: string;
  label: string;
  snippet: string;
  source: string;
  filePath: string;
  x: number;
  y: number;
  updatedAt: string;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(a: number[]): number[] {
  const n = Math.sqrt(dot(a, a));
  if (n === 0) return a.map(() => 0);
  return a.map((v) => v / n);
}

function matVec(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => dot(row, vec));
}

function powerIteration(mat: number[][], dims: number, iterations = 50): number[] {
  let vec = Array.from({ length: dims }, () => Math.random() - 0.5);
  vec = normalize(vec);
  for (let iter = 0; iter < iterations; iter++) {
    vec = normalize(matVec(mat, vec));
  }
  return vec;
}

function pca2D(data: number[][]): number[][] {
  if (data.length === 0) return [];
  if (data.length === 1) return [[0, 0]];

  const dims = data[0].length;
  const n = data.length;

  // Center
  const mean = Array(dims).fill(0);
  for (const row of data) for (let j = 0; j < dims; j++) mean[j] += row[j];
  for (let j = 0; j < dims; j++) mean[j] /= n;
  const centered = data.map((row) => row.map((v, j) => v - mean[j]));

  // Random projection to ~50 dims
  const RD = Math.min(50, dims);
  const proj: number[][] = [];
  for (let i = 0; i < RD; i++) {
    const row: number[] = [];
    for (let j = 0; j < dims; j++) row.push(Math.random() * 2 - 1);
    proj.push(row);
  }
  const reduced: number[][] = centered.map((row) => proj.map((p) => dot(p, row)));

  // Covariance
  const cov: number[][] = Array.from({ length: RD }, () => Array(RD).fill(0));
  for (const row of reduced) {
    for (let i = 0; i < RD; i++) {
      for (let j = i; j < RD; j++) cov[i][j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < RD; i++) {
    for (let j = i; j < RD; j++) {
      cov[i][j] /= n;
      cov[j][i] = cov[i][j];
    }
  }

  const pc1 = powerIteration(cov, RD, 80);
  const cov2 = cov.map((row, i) => row.map((v, j) => v - pc1[i] * pc1[j] * dot(cov[i], pc1)));
  const pc2 = powerIteration(cov2, RD, 80);

  return reduced.map((row) => [dot(row, pc1), dot(row, pc2)]);
}

function extractLabel(text: string): string {
  const m = text.match(/^#{1,3}\s+(.+)/m);
  if (m) return m[1].trim().slice(0, 60);
  const first = text.split('\n').find((l) => l.trim().length > 0);
  return (first || '').trim().slice(0, 60) || 'chunk';
}

function extractSnippet(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 10 && !l.startsWith('#'));
  const s = lines.slice(0, 3).join(' ').trim();
  return s.length > 200 ? s.slice(0, 200) + '...' : s;
}

// Cache
let cached: {
  points: ScatterPoint[];
  totalPoints: number;
  uniqueSources: string[];
  computedAt: string;
} | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (cached && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cached);
    }

    const db = new Database(DB_PATH, { readonly: true });
    const rows = db.prepare(
      'SELECT id, path, source, start_line, end_line, text, embedding, updated_at FROM chunks ORDER BY updated_at DESC'
    ).all() as ChunkRow[];
    db.close();

    if (rows.length === 0) {
      return NextResponse.json({ points: [], totalPoints: 0, uniqueSources: [], computedAt: new Date().toISOString() });
    }

    const embeddings: number[][] = [];
    const validRows: ChunkRow[] = [];
    for (const row of rows) {
      try {
        const emb = JSON.parse(row.embedding);
        if (Array.isArray(emb) && emb.length > 0) {
          embeddings.push(emb);
          validRows.push(row);
        }
      } catch { /* skip */ }
    }

    if (embeddings.length === 0) {
      return NextResponse.json({ points: [], totalPoints: 0, uniqueSources: [], computedAt: new Date().toISOString() });
    }

    const projected = pca2D(embeddings);
    const uniqueSources = [...new Set(validRows.map((r) => r.path))];

    const points: ScatterPoint[] = validRows.map((row, i) => ({
      id: row.id,
      label: extractLabel(row.text),
      snippet: extractSnippet(row.text),
      source: row.source,
      filePath: row.path,
      x: projected[i]?.[0] ?? 0,
      y: projected[i]?.[1] ?? 0,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));

    const result = { points, totalPoints: points.length, uniqueSources, computedAt: new Date().toISOString() };
    cached = result;
    cacheTime = Date.now();

    return NextResponse.json(result);
  } catch (error) {
    console.error('[vectors] Error:', error);
    return NextResponse.json({ error: 'Failed to load vectors' }, { status: 500 });
  }
}
