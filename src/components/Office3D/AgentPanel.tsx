'use client';

import { X, MessageSquare, History, Zap, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { AgentConfig, AgentState } from './agentsConfig';

interface AgentPanelProps {
  agent: AgentConfig;
  state: AgentState;
  onClose: () => void;
}

interface Activity {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  status: string;
  duration_ms?: number;
  tokens_used?: number;
}

export default function AgentPanel({ agent, state, onClose }: AgentPanelProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/activities?agent=${agent.id}&limit=5&sort=newest`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.activities?.length) setActivities(data.activities);
      })
      .catch(() => {});
  }, [agent.id]);

  const getStatusColor = () => {
    switch (state.status) {
      case 'working': return 'text-green-500';
      case 'thinking': return 'text-blue-500 animate-pulse';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBgColor = () => {
    switch (state.status) {
      case 'working': return 'bg-green-500/20';
      case 'thinking': return 'bg-blue-500/20';
      case 'error': return 'bg-red-500/20';
      default: return 'bg-gray-500/20';
    }
  };

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const runAction = async (action: string) => {
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setActionResult(data.output || data.error || 'Done');
    } catch {
      setActionResult('Error running action');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-black/90 backdrop-blur-md text-white p-6 shadow-2xl border-l border-white/10 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-4xl">{agent.emoji}</span>
            {agent.name}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{agent.role}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Status badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 ${getStatusBgColor()}`}>
        <div className={`w-2 h-2 rounded-full ${state.status === 'thinking' ? 'animate-pulse' : ''}`} style={{ backgroundColor: agent.color }} />
        <span className={`text-sm font-medium ${getStatusColor()}`}>{state.status.toUpperCase()}</span>
      </div>

      {/* Current task */}
      {state.currentTask && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Current Task</h3>
          <p className="text-base">{state.currentTask}</p>
        </div>
      )}

      {/* Stats */}
      <div className="space-y-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-400">Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Model</p>
            <p className="text-sm font-bold capitalize truncate">{state.model || 'default'}</p>
          </div>
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Tokens/hour</p>
            <p className="text-lg font-bold">{state.tokensPerHour?.toLocaleString() || '—'}</p>
          </div>
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Queue</p>
            <p className="text-lg font-bold">{state.tasksInQueue ?? '—'}</p>
          </div>
          <div className="bg-white/5 p-3 rounded-lg">
            <p className="text-xs text-gray-400 mb-1">Uptime</p>
            <p className="text-lg font-bold">{state.uptime ? `${state.uptime}d` : '—'}</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Recent Activity</h3>
        {activities.length > 0 ? (
          <div className="space-y-2">
            {activities.map(a => (
              <div key={a.id} className="bg-white/5 p-3 rounded-lg text-sm">
                <p className="text-gray-400 text-xs mb-1">{formatTime(a.timestamp)} · {a.type}</p>
                <p className="truncate">{a.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm italic">No recent activity</p>
        )}
      </div>

      {/* Action result */}
      {actionResult && (
        <div className="mb-4 bg-white/5 p-3 rounded-lg text-xs font-mono text-gray-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
          {actionResult}
        </div>
      )}

      {/* Quick Actions */}
      <div className="pt-4 border-t border-white/10">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => window.open('https://openclaw.jgarmar.es', '_blank')}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            <MessageSquare size={14} /> Chat
          </button>
          <button
            onClick={() => window.location.href = '/sessions'}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            <History size={14} /> Historial
          </button>
          <button
            onClick={() => runAction('usage-stats')}
            disabled={actionLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Zap size={14} /> {actionLoading ? '...' : 'Stats'}
          </button>
          <button
            onClick={() => runAction('restart-gateway')}
            disabled={actionLoading}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm transition-colors text-red-400 disabled:opacity-50"
          >
            <XCircle size={14} /> Restart GW
          </button>
        </div>
      </div>
    </div>
  );
}
