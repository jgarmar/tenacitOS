export const AGENT_DATA = {
  pirion: {
    id: 'pirion',
    name: 'Pirion',
    emoji: '🧙‍♂️',
    color: '#6366f1',
    isActive: false,
    currentTask: 'idle',
    activity: 'idle'
  },
  coder: {
    id: 'coder',
    name: 'Coder',
    emoji: '💻',
    color: '#22c55e',
    isActive: false,
    currentTask: 'idle',
    activity: 'idle'
  },
  worker: {
    id: 'worker',
    name: 'Worker',
    emoji: '⚙️',
    color: '#eab308',
    isActive: false,
    currentTask: 'idle',
    activity: 'idle'
  },
  fitness: {
    id: 'fitness',
    name: 'Fitness',
    emoji: '🏃',
    color: '#f97316',
    isActive: false,
    currentTask: 'idle',
    activity: 'idle'
  },
  investigator: {
    id: 'investigator',
    name: 'Investigator',
    emoji: '🔍',
    color: '#ff4757',
    isActive: false,
    currentTask: 'idle',
    activity: 'idle'
  }
};

export async function GET() {
  return { agents: Object.values(AGENT_DATA) };
}