#!/usr/bin/env python3
"""
Scans OpenClaw agent JSONL sessions for tool calls and logs them to activities.db.
Run every 5 minutes via cron.
"""
import json
import os
import glob
import sqlite3
import hashlib
from datetime import datetime, timezone

DB_PATH = "/root/.openclaw/workspace/mission-control/data/activities.db"
AGENTS_DIR = "/root/.openclaw/agents"

TOOL_TYPE_MAP = {
    "exec": "command",
    "bash": "command",
    "run": "command",
    "read": "file",
    "file_read": "file",
    "write": "file",
    "file_write": "file",
    "memory_search": "memory",
    "memory_write": "memory",
    "memory_read": "memory",
    "web_search": "search",
    "browser": "search",
    "search": "search",
    "subagents": "task",
    "sessions_spawn": "task",
    "task_create": "task",
    "send_message": "message",
    "telegram_send": "message",
}

def get_tool_type(name):
    return TOOL_TYPE_MAP.get(name.lower(), "tool_call")

def describe_tool_call(name, arguments):
    n = name.lower()
    if n in ("exec", "bash", "run"):
        cmd = str(arguments.get("command", "")).strip()
        return "exec: " + cmd[:100]
    if n in ("read", "file_read"):
        return "read: " + str(arguments.get("path", arguments.get("file", "")))
    if n in ("write", "file_write"):
        return "write: " + str(arguments.get("path", arguments.get("file", "")))
    if n == "memory_search":
        return "memory search: " + str(arguments.get("query", ""))[:80]
    if n in ("web_search", "search"):
        return "web search: " + str(arguments.get("query", ""))[:80]
    if n in ("send_message", "telegram_send"):
        return "message: " + str(arguments.get("message", arguments.get("text", "")))[:80]
    first_val = ""
    if arguments:
        first_val = str(list(arguments.values())[0])[:80]
    return (name + ": " + first_val) if first_val else name

def init_db(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS activity_baselines (
            session_key TEXT PRIMARY KEY,
            last_line_index INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
    """)
    db.commit()

def get_baseline(db, session_key):
    row = db.execute(
        "SELECT last_line_index FROM activity_baselines WHERE session_key = ?",
        (session_key,)
    ).fetchone()
    return row[0] if row else 0

def set_baseline(db, session_key, index):
    db.execute("""
        INSERT INTO activity_baselines (session_key, last_line_index, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
            last_line_index=excluded.last_line_index,
            updated_at=excluded.updated_at
    """, (session_key, index, datetime.now(timezone.utc).isoformat()))
    db.commit()

def process_jsonl_file(db, path, agent_id):
    session_key = agent_id + ":" + os.path.basename(path)
    baseline = get_baseline(db, session_key)

    try:
        lines = open(path, errors='replace').read().strip().split('\n')
    except Exception:
        return

    new_baseline = len(lines)
    inserted = 0

    # Build map of toolCallId -> error status from toolResult messages
    result_status = {}
    for line in lines:
        try:
            d = json.loads(line)
            if d.get('type') == 'message':
                msg = d.get('message', {})
                if msg.get('role') == 'toolResult':
                    tool_id = msg.get('toolCallId', '')
                    content = msg.get('content', [])
                    is_error = False
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict):
                                text = str(block.get('text', ''))
                                if 'exit code' in text.lower() and 'code 0' not in text.lower():
                                    is_error = True
                                    break
                    result_status[tool_id] = 'error' if is_error else 'success'
        except Exception:
            pass

    # Process only new lines since last baseline
    for i, line in enumerate(lines[baseline:], baseline):
        try:
            d = json.loads(line)
            if d.get('type') != 'message':
                continue
            msg = d.get('message', {})
            if msg.get('role') != 'assistant':
                continue
            content = msg.get('content', [])
            if not isinstance(content, list):
                continue

            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get('type') != 'toolCall':
                    continue

                tool_name = block.get('name', '')
                tool_id = block.get('id', '')
                arguments = block.get('arguments', {})
                if not isinstance(arguments, dict):
                    try:
                        arguments = json.loads(arguments) if isinstance(arguments, str) else {}
                    except Exception:
                        arguments = {}

                activity_id = hashlib.sha1(
                    (session_key + ":" + str(i) + ":" + tool_id).encode()
                ).hexdigest()[:16]
                activity_type = get_tool_type(tool_name)
                description = describe_tool_call(tool_name, arguments)
                status = result_status.get(tool_id, 'success')
                timestamp = d.get('timestamp', datetime.now(timezone.utc).isoformat())
                metadata = json.dumps({
                    "tool": tool_name,
                    "session": session_key,
                    "agent": agent_id,
                })

                db.execute("""
                    INSERT OR IGNORE INTO activities
                        (id, timestamp, type, description, status, agent, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (activity_id, timestamp, activity_type, description, status, agent_id, metadata))
                inserted += 1

        except Exception:
            pass

    if inserted > 0:
        db.commit()
        print("  " + agent_id + "/" + os.path.basename(path) + ": +" + str(inserted) + " activities")

    set_baseline(db, session_key, new_baseline)

def main():
    db = sqlite3.connect(DB_PATH)
    init_db(db)

    # Prune activities older than 30 days
    db.execute("""
        DELETE FROM activities
        WHERE datetime(timestamp) < datetime('now', '-30 days')
    """)
    db.commit()

    for jsonl_path in glob.glob(os.path.join(AGENTS_DIR, "*/sessions/*.jsonl")):
        if 'trajectory' in jsonl_path:
            continue
        agent_id = os.path.basename(os.path.dirname(os.path.dirname(jsonl_path)))
        process_jsonl_file(db, jsonl_path, agent_id)

    db.close()
    print("Done. " + datetime.now().isoformat())

if __name__ == "__main__":
    main()
