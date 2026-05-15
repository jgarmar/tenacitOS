// ── spriteData.ts — Character sprite data, palettes & types ──
// Adapted from pixel-agents for Mission Control pixel-office

// ── Core types ───────────────────────────────────────────────

export const TILE_SIZE = 16;

export const TileType = {
  WALL: 0,
  FLOOR_1: 1,
  FLOOR_2: 2,
  FLOOR_3: 3,
  FLOOR_4: 4,
  FLOOR_5: 5,
  FLOOR_6: 6,
  FLOOR_7: 7,
  FLOOR_8: 8,
  FLOOR_9: 9,
  VOID: 255,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const CharacterState = {
  IDLE: 'idle',
  WALK: 'walk',
  TYPE: 'type',
} as const;
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

export interface Seat {
  uid: string;
  seatCol: number;
  seatRow: number;
  facingDir: Direction;
  assigned: boolean;
}

export interface FurnitureInstance {
  sprite: SpriteData;
  x: number;
  y: number;
  zY: number;
  mirrored?: boolean;
}

export interface Character {
  id: number;
  state: CharacterState;
  dir: Direction;
  x: number;
  y: number;
  tileCol: number;
  tileRow: number;
  path: Array<{ col: number; row: number }>;
  moveProgress: number;
  currentTool: string | null;
  palette: number;
  hueShift: number;
  frame: number;
  frameTimer: number;
  wanderTimer: number;
  wanderCount: number;
  wanderLimit: number;
  isActive: boolean;
  seatId: string | null;
  bubbleType: 'permission' | 'waiting' | null;
  bubbleTimer: number;
  seatTimer: number;
  isSubagent: boolean;
  parentAgentId: number | null;
  matrixEffect: 'spawn' | 'despawn' | null;
  matrixEffectTimer: number;
  matrixEffectSeeds: number[];
  inputTokens: number;
  outputTokens: number;
}

// ── Direction ────────────────────────────────────────────────

export const Direction = {
  DOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  UP: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** 2D array of hex color strings: '' = transparent, '#RRGGBB' = opaque */
export type SpriteData = string[][];

export interface CharacterSprites {
  walk: Record<Direction, [SpriteData, SpriteData, SpriteData, SpriteData]>;
  typing: Record<Direction, [SpriteData, SpriteData]>;
  reading: Record<Direction, [SpriteData, SpriteData]>;
}

// ── Constants ────────────────────────────────────────────────

export const PALETTE_COUNT = 6;
export const HUE_SHIFT_MIN_DEG = 45;
export const HUE_SHIFT_RANGE_DEG = 271;

// ── Speech Bubble Sprites (hardcoded pixel data) ──────────────

const BUBBLE_PERMISSION_PALETTE: Record<string, string> = {
  '': '#00000000',
  W: '#FFFFFF',
  D: '#333333',
  A: '#FFB000',
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
  '': '#00000000',
  W: '#FFFFFF',
  D: '#333333',
  G: '#00CC44',
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

// ── Character sprite loading state ───────────────────────────

interface LoadedCharacterData {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
}

let loadedCharacters: LoadedCharacterData[] | null = null;

export function setCharacterTemplates(data: LoadedCharacterData[]): void {
  loadedCharacters = data;
}

export function getLoadedCharacterCount(): number {
  return loadedCharacters ? loadedCharacters.length : PALETTE_COUNT;
}

// ── Helpers ──────────────────────────────────────────────────

function flipSpriteHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

function emptySprite(w: number, h: number): SpriteData {
  return Array.from({ length: h }, () => new Array(w).fill(''));
}

// ── HSL helpers for hue shift ─────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255,
    gf = g / 255,
    bf = b / 255;
  const max = Math.max(rf, gf, bf),
    min = Math.min(rf, gf, bf);
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
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
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

// ── Main export: getCharacterSprites ─────────────────────────

/** Get character sprites for a given palette index and optional hue shift.
 *  Uses loaded character data if available, otherwise returns transparent placeholders. */
export function getCharacterSprites(paletteIndex: number, hueShift = 0): CharacterSprites {
  let sprites: CharacterSprites;

  if (loadedCharacters) {
    const char = loadedCharacters[paletteIndex % loadedCharacters.length];
    const d = char.down;
    const u = char.up;
    const rt = char.right;
    const flip = flipSpriteHorizontal;

    sprites = {
      walk: {
        [Direction.DOWN]: [d[0], d[1], d[2], d[1]],
        [Direction.UP]: [u[0], u[1], u[2], u[1]],
        [Direction.RIGHT]: [rt[0], rt[1], rt[2], rt[1]],
        [Direction.LEFT]: [flip(rt[0]), flip(rt[1]), flip(rt[2]), flip(rt[1])],
      },
      typing: {
        [Direction.DOWN]: [d[3], d[4]],
        [Direction.UP]: [u[3], u[4]],
        [Direction.RIGHT]: [rt[3], rt[4]],
        [Direction.LEFT]: [flip(rt[3]), flip(rt[4])],
      },
      reading: {
        [Direction.DOWN]: [d[5], d[6]],
        [Direction.UP]: [u[5], u[6]],
        [Direction.RIGHT]: [rt[5], rt[6]],
        [Direction.LEFT]: [flip(rt[5]), flip(rt[6])],
      },
    };
  } else {
    const e = emptySprite(16, 32);
    const walkSet: [SpriteData, SpriteData, SpriteData, SpriteData] = [e, e, e, e];
    const pairSet: [SpriteData, SpriteData] = [e, e];
    sprites = {
      walk: {
        [Direction.DOWN]: walkSet,
        [Direction.UP]: walkSet,
        [Direction.RIGHT]: walkSet,
        [Direction.LEFT]: walkSet,
      },
      typing: {
        [Direction.DOWN]: pairSet,
        [Direction.UP]: pairSet,
        [Direction.RIGHT]: pairSet,
        [Direction.LEFT]: pairSet,
      },
      reading: {
        [Direction.DOWN]: pairSet,
        [Direction.UP]: pairSet,
        [Direction.RIGHT]: pairSet,
        [Direction.LEFT]: pairSet,
      },
    };
  }

  if (hueShift !== 0) {
    const shift = (s: SpriteData) => adjustSpriteHue(s, hueShift);
    const shiftWalk = (arr: [SpriteData, SpriteData, SpriteData, SpriteData]): [SpriteData, SpriteData, SpriteData, SpriteData] =>
      [shift(arr[0]), shift(arr[1]), shift(arr[2]), shift(arr[3])];
    const shiftPair = (arr: [SpriteData, SpriteData]): [SpriteData, SpriteData] =>
      [shift(arr[0]), shift(arr[1])];

    sprites = {
      walk: {
        [Direction.DOWN]: shiftWalk(sprites.walk[Direction.DOWN]),
        [Direction.UP]: shiftWalk(sprites.walk[Direction.UP]),
        [Direction.RIGHT]: shiftWalk(sprites.walk[Direction.RIGHT]),
        [Direction.LEFT]: shiftWalk(sprites.walk[Direction.LEFT]),
      },
      typing: {
        [Direction.DOWN]: shiftPair(sprites.typing[Direction.DOWN]),
        [Direction.UP]: shiftPair(sprites.typing[Direction.UP]),
        [Direction.RIGHT]: shiftPair(sprites.typing[Direction.RIGHT]),
        [Direction.LEFT]: shiftPair(sprites.typing[Direction.LEFT]),
      },
      reading: {
        [Direction.DOWN]: shiftPair(sprites.reading[Direction.DOWN]),
        [Direction.UP]: shiftPair(sprites.reading[Direction.UP]),
        [Direction.RIGHT]: shiftPair(sprites.reading[Direction.RIGHT]),
        [Direction.LEFT]: shiftPair(sprites.reading[Direction.LEFT]),
      },
    };
  }

  return sprites;
}