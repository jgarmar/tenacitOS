'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
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

// Destinations are placed far enough from furniture obstacles (radius+0.4 buffer)
// Whiteboard obstacle at [0,0,-8] r=1.5 → min 1.9 away → coding at Z=-5.5 gives dist≈2.6 ✓
// Delegating at front-center, away from all desks
const DESTINATIONS = {
  memory:     new Vector3(-6.5, 0.6, -4.0),  // FileCabinet side
  coding:     new Vector3(0,    0.6, -5.5),   // In front of Whiteboard
  telegram:   new Vector3(6.5,  0.6, -4.0),   // CoffeeMachine area
  delegating: new Vector3(0,    0.6,  4.5),   // Open area, front of room
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
  const lastReportedPos = useRef<Vector3>(new Vector3(-9999, 0, 0));

  // Chair is inside <group scale={2}> at position [0, 0, 0.9] in AgentDesk
  // → world offset from desk origin = [0, 0, 1.8]; seat top Y ≈ 0.88
  const homePos = useMemo(
    () => new Vector3(agent.position[0], 0.88, agent.position[2] + 1.8),
    [agent.position[0], agent.position[2]]
  );

  const [targetPos, setTargetPos] = useState(() => homePos.clone());
  const currentPos = useRef(homePos.clone());

  const isSitting = !ACTIVE_ACTIVITIES.includes(state.activity as typeof ACTIVE_ACTIVITIES[number]);

  // Notify initial position
  useEffect(() => {
    onPositionUpdate(agent.id, homePos.clone());
    lastReportedPos.current.copy(homePos);
  }, []);

  // Navigate to furniture or return home when activity changes
  useEffect(() => {
    const dest = DESTINATIONS[state.activity as keyof typeof DESTINATIONS];
    setTargetPos(dest ? dest.clone() : homePos.clone());
  }, [state.activity]);

  const isPositionFree = (pos: Vector3): boolean => {
    for (const obstacle of obstacles) {
      if (pos.distanceTo(obstacle.position) < obstacle.radius + 0.4) return false;
    }
    for (const [otherId, otherPos] of otherAvatarPositions.entries()) {
      if (otherId === agent.id) continue;
      if (pos.distanceTo(otherPos) < 1.2) return false;
    }
    return true;
  };

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const speed = isSitting ? 3.0 : 1.5;
    const newPos = currentPos.current.clone().lerp(targetPos, delta * speed);

    if (isPositionFree(newPos)) {
      currentPos.current.copy(newPos);
      groupRef.current.position.copy(currentPos.current);

      // Only notify parent when position changes meaningfully (avoids render cascade)
      if (currentPos.current.distanceTo(lastReportedPos.current) > 0.1) {
        lastReportedPos.current.copy(currentPos.current);
        onPositionUpdate(agent.id, currentPos.current.clone());
      }

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
    } else if (targetPos.distanceTo(homePos) > 0.1) {
      // Blocked going to destination — return home
      setTargetPos(homePos.clone());
    }
    // If blocked AND already targeting homePos, don't call setTargetPos (avoids re-render loop)
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
