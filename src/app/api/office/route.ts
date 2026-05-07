import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || "/root/.openclaw";

// Per-agent identity config — update here when agents change
const AGENT_CONFIG: Record<string, { emoji: string; color: string; name: string; role: string }> = {
  pirion:  { emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || "🧙‍♂️", color: "#6366f1", name: process.env.NEXT_PUBLIC_AGENT_NAME || "Pirion",  role: "Master Agent" },
  coder:   { emoji: "💻", color: "#22c55e", name: "Coder",   role: "Developer" },
  fitness: { emoji: "🏃", color: "#f97316", name: "Fitness", role: "Coach" },
  worker:  { emoji: "⚙️",  color: "#eab308", name: "Worker",  role: "Background Tasks" },
};

interface SessionEntry {
  updatedAt?: number;
  lastInteractionAt?: number;
}

function sessionKeyToTask(key: string): string {
  if (key.includes("telegram")) return "Telegram: conversación activa";
  if (key.includes("subagent"))  return "Ejecutando subtarea...";
  if (key.includes("main"))      return "Sesión principal activa";
  return "Trabajando...";
}

function getAgentStatus(agentId: string): { isActive: boolean; currentTask: string } {
  try {
    const sessionsPath = join(OPENCLAW_DIR, "agents", agentId, "sessions", "sessions.json");
    const sessions = JSON.parse(readFileSync(sessionsPath, "utf-8")) as Record<string, SessionEntry>;

    const now = Date.now();
    let mostRecentTs = 0;
    let mostRecentKey = "";

    for (const [key, val] of Object.entries(sessions)) {
      const ts = val.lastInteractionAt || val.updatedAt || 0;
      if (ts > mostRecentTs) {
        mostRecentTs = ts;
        mostRecentKey = key;
      }
    }

    if (!mostRecentTs) return { isActive: false, currentTask: "Sin actividad" };

    const ageMin = (now - mostRecentTs) / 60000;

    if (ageMin < 5)  return { isActive: true,  currentTask: sessionKeyToTask(mostRecentKey) };
    if (ageMin < 60) return { isActive: false,  currentTask: `Idle · hace ${Math.round(ageMin)}min` };
    if (ageMin < 1440) {
      const hrs = Math.round(ageMin / 60);
      return { isActive: false, currentTask: `Descansando · hace ${hrs}h` };
    }
    const days = Math.round(ageMin / 1440);
    return { isActive: false, currentTask: `Inactivo · hace ${days}d` };
  } catch {
    return { isActive: false, currentTask: "Sin actividad" };
  }
}

export async function GET() {
  try {
    const configPath = join(OPENCLAW_DIR, "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));

    const agents = config.agents.list.map((agent: any) => {
      const info = AGENT_CONFIG[agent.id] || {
        emoji: "🤖",
        color: "#6b7280",
        name: agent.name || agent.id,
        role: "Agent",
      };

      const status = getAgentStatus(agent.id);

      const model = (
        agent.model?.primary ||
        config.agents?.defaults?.model?.primary ||
        ""
      ).replace("openrouter/", "");

      return {
        id: agent.id,
        name: info.name,
        emoji: info.emoji,
        color: info.color,
        role: info.role,
        currentTask: status.currentTask,
        isActive: status.isActive,
        model,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error getting office data:", error);
    return NextResponse.json({ error: "Failed to load office data" }, { status: 500 });
  }
}
