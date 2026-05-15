import { PALETTE_COUNT } from '../constants';
import type { ColorValue, Direction, SpriteData } from '../types';
import { Direction as Dir } from '../types';
import { getCachedSprite } from './spriteCache';

// ── Tool helpers ─────────────────────────────────────────────

const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

export function isReadingTool(tool: string | null): boolean {
  if (!tool) return false;
  return READING_TOOLS.has(tool);
}

// ── Speech Bubble Sprites (hardcoded pixel data) ──────────────

const BUBBLE_PERMISSION_PALETTE: Record<string, string> = {
  '': '#00000000', W: '#FFFFFF', D: '#333333', A: '#FFB000',
};
const BUBBLE_PERMISSION_PIXELS: string[][] = [
  ['', '', '', 'W', 'W', 'W', 'W', 'W', '', '', ''],
  ['', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', ''],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'D', 'W', 'W', 'W', 'D', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'D', 'W', 'W', 'W', 'D', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'D', 'W', 'W', 'W', 'D', 'W', 'W', 'W'],
  ['', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', ''],
  ['', '', '', 'W', 'W', 'W', 'W', 'W', '', '', ''],
  ['', '', '', '', '', 'W', '', '', '', '', ''],
];

const BUBBLE_WAITING_PALETTE: Record<string, string> = {
  '': '#00000000', W: '#FFFFFF', D: '#333333', G: '#00CC44',
};
const BUBBLE_WAITING_PIXELS: string[][] = [
  ['', '', '', 'W', 'W', 'W', 'W', 'W', '', '', ''],
  ['', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', ''],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'G', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'G', 'G', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'G', 'G', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'G', 'W', 'G', 'G', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'G', 'G', 'G', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'G', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'],
  ['', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', ''],
  ['', '', '', 'W', 'W', 'W', 'W', 'W', '', '', ''],
  ['', '', '', '', '', 'W', '', '', '', '', ''],
];

function resolveBubbleSprite(palette: Record<string, string>, pixels: string[][]): SpriteData {
  return pixels.map((row) => row.map((key) => palette[key] ?? key));
}

export const BUBBLE_PERMISSION_SPRITE: SpriteData = resolveBubbleSprite(
  BUBBLE_PERMISSION_PALETTE,
  BUBBLE_PERMISSION_PIXELS,
);
export const BUBBLE_WAITING_SPRITE: SpriteData = resolveBubbleSprite(
  BUBBLE_WAITING_PALETTE,
  BUBBLE_WAITING_PIXELS,
);

// ── Character sprite loading ──────────────────────────────────

interface LoadedCharacterData {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

let loadedCharacters: LoadedCharacterData[] | null = null;
let charactersLoadPromise: Promise<LoadedCharacterData[]> | null = null;

/** Load a single character PNG and extract 7 frames × 3 directions */
async function loadCharacterPNG(paletteIndex: number): Promise<LoadedCharacterData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `/pixel-agents/characters/char_${paletteIndex}.png`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load char_${paletteIndex}.png`));
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const frameW = 16;
  const frameH = 32;
  const numFrames = 7;

  const makeSprite = (frameIdx: number, rowOffset: number): SpriteData => {
    const sprite: SpriteData = [];
    for (let y = 0; y < frameH; y++) {
      const row: string[] = [];
      for (let x = 0; x < frameW; x++) {
        const px = frameIdx * frameW + x;
        const py = rowOffset + y;
        const i = (py * canvas.width + px) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
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

  // Layout: 7 columns (frames) × 4 rows (down, up, right, left)
  // But left = flip of right, so we only load 3 rows
  return {
    down: Array.from({ length: numFrames }, (_, i) => makeSprite(i, 0)),
    up: Array.from({ length: numFrames }, (_, i) => makeSprite(i, frameH)),
    right: Array.from({ length: numFrames }, (_, i) => makeSprite(i, frameH * 2)),
  };
}

/** Load all character palettes. Safe to call multiple times — returns cached promise. */
export function loadAllCharacters(): Promise<LoadedCharacterData[]> {
  if (loadedCharacters) return Promise.resolve(loadedCharacters);
  if (charactersLoadPromise) return charactersLoadPromise;

  charactersLoadPromise = Promise.all(
    Array.from({ length: PALETTE_COUNT }, (_, i) => loadCharacterPNG(i)),
  ).then((result) => {
    loadedCharacters = result;
    return result;
  });

  return charactersLoadPromise;
}

export function getLoadedCharacterCount(): number {
  return loadedCharacters ? loadedCharacters.length : PALETTE_COUNT;
}

function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

// ── HSL helpers for hue shift ─────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
  else if (max === gf) h = ((bf - rf) / d + 2) * 60;
  else h = ((rf - gf) / d + 4) * 60;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = l - c / 2;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return `#${clamp(r1).toString(16).padStart(2, '0')}${clamp(g1).toString(16).padStart(2, '0')}${clamp(b1).toString(16).padStart(2, '0')}`.toUpperCase();
}

function adjustSpriteHue(sprite: SpriteData, hueShift: number): SpriteData {
  return sprite.map((row) =>
    row.map((pixel) => {
      if (pixel === '') return '';
      const r = parseInt(pixel.slice(1, 3), 16);
      const g = parseInt(pixel.slice(3, 5), 16);
      const b = parseInt(pixel.slice(5, 7), 16);
      const [origH, origS, origL] = rgbToHsl(r, g, b);
      const newH = (((origH + hueShift) % 360) + 360) % 360;
      return hslToHex(newH, origS, origL);
    }),
  );
}

// ── CharacterSprites cache ────────────────────────────────────

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
}

const spriteCache = new Map<string, CharacterSprites>();

function hueShiftSprites(sprites: CharacterSprites, hueShift: number): CharacterSprites {
  const shift = (s: SpriteData) => adjustSpriteHue(s, hueShift);
  const shiftWalk = (
    arr: [SpriteData, SpriteData, SpriteData, SpriteData],
  ): [SpriteData, SpriteData, SpriteData, SpriteData] => [
    shift(arr[0]), shift(arr[1]), shift(arr[2]), shift(arr[3]),
  ];
  const shiftPair = (arr: [SpriteData, SpriteData]): [SpriteData, SpriteData] => [
    shift(arr[0]), shift(arr[1]),
  ];
  return {
    walk: {
      [Dir.DOWN]: shiftWalk(sprites.walk[Dir.DOWN]),
      [Dir.UP]: shiftWalk(sprites.walk[Dir.UP]),
      [Dir.RIGHT]: shiftWalk(sprites.walk[Dir.RIGHT]),
      [Dir.LEFT]: shiftWalk(sprites.walk[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>,
    typing: {
      [Dir.DOWN]: shiftPair(sprites.typing[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.typing[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.typing[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.typing[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
    reading: {
      [Dir.DOWN]: shiftPair(sprites.reading[Dir.DOWN]),
      [Dir.UP]: shiftPair(sprites.reading[Dir.UP]),
      [Dir.RIGHT]: shiftPair(sprites.reading[Dir.RIGHT]),
      [Dir.LEFT]: shiftPair(sprites.reading[Dir.LEFT]),
    } as Record<Direction, [SpriteData, SpriteData]>,
  };
}

function emptySprite(w: number, h: number): SpriteData {
  return Array.from({ length: h }, () => new Array(w).fill(''));
}

export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  const cacheKey = `${paletteIndex}:${hueShift}`;
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;

  let sprites: CharacterSprites;

  if (loadedCharacters) {
    const char = loadedCharacters[paletteIndex % loadedCharacters.length];
    const d = char.down;
    const u = char.up;
    const rt = char.right;
    const flip = flipSpriteHorizontal;

    sprites = {
      walk: {
        [Dir.DOWN]: [d[0], d[1], d[2], d[1]],
        [Dir.UP]: [u[0], u[1], u[2], u[1]],
        [Dir.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
        [Dir.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
      },
      typing: {
        [Dir.DOWN]: [d[3], d[4]],
        [Dir.UP]: [u[3], u[4]],
        [Dir.RIGHT]: [rt[3], rt[4]],
        [Dir.LEFT]: [flip(rt[3]), flip(rt[4])],
      },
      reading: {
        [Dir.DOWN]: [d[5], d[6]],
        [Dir.UP]: [u[5], u[6]],
        [Dir.RIGHT]: [rt[5], rt[6]],
        [Dir.LEFT]: [flip(rt[5]), flip(rt[6])],
      },
    };
  } else {
    const e = emptySprite(16, 32);
    const walkSet: [SpriteData, SpriteData, SpriteData, SpriteData] = [e, e, e, e];
    const pairSet: [SpriteData, SpriteData] = [e, e];
    sprites = {
      walk: { [Dir.DOWN]: walkSet, [Dir.UP]: walkSet, [Dir.RIGHT]: walkSet, [Dir.LEFT]: walkSet },
      typing: { [Dir.DOWN]: pairSet, [Dir.UP]: pairSet, [Dir.RIGHT]: pairSet, [Dir.LEFT]: pairSet },
      reading: { [Dir.DOWN]: pairSet, [Dir.UP]: pairSet, [Dir.RIGHT]: pairSet, [Dir.LEFT]: pairSet },
    };
  }

  if (hueShift !== 0) {
    sprites = hueShiftSprites(sprites, hueShift);
  }

  spriteCache.set(cacheKey, sprites);
  return sprites;
}
