#!/usr/bin/env python3
"""Incremental usage collector for mission-control. Tracks deltas per session."""
import json, sqlite3, subprocess, os
from datetime import datetime, timezone

DB_PATH = '/root/.openclaw/workspace/mission-control/data/usage-tracking.db'

PRICING = {
    'deepseek/deepseek-v4-flash': (0.27, 1.10),
    'google/gemini-2.5-flash': (0.15, 0.60),
    'google/gemini-2.5-flash-preview': (0.15, 0.60),
    'google/gemini-2.5-pro': (1.25, 5.00),
    'anthropic/claude-opus-4-6': (15.0, 75.0),
    'anthropic/claude-sonnet-4-5': (3.0, 15.0),
    'anthropic/claude-haiku-3-5': (0.80, 4.0),
    'minimax/minimax-m2.5': (0.30, 1.10),
}

def normalize(m):
    if not m: return 'google/gemini-2.5-flash'
    if 'gemini-2.5-flash' in m: return 'google/gemini-2.5-flash'
    if 'gemini-2.5-pro' in m: return 'google/gemini-2.5-pro'
    if 'deepseek-v4-flash' in m: return 'deepseek/deepseek-v4-flash'
    return m

def calc_cost(model, inp, out):
    p = PRICING.get(model, PRICING['google/gemini-2.5-flash'])
    return (inp / 1e6) * p[0] + (out / 1e6) * p[1]

status = json.loads(subprocess.check_output(['openclaw', 'status', '--json']))
sessions = status.get('sessions', {}).get('recent', [])

os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

c.executescript('''
CREATE TABLE IF NOT EXISTS usage_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL, date TEXT NOT NULL, hour INTEGER NOT NULL,
  agent_id TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, total_tokens INTEGER NOT NULL,
  cost REAL NOT NULL, created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_date ON usage_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_agent ON usage_snapshots(agent_id);
CREATE INDEX IF NOT EXISTS idx_model ON usage_snapshots(model);
CREATE INDEX IF NOT EXISTS idx_timestamp ON usage_snapshots(timestamp);
CREATE TABLE IF NOT EXISTS session_baselines (
  session_key TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
''')

now = int(datetime.now(timezone.utc).timestamp() * 1000)
date_now = datetime.now(timezone.utc).strftime('%Y-%m-%d')
hour_now = datetime.now(timezone.utc).hour
inserted = 0

for s in sessions:
    if not s.get('agentId') or not s.get('key'): continue
    model = normalize(s.get('model', ''))
    inp = s.get('inputTokens', 0) or 0
    out = s.get('outputTokens', 0) or 0
    total = s.get('totalTokens', 0) or 0
    key = s.get('key', '')
    sid = s.get('sessionId', '')
    ts = s.get('updatedAt', now) or now

    # Get baseline
    row = c.execute('SELECT input_tokens, output_tokens FROM session_baselines WHERE session_key=?', (key,)).fetchone()
    prev_in, prev_out = (row[0], row[1]) if row else (0, 0)

    delta_in = max(0, inp - prev_in)
    delta_out = max(0, out - prev_out)
    delta_total = max(0, total - (row[0]+row[1] if row else 0))

    if delta_in > 0 or delta_out > 0:
        cost = calc_cost(model, delta_in, delta_out)
        c.execute(
            'INSERT INTO usage_snapshots (timestamp, date, hour, agent_id, model, input_tokens, output_tokens, total_tokens, cost) VALUES (?,?,?,?,?,?,?,?,?)',
            (now, date_now, hour_now, s['agentId'], model, delta_in, delta_out, max(0, total-(row[0]+row[1] if row else 0)), cost)
        )
        inserted += 1
        print(f"  delta {s['agentId']} {model}: +in={delta_in} +out={delta_out} cost=${cost:.6f}")

    # Update baseline
    c.execute('''
        INSERT INTO session_baselines (session_key, session_id, agent_id, model, input_tokens, output_tokens, total_tokens, updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(session_key) DO UPDATE SET
          session_id=excluded.session_id, model=excluded.model,
          input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
          total_tokens=excluded.total_tokens, updated_at=excluded.updated_at
    ''', (key, sid, s['agentId'], model, inp, out, total, ts))

conn.commit()
conn.close()
print(f'Done: {inserted} new delta snapshots')
