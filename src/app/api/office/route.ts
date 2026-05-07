import { NextResponse } from "next/server";
import { readFileSync, statSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || "/root/.openclaw";

const AGENT_CONFIG: Record<string, { emoji: string; color: string; name: string; role: string }> = {
  pirion:  { emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || "🧙‍♂️", color: "#6366f1", name: process.env.NEXT_PUBLIC_AGENT_NAME || "Pirion", role: "Master Agent" },
  coder:   { emoji: "💻", color: "#22c55e", name: "Coder",   role: "Developer" },
  fitness: { emoji: "🏃", color: "#f97316", name: "Fitness", role: "Coach" },
  worker:  { emoji: "⚙️",  color: "#eab308", name: "Worker",  role: "Background Tasks" },
};

type Activity = "idle" | "memory" | "coding" | "telegram" | "delegating" | "working";

const TOOL_ACTIVITY: Record<string, Activity> = {
  memory_search: "memory", memory_write: "memory", memory_read: "memory",
  memory_store: "memory", memory_recall: "memory",
  exec: "coding", bash: "coding", write_file: "coding", edit_file: "coding",
  read_file: "coding", file_write: "coding", file_read: "coding",
  sessions_spawn: "delegating", subagents: "delegating", sessions_yield: "delegating",
};

function getLastToolFromJSONL(filePath: string): Activity {
  try {
    const stat = statSync(filePath);
    const size = stat.size;
    if (size === 0) return "working";

    // Read last 8KB
    const { openSync, readSync, closeSync } = require("fs");
    const fd = openSync(filePath, "r");
    const bufSize = Math.min(8192, size);
    const buf = Buffer.alloc(bufSize);
    readSync(fd, buf, 0, bufSize, size - bufSize);
    closeSync(fd);

    const tail = buf.toString("utf-8");
    const lines = tail.split("\n").filter(Boolean).reverse();

    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.type !== "message") continue;
        const msg = d.message;
        if (!msg) continue;

        // Check for tool calls in assistant messages
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "toolCall" && c.name) {
              const act = TOOL_ACTIVITY[c.name as string];
              if (act) return act;
              return "working";
            }
          }
        }
      } catch {}
    }
    return "working";
  } catch {
    return "working";
  }
}

interface SessionEntry {
  updatedAt?: number;
  lastInteractionAt?: number;
  sessionStartedAt?: number;
  sessionFile?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function getAgentData(agentId: string): {
  isActive: boolean;
  currentTask: string;
  activity: Activity;
  tokensPerHour: number;
  uptime: number; // days
  tasksInQueue: number;
} {
  try {
    const sessionsPath = join(OPENCLAW_DIR, "agents", agentId, "sessions", "sessions.json");
    const sessions = JSON.parse(readFileSync(sessionsPath, "utf-8")) as Record<string, SessionEntry>;

    const now = Date.now();
    let mostRecentTs = 0;
    let mostRecentKey = "";
    let mostRecentVal: SessionEntry = {};
    let earliestStart = now;

    // Also look for running subagent tasks
    let hasActiveSubagent = false;

    for (const [key, val] of Object.entries(sessions)) {
      const ts = val.lastInteractionAt || val.updatedAt || 0;
      if (ts > mostRecentTs) {
        mostRecentTs = ts;
        mostRecentKey = key;
        mostRecentVal = val;
      }
      if (val.sessionStartedAt && val.sessionStartedAt < earliestStart) {
        earliestStart = val.sessionStartedAt;
      }
      // Subagent active recently?
      if (key.includes("subagent") && ts > now - 5 * 60 * 1000) {
        hasActiveSubagent = true;
      }
    }

    if (!mostRecentTs) {
      return { isActive: false, currentTask: "Sin actividad", activity: "idle", tokensPerHour: 0, uptime: 0, tasksInQueue: 0 };
    }

    const ageMin = (now - mostRecentTs) / 60000;
    const isActive = ageMin < 5;

    // Current task description
    let currentTask: string;
    if (isActive) {
      if (mostRecentKey.includes("telegram")) currentTask = "Hablando por Telegram";
      else if (mostRecentKey.includes("subagent")) currentTask = "Ejecutando subtarea";
      else currentTask = "Sesión activa";
    } else if (ageMin < 60) {
      currentTask = `Idle · hace ${Math.round(ageMin)}min`;
    } else if (ageMin < 1440) {
      currentTask = `Descansando · hace ${Math.round(ageMin / 60)}h`;
    } else {
      currentTask = `Inactivo · hace ${Math.round(ageMin / 1440)}d`;
    }

    // Activity type
    let activity: Activity = "idle";
    if (isActive) {
      if (mostRecentKey.includes("telegram")) {
        activity = "telegram";
      } else if (hasActiveSubagent || mostRecentKey.includes("subagent")) {
        activity = "delegating";
      } else {
        // Try to read last tool call from JSONL
        const sessionId = mostRecentVal.sessionFile
          ? mostRecentVal.sessionFile.split("/").pop()?.replace(".jsonl", "") ?? ""
          : "";
        if (sessionId) {
          const jsonlPath = join(OPENCLAW_DIR, "agents", agentId, "sessions", `${sessionId}.jsonl`);
          activity = getLastToolFromJSONL(jsonlPath);
        } else {
          activity = "working";
        }
      }
    }

    // Tokens/hour — main session tokens over session duration
    const mainSession = sessions[`agent:${agentId}:main`] || mostRecentVal;
    const tokens = (mainSession.inputTokens || 0) + (mainSession.outputTokens || 0);
    const sessionStart = mainSession.sessionStartedAt || mostRecentTs;
    const sessionHours = Math.max(0.05, (now - sessionStart) / 3600000);
    const tokensPerHour = Math.round(tokens / sessionHours);

    // Uptime in days (days since agent's first session start)
    const uptimeDays = parseFloat(((now - earliestStart) / 86400000).toFixed(1));

    // Tasks in queue — read from SQLite
    let tasksInQueue = 0;
    try {
      const Database = require("better-sqlite3");
      const db = new Database(join(OPENCLAW_DIR, "tasks", "runs.sqlite"), { readonly: true });
      const row = db.prepare(
        `SELECT COUNT(*) as n FROM task_runs WHERE agent_id = ? AND status IN ('queued','running')`
      ).get(agentId) as { n: number };
      tasksInQueue = row?.n ?? 0;
      db.close();
    } catch {}

    return { isActive, currentTask, activity, tokensPerHour, uptime: uptimeDays, tasksInQueue };
  } catch {
    return { isActive: false, currentTask: "Sin actividad", activity: "idle", tokensPerHour: 0, uptime: 0, tasksInQueue: 0 };
  }
}

export async function GET() {
  try {
    const configPath = join(OPENCLAW_DIR, "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    const agents = config.agents.list.map((agent: any) => {
      const info = AGENT_CONFIG[agent.id] ?? {
        emoji: "🤖", color: "#6b7280",
        name: agent.name || agent.id, role: "Agent",
      };

      const data = getAgentData(agent.id);
      const model = (
        agent.model?.primary || config.agents?.defaults?.model?.primary || ""
      ).replace("openrouter/", "");

      return {
        id: agent.id,
        name: info.name,
        emoji: info.emoji,
        color: info.color,
        role: info.role,
        currentTask: data.currentTask,
        isActive: data.isActive,
        activity: data.activity,
        model,
        tokensPerHour: data.tokensPerHour,
        uptime: data.uptime,
        tasksInQueue: data.tasksInQueue,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error getting office data:", error);
    return NextResponse.json({ error: "Failed to load office data" }, { status: 500 });
  }
}
