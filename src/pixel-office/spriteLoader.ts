// ── spriteLoader.ts — Loads character PNGs from /pixel-agents/ at runtime ──
// Adapted from pixel-agents for Mission Control pixel-office
//
// Character spritesheets are 112×96 PNGs:
//   - 7 columns (frames) × 16px wide each
//   - 3 rows (down, up, right) × 32px tall each
//   - Left direction = horizontal flip of right
//
// Assets live in /public/pixel-agents/characters/char_{0-5}.png

import type { SpriteData } from './spriteData';
import { PALETTE_COUNT, setCharacterTemplates } from './spriteData';

// ── Types ────────────────────────────────────────────────────

interface LoadedCharacterData {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

// ── State ────────────────────────────────────────────────────

let charactersLoadPromise: Promise<LoadedCharacterData[]> | null = null;

// ── Single character loader ──────────────────────────────────

/** Load a single character PNG and extract 7 frames × 3 directions */
async function loadCharacterPNG(paletteIndex: number): Promise<LoadedCharacterData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `/pixel-agents/characters/char_${paletteIndex}.png`;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load char_${paletteIndex}.png`));
  });

  const frameW = 16;
  const frameH = 32;
  const numFrames = 7;

  // Decode PNG → raw pixel data
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  /** Extract a single frame sprite from the spritesheet */
  const makeSprite = (frameIdx: number, rowOffset: number): SpriteData => {
    const sprite: SpriteData = [];
    for (let y = 0; y < frameH; y++) {
      const row: string[] = [];
      for (let x = 0; x < frameW; x++) {
        const px = frameIdx * frameW + x;
        const py = rowOffset + y;
        const i = (py * canvas.width + px) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a === 0) {
          row.push('');
        } else {
          row.push(
            `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
          );
        }
      }
      sprite.push(row);
    }
    return sprite;
  };

  // Layout: 7 columns (frames) × 3 rows (down, up, right)
  // Left = flip of right, generated on the fly
  return {
    down: Array.from({ length: numFrames }, (_, i) => makeSprite(i, 0)),
    up: Array.from({ length: numFrames }, (_, i) => makeSprite(i, frameH)),
    right: Array.from({ length: numFrames }, (_, i) => makeSprite(i, frameH * 2)),
  };
}

// ── Public API ───────────────────────────────────────────────

/** Load all 6 character palettes from PNG assets.
 *  Safe to call multiple times — returns cached promise.
 *  After loading, character sprites are available via getCharacterSprites(). */
export function loadAllCharacters(): Promise<LoadedCharacterData[]> {
  if (charactersLoadPromise) return charactersLoadPromise;

  charactersLoadPromise = Promise.all(
    Array.from({ length: PALETTE_COUNT }, (_, i) => loadCharacterPNG(i)),
  ).then((result) => {
    // Register loaded data with spriteData module
    setCharacterTemplates(result);
    return result;
  });

  return charactersLoadPromise;
}

/** Load a single furniture sprite from /pixel-agents/furniture/{path} */
export async function loadFurnitureSprite(path: string): Promise<SpriteData> {
  const img = new Image();
  img.src = `/pixel-agents/furniture/${path}`;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load furniture: ${path}`));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const sprite: SpriteData = [];

  for (let y = 0; y < canvas.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) {
        row.push('');
      } else {
        row.push(
          `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
        );
      }
    }
    sprite.push(row);
  }
  return sprite;
}

/** Load a floor tile PNG from /pixel-agents/floors/{name}.png */
export async function loadFloorTile(name: string): Promise<SpriteData> {
  const img = new Image();
  img.src = `/pixel-agents/floors/${name}.png`;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load floor: ${name}`));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const sprite: SpriteData = [];

  for (let y = 0; y < canvas.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) {
        row.push('');
      } else {
        row.push(
          `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
        );
      }
    }
    sprite.push(row);
  }
  return sprite;
}

/** Load a wall tile PNG from /pixel-agents/walls/{name}.png */
export async function loadWallTile(name: string): Promise<SpriteData> {
  const img = new Image();
  img.src = `/pixel-agents/walls/${name}.png`;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load wall: ${name}`));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const sprite: SpriteData = [];

  for (let y = 0; y < canvas.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) {
        row.push('');
      } else {
        row.push(
          `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
        );
      }
    }
    sprite.push(row);
  }
  return sprite;
}
