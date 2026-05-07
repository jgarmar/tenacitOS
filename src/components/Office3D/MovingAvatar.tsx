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

// Furniture destinations (must match positions in Office3D scene)
const DESTINATIONS = {
  memory:     new Vector3(-6.5, 0.6, -4.0),  // FileCabinet
  coding:     new Vector3(0,    0.6, -6.5),   // Whiteboard
  telegram:   new Vector3(6.5,  0.6, -4.0),   // CoffeeMachine area
  delegating: new Vector3(0,    0.6,  0   ),  // Center of room
};

const ACTIVE_ACTIVITIES = ['memory', 'coding', 'telegram', 'delegating'] as const;

export default function MovingAvatar({
  agent,
  state,
  obstacles,
  otherAvatarPositions,
  onPositionUpdate
}: MovingAvatarProps) {
  const groupRef = useRef<Group>(null);

  // Chair is inside <group scale={2}> at position [0, 0, 0.9] in AgentDesk
  // → world offset from desk origin = [0, 0, 1.8]; seat top Y ≈ 0.88
  const homePos = new Vector3(agent.position[0], 0.88, agent.position[2] + 1.8);

  const [targetPos, setTargetPos] = useState(homePos.clone());
  const currentPos = useRef(homePos.clone());

  const isSitting = !ACTIVE_ACTIVITIES.includes(state.activity as typeof ACTIVE_ACTIVITIES[number]);

  // Notify initial position
  useEffect(() => {
    onPositionUpdate(agent.id, homePos.clone());
  }, []);

  // Navigate to furniture or return home when activity changes
  useEffect(() => {
    const dest = DESTINATIONS[state.activity as keyof typeof DESTINATIONS];
    setTargetPos(dest ? dest.clone() : homePos.clone());
  }, [state.activity]);

  const isPositionFree = (pos: Vector3): boolean => {
    for (const obstacle of obstacles) {
      if (pos.distanceTo(obstacle.position) < obstacle.radius + 1.5) return false;
    }
    for (const [otherId, otherPos] of otherAvatarPositions.entries()) {
      if (otherId === agent.id) continue;
      if (pos.distanceTo(otherPos) < 1.2) return false;
    }
    return true;
  };

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const speed = isSitting ? 3.0 : 1.2;
    const newPos = currentPos.current.clone().lerp(targetPos, delta * speed);

    if (isPositionFree(newPos)) {
      currentPos.current.copy(newPos);
      groupRef.current.position.copy(currentPos.current);
      onPositionUpdate(agent.id, currentPos.current.clone());

      const direction = new Vector3().subVectors(targetPos, currentPos.current);
      if (direction.length() > 0.1) {
        groupRef.current.rotation.y = Math.atan2(direction.x, direction.z);
      } else if (isSitting) {
        // Face toward the desk once seated
        const toDesk = new Vector3(
          agent.position[0] - currentPos.current.x,
          0,
          agent.position[2] - currentPos.current.z
        );
        if (toDesk.length() > 0.01) {
          groupRef.current.rotation.y = Math.atan2(toDesk.x, toDesk.z);
        }
      }
    } else {
      // Collision: return home
      setTargetPos(homePos.clone());
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
        isSitting={isSitting}
      />
    </group>
  );
}
