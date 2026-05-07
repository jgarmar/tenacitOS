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
          const task: string = a.currentTask || '';
          let status: AgentState['status'] = 'idle';
          if (task.startsWith('ACTIVE:')) status = 'working';
          else if (task.startsWith('IDLE:')) status = 'idle';
          else if (!a.isActive) status = 'idle';

          states[a.id] = {
            id: a.id,
            status,
            currentTask: task.replace(/^(ACTIVE|IDLE|SLEEPING):\s*/, ''),
          };
        }
        setAgentStates(states);
      } catch {
        // keep defaults on error
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 30_000);
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

  const defaultState = (id: string): AgentState => ({ id, status: 'idle' as const });

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
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-yellow-500 rounded-lg p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-yellow-400">
                {interactionModal === 'memory' && '📁 Memory Browser'}
                {interactionModal === 'roadmap' && '📋 Roadmap & Planning'}
                {interactionModal === 'energy' && '☕ Agent Energy Dashboard'}
              </h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-white text-3xl leading-none">×</button>
            </div>
            <div className="text-gray-300 space-y-4">
              {interactionModal === 'memory' && (
                <>
                  <p className="text-lg">🧠 Acceso a memorias y archivos del workspace</p>
                  <div className="bg-gray-800 p-4 rounded border border-gray-700">
                    <ul className="space-y-2">
                      <li><a href="/memory" className="text-yellow-400 hover:underline">→ Memory Browser</a></li>
                      <li><a href="/files" className="text-yellow-400 hover:underline">→ File Explorer</a></li>
                    </ul>
                  </div>
                </>
              )}
              {interactionModal === 'roadmap' && (
                <p className="text-lg">🗺️ Roadmap disponible en workspace/mission-control/ROADMAP.md</p>
              )}
              {interactionModal === 'energy' && (
                <div className="bg-gray-800 p-4 rounded border border-gray-700 space-y-3">
                  <div>
                    <p className="text-sm text-gray-400">Agentes activos:</p>
                    <p className="text-2xl font-bold text-green-400">
                      {Object.values(agentStates).filter(s => s.status === 'working').length} / {agents.length}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleCloseModal} className="mt-6 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 bg-black/70 text-white p-4 rounded-lg backdrop-blur-sm">
        <h2 className="text-lg font-bold mb-2">🏢 The Office</h2>
        <div className="text-sm space-y-1 mb-3">
          <p><strong>Modo: {controlMode === 'orbit' ? '🖱️ Orbit' : '🎮 FPS'}</strong></p>
          {controlMode === 'orbit' ? (
            <>
              <p>🖱️ Mouse: Rotar vista</p>
              <p>🔄 Scroll: Zoom</p>
              <p>👆 Click: Seleccionar agente</p>
            </>
          ) : (
            <>
              <p>Click para bloquear cursor</p>
              <p>WASD: Mover | ESC: Unlock</p>
            </>
          )}
        </div>
        <button
          onClick={() => setControlMode(controlMode === 'orbit' ? 'fps' : 'orbit')}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 px-3 rounded text-xs transition-colors"
        >
          Cambiar a modo {controlMode === 'orbit' ? 'FPS' : 'Orbit'}
        </button>
      </div>

      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-4 rounded-lg backdrop-blur-sm">
        <h3 className="text-sm font-bold mb-2">Estados</h3>
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full"></div><span>Working</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div><span>Thinking</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-gray-500 rounded-full"></div><span>Idle</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full"></div><span>Error</span></div>
        </div>
      </div>
    </div>
  );
}
