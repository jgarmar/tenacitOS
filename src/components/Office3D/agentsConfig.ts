/**
 * Office 3D — Agent positional layout
 *
 * IDs must match openclaw.json agents.list[].id
 * Names/emojis/colors are overridden at runtime by /api/office.
 */

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  position: [number, number, number];
  color: string;
  role: string;
}

// Positions available for agents — first N positions are used based on agent count
export const POSITION_POOL: [number, number, number][] = [
  [0, 0, 0],     // center
  [-4, 0, -3],   // back-left
  [4, 0, -3],    // back-right
  [-4, 0, 3],    // front-left
  [4, 0, 3],     // front-right
  [0, 0, 5],     // front-center
];

// Fallback colors per slot
const SLOT_COLORS = ['#FFCC00', '#4CAF50', '#E91E63', '#0077B5', '#9C27B0', '#607D8B'];

// Default agents — overridden at runtime from /api/office
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'pirion',
    name: process.env.NEXT_PUBLIC_AGENT_NAME || 'Pirion',
    emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || '🧙‍♂️',
    position: POSITION_POOL[0],
    color: SLOT_COLORS[0],
    role: 'Main Agent',
  },
];

export function buildAgentsFromApi(
  apiAgents: { id: string; name: string; emoji: string; color: string; role: string }[]
): AgentConfig[] {
  return apiAgents.map((agent, i) => ({
    id: agent.id,
    name: agent.name,
    emoji: agent.emoji,
    color: agent.color || SLOT_COLORS[i % SLOT_COLORS.length],
    position: POSITION_POOL[i % POSITION_POOL.length],
    role: agent.role,
  }));
}

export type AgentStatus = 'idle' | 'working' | 'thinking' | 'error';
export type AgentActivity = 'idle' | 'memory' | 'coding' | 'telegram' | 'delegating' | 'working';

export interface AgentState {
  id: string;
  status: AgentStatus;
  activity: AgentActivity;
  currentTask?: string;
  model?: string;
  tokensPerHour?: number;
  tasksInQueue?: number;
  uptime?: number;
}
