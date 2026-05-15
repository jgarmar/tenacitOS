import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface AgentStatus {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isActive: boolean;
  activity: string;
  inputTokens: number;
  outputTokens: number;
}

const AGENT_META: Record<string, Omit<AgentStatus, "isActive" | "activity" | "inputTokens" | "outputTokens">> = {
  pirion: { id: "pirion", name: "Pirion", emoji: "🧙‍♂️", color: "#6366f1" },
  coder: { id: "coder", name: "Coder", emoji: "💻", color: "#22c55e" },
  worker: { id: "worker", name: "Worker", emoji: "⚙️", color: "#eab308" },
  fitness: { id: "fitness", name: "Fitness", emoji: "🏃", color: "#f97316" },
  investigator: { id: "investigator", name: "Investigador", emoji: "🔍", color: "#ff4757" },
};

export async function GET() {
  const agents: AgentStatus[] = [];

  try {
    const { stdout } = await execAsync("openclaw status --json", { timeout: 10000 });
    const status = JSON.parse(stdout);
    const recent: any[] = status.sessions?.recent ?? [];
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;

    for (const [key, meta] of Object.entries(AGENT_META)) {
      const session = recent.find(
        (s: any) => s.agentId === key || s.agentId === meta.id
      );

      if (session) {
        const isRecent = session.updatedAt && (now - session.updatedAt) < FIVE_MIN;
        const isRunning = session.status === "running" || isRecent;
        agents.push({
          ...meta,
          isActive: isRunning,
          activity: isRunning ? "working" : "idle",
          inputTokens: session.inputTokens || 0,
          outputTokens: session.outputTokens || 0,
        });
      } else {
        agents.push({
          ...meta,
          isActive: false,
          activity: "offline",
          inputTokens: 0,
          outputTokens: 0,
        });
      }
    }
  } catch (error) {
    // If openclaw command fails, return all offline
    for (const meta of Object.values(AGENT_META)) {
      agents.push({
        ...meta,
        isActive: false,
        activity: "offline",
        inputTokens: 0,
        outputTokens: 0,
      });
    }
  }

  return { agents };
}
