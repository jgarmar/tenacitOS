'use client';

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import VoxelAvatar from './VoxelAvatar';
import type { AgentConfig, AgentState } from './agentsConfig';

interface Obstacle {
  position: Vector3;
  radius: number;
}

interface MovingAvatarProps {
  agent: AgentConfig;
  state: AgentState;
  officeBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  obstacles: Obstacle[];
  otherAvatarPositions: Map<string, Vector3>;
  onPositionUpdate: (id: string, pos: Vector3) => void;
}

export default function MovingAvatar({ 
  agent, 
  state, 
  officeBounds, 
  obstacles, 
  otherAvatarPositions,
  onPositionUpdate 
}: MovingAvatarProps) {
  const groupRef = useRef<Group>(null);
  
  // Posición inicial completamente aleatoria SIN colisiones
  const [initialPos] = useState(() => {
    let pos: Vector3;
    let attempts = 0;
    const minDistanceToObstacle = 1.5;

    // Intentar hasta 50 veces encontrar una posición sin colisión
    do {
      const x = Math.random() * (officeBounds.maxX - officeBounds.minX - 2) + officeBounds.minX + 1;
      const z = Math.random() * (officeBounds.maxZ - officeBounds.minZ - 2) + officeBounds.minZ + 1;
      pos = new Vector3(x, 0.6, z);

      // Verificar colisión con obstáculos
      let isFree = true;
      for (const obstacle of obstacles) {
        const distance = pos.distanceTo(obstacle.position);
        if (distance < obstacle.radius + minDistanceToObstacle) {
          isFree = false;
          break;
        }
      }

      if (isFree) break;
      attempts++;
    } while (attempts < 50);

    return pos;
  });

  const [targetPos, setTargetPos] = useState(initialPos);
  const currentPos = useRef(initialPos.clone());
  
  // Notificar posición inicial
  useEffect(() => {
    onPositionUpdate(agent.id, initialPos.clone());
  }, []);

  // Verificar si una posición está libre (sin colisiones)
  const isPositionFree = (pos: Vector3): boolean => {
    const minDistanceToObstacle = 1.5; // distancia mínima a muebles
    const minDistanceToAvatar = 1.2; // distancia mínima entre avatares

    // Verificar colisión con obstáculos
    for (const obstacle of obstacles) {
      const distance = pos.distanceTo(obstacle.position);
      if (distance < obstacle.radius + minDistanceToObstacle) {
        return false;
      }
    }

    // Verificar colisión con otros avatares
    for (const [otherId, otherPos] of otherAvatarPositions.entries()) {
      if (otherId === agent.id) continue;
      const distance = pos.distanceTo(otherPos);
      if (distance < minDistanceToAvatar) {
        return false;
      }
    }

    return true;
  };

  // Furniture destinations (must match positions in Office3D scene)
  const DESTINATIONS = {
    // FileCabinet at (-8, 0, -5) — stand in front
    memory:     new Vector3(-6.5, 0.6, -4.0),
    // Whiteboard at (0, 0, -8) — stand in front
    coding:     new Vector3(0,    0.6, -6.5),
    // CoffeeMachine area at (8, 0.8, -5) — stand nearby
    telegram:   new Vector3(6.5,  0.6, -4.0),
    // Center of room — pacing/delegating
    delegating: new Vector3(0,    0.6,  0  ),
  };

  // When activity changes to a known destination, go there immediately
  useEffect(() => {
    const dest = DESTINATIONS[state.activity as keyof typeof DESTINATIONS];
    if (dest) {
      setTargetPos(dest.clone());
    }
  }, [state.activity]);

  // Random roaming — only when idle or no specific destination
  useEffect(() => {
    if (['memory', 'coding', 'telegram', 'delegating'].includes(state.activity)) return;

    const getRandomTarget = () => {
      let attempts = 0;
      let newPos: Vector3;
      do {
        const x = Math.random() * (officeBounds.maxX - officeBounds.minX) + officeBounds.minX;
        const z = Math.random() * (officeBounds.maxZ - officeBounds.minZ) + officeBounds.minZ;
        newPos = new Vector3(x, 0.6, z);
        attempts++;
      } while (!isPositionFree(newPos) && attempts < 20);
      if (attempts < 20) setTargetPos(newPos);
    };

    const interval = state.status === 'idle'
      ? 4000 + Math.random() * 3000
      : 10000 + Math.random() * 8000;

    const timeout = setTimeout(getRandomTarget, 1000);
    const timer = setInterval(getRandomTarget, interval);
    return () => { clearTimeout(timeout); clearInterval(timer); };
  }, [state.status, state.activity]);

  // Mover suavemente hacia el objetivo
  useFrame((frameState, delta) => {
    if (!groupRef.current) return;

    const speed = state.status === 'idle' ? 1.5 : 0.8; // idle se mueve más rápido
    const moveSpeed = delta * speed;

    // Calcular nueva posición
    const newPos = currentPos.current.clone().lerp(targetPos, moveSpeed);

    // Verificar si la nueva posición es válida
    if (isPositionFree(newPos)) {
      currentPos.current.copy(newPos);
      groupRef.current.position.copy(currentPos.current);

      // Notificar la nueva posición
      onPositionUpdate(agent.id, currentPos.current.clone());

      // Rotar hacia la dirección del movimiento
      const direction = new Vector3().subVectors(targetPos, currentPos.current);
      if (direction.length() > 0.1) {
        const angle = Math.atan2(direction.x, direction.z);
        groupRef.current.rotation.y = angle;
      }
    } else {
      // Si hay colisión, buscar nuevo objetivo
      const x = Math.random() * (officeBounds.maxX - officeBounds.minX) + officeBounds.minX;
      const z = Math.random() * (officeBounds.maxZ - officeBounds.minZ) + officeBounds.minZ;
      const newTarget = new Vector3(x, 0.6, z);
      if (isPositionFree(newTarget)) {
        setTargetPos(newTarget);
      }
    }
  });

  return (
    <group ref={groupRef} scale={3}>
      <VoxelAvatar
        agent={agent}
        position={[0, 0, 0]}
        isWorking={state.status === 'working'}
        isThinking={state.status === 'thinking'}
        isError={state.status === 'error'}
      />
    </group>
  );
}
