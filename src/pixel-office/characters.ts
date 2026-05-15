// ── characters.ts — Character sprite selection based on state ──
// Adapted from pixel-agents for Mission Control pixel-office

import type { Character, CharacterSprites, SpriteData } from './spriteData';
import { CharacterState, Direction } from './spriteData';

/** Get the correct sprite for a character based on its current state and direction */
export function getCharacterSprite(ch: Character, sprites: CharacterSprites): SpriteData {
  const dir = ch.dir;

  switch (ch.state) {
    case CharacterState.IDLE: {
      // Use first frame of walk animation for idle
      return sprites.walk[dir][0];
    }
    case CharacterState.WALK: {
      const frame = ch.frame % 4;
      return sprites.walk[dir][frame];
    }
    case CharacterState.TYPE: {
      const frame = ch.frame % 2;
      return sprites.typing[dir][frame];
    }
    default: {
      return sprites.walk[dir][0];
    }
  }
}
