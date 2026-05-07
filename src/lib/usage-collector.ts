/**
 * Usage Collector - Reads OpenClaw session data and calculates costs
 */

import { exec } from "child_process";
import { promisify } from "util";
import { calculateCost, normalizeModelId } from "./pricing";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

export interface SessionData {
  agentId: string;
  sessionKey: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: number;
  percentUsed: number;
}

export interface UsageSnapshot {
  timestamp: number;
  date: string;
  hour: number;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export async function getOpenClawStatus(): Promise<any> {
  try {
    const { stdout } = await execAsync("openclaw status --json");
    return JSON.parse(stdout);
  } catch (error) {
    console.error("Error getting OpenClaw status:", error);
    throw error;
  }
}

export function extractSessionData(status: any): SessionData[] {
  const sessions: SessionData[] = [];
  const recent: any[] = status.sessions?.recent ?? [];

  for (const session of recent) {
    if (!session.agentId || !session.sessionId) continue;
    sessions.push({
      agentId: session.agentId,
      sessionKey: session.key,
      sessionId: session.sessionId,
      model: normalizeModelId(session.model || "unknown"),
      inputTokens: session.inputTokens || 0,
      outputTokens: session.outputTokens || 0,
      totalTokens: session.totalTokens || 0,
      updatedAt: session.updatedAt || Date.now(),
      percentUsed: session.percentUsed || 0,
    });
  }

  return sessions;
}

export function initDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cost REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_date ON usage_snapshots(date);
    CREATE INDEX IF NOT EXISTS idx_agent ON usage_snapshots(agent_id);
    CREATE INDEX IF NOT EXISTS idx_model ON usage_snapshots(model);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON usage_snapshots(timestamp);

    CREATE TABLE IF NOT EXISTS session_baselines (
      session_key TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  return db;
}

export function saveSnapshot(
  db: Database.Database,
  snapshot: UsageSnapshot
): void {
  db.prepare(`
    INSERT INTO usage_snapshots
      (timestamp, date, hour, agent_id, model, input_tokens, output_tokens, total_tokens, cost)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.timestamp,
    snapshot.date,
    snapshot.hour,
    snapshot.agentId,
    snapshot.model,
    snapshot.inputTokens,
    snapshot.outputTokens,
    snapshot.totalTokens,
    snapshot.cost
  );
}

export async function collectUsage(dbPath: string): Promise<void> {
  const db = initDatabase(dbPath);

  try {
    const status = await getOpenClawStatus();
    const sessions = extractSessionData(status);
    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString().split("T")[0];
    const hour = new Date(timestamp).getUTCHours();

    let inserted = 0;

    for (const session of sessions) {
      const baseline = db.prepare(
        `SELECT input_tokens, output_tokens, total_tokens FROM session_baselines WHERE session_key = ?`
      ).get(session.sessionKey) as { input_tokens: number; output_tokens: number; total_tokens: number } | undefined;

      const deltaInput = Math.max(0, session.inputTokens - (baseline?.input_tokens ?? 0));
      const deltaOutput = Math.max(0, session.outputTokens - (baseline?.output_tokens ?? 0));
      const deltaTotal = Math.max(0, session.totalTokens - (baseline?.total_tokens ?? 0));

      if (deltaInput > 0 || deltaOutput > 0) {
        saveSnapshot(db, {
          timestamp,
          date,
          hour,
          agentId: session.agentId,
          model: session.model,
          inputTokens: deltaInput,
          outputTokens: deltaOutput,
          totalTokens: deltaTotal,
          cost: calculateCost(session.model, deltaInput, deltaOutput),
        });
        inserted++;
      }

      db.prepare(`
        INSERT INTO session_baselines (session_key, session_id, agent_id, model, input_tokens, output_tokens, total_tokens, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
          session_id = excluded.session_id,
          model = excluded.model,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          total_tokens = excluded.total_tokens,
          updated_at = excluded.updated_at
      `).run(
        session.sessionKey,
        session.sessionId,
        session.agentId,
        session.model,
        session.inputTokens,
        session.outputTokens,
        session.totalTokens,
        session.updatedAt
      );
    }

    console.log(`Collected usage: ${inserted} new snapshots for ${date} ${hour}:00 UTC`);
  } finally {
    db.close();
  }
}
