'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { Suspense, useState, useEffect } from 'react';
import { Vector3 } from 'three';
import { DEFAULT_AGENTS, buildAgentsFromApi, POSITION_POOL } from './agentsConfig';
import type { AgentConfig, AgentState } from './agentsConfig';
import AgentDesk from './AgentDesk';
import Floor from './Floor';
import Walls from './Walls';
import Lights from './Lights';
import AgentPanel from './AgentPanel';
import FileCabinet from './FileCabinet';
import Whiteboard from './Whiteboard';
import CoffeeMachine from './CoffeeMachine';
import PlantPot from './PlantPot';
import WallClock from './WallClock';
import FirstPersonControls from './FirstPersonControls';
import MovingAvatar from './MovingAvatar';

export default function Office3D() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [interactionModal, setInteractionModal] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'orbit' | 'fps'>('orbit');
  const [avatarPositions, setAvatarPositions] = useState<Map<string, any>>(new Map());
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch('/api/office', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.agents || !Array.isArray(data.agents)) return;

        const configs = buildAgentsFromApi(data.agents);
        setAgents(configs);

        const states: Record<string, AgentState> = {};
        for (const a of data.agents) {
          const status: AgentState['status'] = a.isActive ? 'working' : 'idle';
          states[a.id] = {
            id: a.id,
            status,
            activity: a.activity || 'idle',
            currentTask: a.currentTask || '',
            model: a.model || undefined,
            tokensPerHour: a.tokensPerHour,
            tasksInQueue: a.tasksInQueue,
            uptime: a.uptime,
          };
        }
        setAgentStates(states);
      } catch {
        // keep defaults on error
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 5_000);
    return () => clearInterval(interval);
  }, []);

  const handleDeskClick = (agentId: string) => setSelectedAgent(agentId);
  const handleClosePanel = () => setSelectedAgent(null);
  const handleFileCabinetClick = () => setInteractionModal('memory');
  const handleWhiteboardClick = () => setInteractionModal('roadmap');
  const handleCoffeeClick = () => setInteractionModal('energy');
  const handleCloseModal = () => setInteractionModal(null);
  const handleAvatarPositionUpdate = (id: string, position: any) => {
    setAvatarPositions(prev => new Map(prev).set(id, position));
  };

  const obstacles = [
    ...agents.map(agent => ({
      position: new Vector3(agent.position[0], 0, agent.position[2]),
      radius: 1.5,
    })),
    { position: new Vector3(-8, 0, -5), radius: 0.8 },
    { position: new Vector3(0, 0, -8), radius: 1.5 },
    { position: new Vector3(8, 0, -5), radius: 0.6 },
    { position: new Vector3(-7, 0, 6), radius: 0.5 },
    { position: new Vector3(7, 0, 6), radius: 0.5 },
    { position: new Vector3(-9, 0, 0), radius: 0.4 },
    { position: new Vector3(9, 0, 0), radius: 0.4 },
  ];

  const defaultState = (id: string): AgentState => ({ id, status: 'idle' as const, activity: 'idle' as const });

  return (
    <div className="fixed inset-0 bg-gray-900" style={{ height: '100vh', width: '100vw' }}>
      <Canvas
        camera={{ position: [0, 8, 12], fov: 60 }}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        }>
          <Lights />
          <Sky sunPosition={[100, 20, 100]} />
          <Environment preset="sunset" />
          <Floor />
          <Walls />

          {agents.map((agent) => (
            <AgentDesk
              key={agent.id}
              agent={agent}
              state={agentStates[agent.id] ?? defaultState(agent.id)}
              onClick={() => handleDeskClick(agent.id)}
              isSelected={selectedAgent === agent.id}
            />
          ))}

          {agents.map((agent) => (
            <MovingAvatar
              key={`avatar-${agent.id}`}
              agent={agent}
              state={agentStates[agent.id] ?? defaultState(agent.id)}
              officeBounds={{ minX: -8, maxX: 8, minZ: -7, maxZ: 7 }}
              obstacles={obstacles}
              otherAvatarPositions={avatarPositions}
              onPositionUpdate={handleAvatarPositionUpdate}
            />
          ))}

          <FileCabinet position={[-8, 0, -5]} onClick={handleFileCabinetClick} />
          <Whiteboard position={[0, 0, -8]} rotation={[0, 0, 0]} onClick={handleWhiteboardClick} />
          <CoffeeMachine position={[8, 0.8, -5]} onClick={handleCoffeeClick} />
          <PlantPot position={[-7, 0, 6]} size="large" />
          <PlantPot position={[7, 0, 6]} size="medium" />
          <PlantPot position={[-9, 0, 0]} size="small" />
          <PlantPot position={[9, 0, 0]} size="small" />
          <WallClock position={[0, 2.5, -8.4]} rotation={[0, 0, 0]} />

          {controlMode === 'orbit' ? (
            <OrbitControls
              enableDamping
              dampingFactor={0.05}
              minDistance={5}
              maxDistance={30}
              maxPolarAngle={Math.PI / 2.2}
            />
          ) : (
            <FirstPersonControls moveSpeed={5} />
          )}
        </Suspense>
      </Canvas>

      {selectedAgent && (
        <AgentPanel
          agent={agents.find(a => a.id === selectedAgent)!}
          state={agentStates[selectedAgent] ?? defaultState(selectedAgent)}
          onClose={handleClosePanel}
        />
      )}

      {interactionModal && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '2rem', maxWidth: '42rem', width: '100%', margin: '0 1rem', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {interactionModal === 'memory' && '📁 Memory Browser'}
                {interactionModal === 'roadmap' && '📋 Roadmap & Planning'}
                {interactionModal === 'energy' && '☕ Agent Energy Dashboard'}
              </h2>
              <button onClick={handleCloseModal} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {interactionModal === 'memory' && (
                <>
                  <p style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🧠 Acceso a memorias y archivos del workspace</p>
                  <div style={{ backgroundColor: 'var(--surface-elevated)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <li><a href="/memory" style={{ color: 'var(--accent)', textDecoration: 'none' }}>→ Memory Browser</a></li>
                      <li><a href="/files" style={{ color: 'var(--accent)', textDecoration: 'none' }}>→ File Explorer</a></li>
                    </ul>
                  </div>
                </>
              )}
              {interactionModal === 'roadmap' && (
                <p>🗺️ Roadmap disponible en workspace/mission-control/ROADMAP.md</p>
              )}
              {interactionModal === 'energy' && (
                <div style={{ backgroundColor: 'var(--surface-elevated)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Agentes activos:</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
                    {Object.values(agentStates).filter(s => s.status === 'working').length} / {agents.length}
                  </p>
                </div>
              )}
            </div>
            <button onClick={handleCloseModal} style={{ marginTop: '1.5rem', width: '100%', backgroundColor: 'var(--accent)', color: 'white', fontWeight: 700, padding: '0.75rem', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', minWidth: '180px' }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>🏢 The Office</h2>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.75rem' }}>
          {controlMode === 'orbit' ? (
            <>
              <p>🖱️ Mouse: Rotate view</p>
              <p>🔄 Scroll: Zoom</p>
              <p>👆 Click: Select agent</p>
            </>
          ) : (
            <>
              <p>Click to lock cursor</p>
              <p>WASD: Move | ESC: Unlock</p>
            </>
          )}
        </div>
        <button
          onClick={() => setControlMode(controlMode === 'orbit' ? 'fps' : 'orbit')}
          style={{ width: '100%', backgroundColor: 'var(--accent)', color: 'white', fontWeight: 600, padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}
        >
          {controlMode === 'orbit' ? 'FPS Mode' : 'Orbit Mode'}
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', padding: '0.875rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Agent States</h3>
        <div style={{ fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}><div style={{ width: '0.6rem', height: '0.6rem', backgroundColor: 'var(--success)', borderRadius: '50%' }}></div><span>Working</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}><div style={{ width: '0.6rem', height: '0.6rem', backgroundColor: 'var(--info)', borderRadius: '50%' }}></div><span>Thinking</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}><div style={{ width: '0.6rem', height: '0.6rem', backgroundColor: 'var(--text-muted)', borderRadius: '50%' }}></div><span>Idle</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}><div style={{ width: '0.6rem', height: '0.6rem', backgroundColor: 'var(--error)', borderRadius: '50%' }}></div><span>Error</span></div>
        </div>
      </div>
    </div>
  );
}
