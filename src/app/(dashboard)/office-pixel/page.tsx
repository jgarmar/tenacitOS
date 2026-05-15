"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { loadAllCharacters, loadFurnitureSprite } from "@/pixel-office/spriteLoader";
import { getCharacterSprites } from "@/pixel-office/spriteData";
import { getCharacterSprite } from "@/pixel-office/characters";
import { getCachedSprite, getOutlineSprite } from "@/pixel-office/spriteCache";
import {
  TILE_SIZE,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  WALK_SPEED_PX_PER_SEC,
  WALK_FRAME_DURATION_SEC,
  TYPE_FRAME_DURATION_SEC,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  FALLBACK_FLOOR_COLOR,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  GRID_LINE_COLOR,
} from "@/pixel-office/constants";
import type { Character, SpriteData, TileType } from "@/pixel-office/spriteData";
import { CharacterState as CS, Direction as Dir, TileType as TT } from "@/pixel-office/spriteData";

// ── Agent data for the office ──────────────────────────────
interface AgentInfo {
  id: number;
  name: string;
  emoji: string;
  role: string;
  color: string;
  palette: number;
  hueShift: number;
  description: string;
}

const AGENTS: AgentInfo[] = [
  { id: 0, name: "Pirion", emoji: "🧙‍♂️", role: "Mayordomo Digital", color: "#8B5CF6", palette: 0, hueShift: 0, description: "J.A.R.V.I.S. de Juanma. Coordina todo." },
  { id: 1, name: "Coder", emoji: "💻", role: "Desarrollador", color: "#3B82F6", palette: 1, hueShift: 60, description: "Escribe código, scripts y deploys." },
  { id: 2, name: "Worker", emoji: "⚙️", role: "Trabajador", color: "#10B981", palette: 2, hueShift: 120, description: "Ejecuta tareas largas en background." },
  { id: 3, name: "Fitness", emoji: "💪", role: "Entrenador", color: "#F59E0B", palette: 3, hueShift: 180, description: "Gestiona rutinas de ejercicio y nutrición." },
  { id: 4, name: "Investigador", emoji: "🔍", role: "Analista", color: "#EF4444", palette: 4, hueShift: 240, description: "Busca información y analiza datos." },
  { id: 5, name: "Asistente", emoji: "🤖", role: "Apoyo General", color: "#EC4899", palette: 5, hueShift: 300, description: "Tareas variadas y soporte." },
];

// ── Tile map builder ────────────────────────────────────────
function buildTileMap(cols: number, rows: number): TileType[][] {
  const map: TileType[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: TileType[] = [];
    for (let c = 0; c < cols; c++) {
      // Walls on borders, floor inside
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        row.push(TT.WALL);
      } else {
        // Checkerboard floor pattern
        row.push((r + c) % 2 === 0 ? TT.FLOOR_1 : TT.FLOOR_2);
      }
    }
    map.push(row);
  }
  return map;
}

// ── Floor colors for checkerboard ───────────────────────────
function buildFloorColors(cols: number, rows: number) {
  const colors: Array<{ h: number; s: number; b: number; c: number } | null> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        colors.push(null); // wall
      } else if ((r + c) % 2 === 0) {
        colors.push({ h: 220, s: 15, b: 0, c: -10 });
      } else {
        colors.push({ h: 220, s: 15, b: 0, c: 5 });
      }
    }
  }
  return colors;
}

// ── Furniture layout ────────────────────────────────────────
interface FurniturePlacement {
  spritePath: string;
  col: number;
  row: number;
  mirrored?: boolean;
}

const FURNITURE_LAYOUT: FurniturePlacement[] = [
  // Desks (4 desks for 4 main agents)
  { spritePath: "DESK/DESK.png", col: 3, row: 3 },
  { spritePath: "DESK/DESK.png", col: 7, row: 3 },
  { spritePath: "DESK/DESK.png", col: 11, row: 3 },
  { spritePath: "DESK/DESK.png", col: 15, row: 3 },
  // Chairs
  { spritePath: "WOODEN_CHAIR/WOODEN_CHAIR.png", col: 3, row: 4 },
  { spritePath: "WOODEN_CHAIR/WOODEN_CHAIR.png", col: 7, row: 4 },
  { spritePath: "WOODEN_CHAIR/WOODEN_CHAIR.png", col: 11, row: 4 },
  { spritePath: "WOODEN_CHAIR/WOODEN_CHAIR.png", col: 15, row: 4 },
  // Plants
  { spritePath: "PLANT/PLANT.png", col: 1, row: 1 },
  { spritePath: "PLANT/PLANT.png", col: 18, row: 1 },
  { spritePath: "LARGE_PLANT/LARGE_PLANT.png", col: 1, row: 8 },
  { spritePath: "LARGE_PLANT/LARGE_PLANT.png", col: 18, row: 8 },
  // Sofa
  { spritePath: "SOFA/SOFA.png", col: 8, row: 8 },
  // Coffee table
  { spritePath: "COFFEE_TABLE/COFFEE_TABLE.png", col: 10, row: 8 },
  // Bookshelf
  { spritePath: "BOOKSHELF/BOOKSHELF.png", col: 5, row: 1 },
  // Clock
  { spritePath: "CLOCK/CLOCK.png", col: 9, row: 1 },
  // Whiteboard
  { spritePath: "WHITEBOARD/WHITEBOARD.png", col: 14, row: 1 },
  // PC on desks
  { spritePath: "PC/PC.png", col: 3, row: 3 },
  { spritePath: "PC/PC.png", col: 7, row: 3 },
  { spritePath: "PC/PC.png", col: 11, row: 3 },
  { spritePath: "PC/PC.png", col: 15, row: 3 },
];

// ── Character factory ───────────────────────────────────────
function createCharacter(agent: AgentInfo, seatCol: number, seatRow: number): Character {
  return {
    id: agent.id,
    state: CS.IDLE,
    dir: Dir.DOWN,
    x: seatCol * TILE_SIZE + TILE_SIZE / 2,
    y: seatRow * TILE_SIZE + TILE_SIZE / 2,
    tileCol: seatCol,
    tileRow: seatRow,
    path: [],
    moveProgress: 0,
    currentTool: null,
    palette: agent.palette,
    hueShift: agent.hueShift,
    frame: 0,
    frameTimer: 0,
    wanderTimer: Math.random() * 5 + 2,
    wanderCount: 0,
    wanderLimit: Math.floor(Math.random() * 3) + 2,
    isActive: true,
    seatId: `seat-${seatCol}-${seatRow}`,
    bubbleType: null,
    bubbleTimer: 0,
    seatTimer: 0,
    isSubagent: false,
    parentAgentId: null,
    matrixEffect: null,
    matrixEffectTimer: 0,
    matrixEffectSeeds: [],
    inputTokens: 0,
    outputTokens: 0,
  };
}

// ── Main page component ─────────────────────────────────────
export default function OfficePixelPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const charactersRef = useRef<Character[]>([]);
  const furnitureRef = useRef<Array<{ sprite: SpriteData; col: number; row: number; mirrored: boolean }>>([]);

  const COLS = DEFAULT_COLS;
  const ROWS = DEFAULT_ROWS;
  const tileMap = useRef(buildTileMap(COLS, ROWS));
  const floorColors = useRef(buildFloorColors(COLS, ROWS));

  // Load assets
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load character sprites
        await loadAllCharacters();

        if (cancelled) return;

        // Load furniture sprites
        const furnitureData: Array<{ sprite: SpriteData; col: number; row: number; mirrored: boolean }> = [];
        for (const f of FURNITURE_LAYOUT) {
          try {
            const sprite = await loadFurnitureSprite(f.spritePath);
            furnitureData.push({ sprite, col: f.col, row: f.row, mirrored: f.mirrored || false });
          } catch (e) {
            console.warn(`Could not load furniture: ${f.spritePath}`);
          }
        }

        if (cancelled) return;

        furnitureRef.current = furnitureData;

        // Create characters at their seats
        const seats = [
          { col: 3, row: 5 },
          { col: 7, row: 5 },
          { col: 11, row: 5 },
          { col: 15, row: 5 },
          { col: 5, row: 7 },
          { col: 13, row: 7 },
        ];
        const chars = AGENTS.map((agent, i) => {
          const seat = seats[i] || { col: 2 + i * 3, row: 6 };
          return createCharacter(agent, seat.col, seat.row);
        });

        charactersRef.current = chars;
        setCharacters(chars);
        setLoaded(true);
      } catch (err) {
        console.error("Error loading office assets:", err);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Render frame ──────────────────────────────────────────
  const renderFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
    const chars = charactersRef.current;
    const furnitures = furnitureRef.current;
    const tm = tileMap.current;
    const fc = floorColors.current;

    ctx.clearRect(0, 0, width, height);

    const s = TILE_SIZE * zoom;
    const mapW = COLS * s;
    const mapH = ROWS * s;
    const offsetX = Math.floor((width - mapW) / 2) + Math.round(panX);
    const offsetY = Math.floor((height - mapH) / 2) + Math.round(panY);

    // Draw floor tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = tm[r][c];
        const colorIdx = r * COLS + c;

        if (tile === TT.WALL) {
          ctx.fillStyle = '#3A3A5C';
        } else {
          const floorColor = fc[colorIdx];
          if (floorColor) {
            ctx.fillStyle = hslToHex(floorColor.h, floorColor.s / 100, 0.5 + floorColor.c / 200);
          } else {
            ctx.fillStyle = FALLBACK_FLOOR_COLOR;
          }
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s + 0.5, s + 0.5);
      }
    }

    // Grid overlay (subtle)
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) {
      const x = offsetX + c * s;
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + ROWS * s);
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = offsetY + r * s;
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + COLS * s, y);
    }
    ctx.stroke();

    // Z-sorted drawables
    const drawables: Array<{ zY: number; draw: (c: CanvasRenderingContext2D) => void }> = [];

    // Furniture
    for (const f of furnitures) {
      const cached = getCachedSprite(f.sprite, zoom);
      const fx = offsetX + f.col * s;
      const fy = offsetY + f.row * s;
      const zY = f.row * TILE_SIZE + cached.height / zoom;

      if (f.mirrored) {
        drawables.push({
          zY,
          draw: (c) => {
            c.save();
            c.translate(fx + cached.width, fy);
            c.scale(-1, 1);
            c.drawImage(cached, 0, 0);
            c.restore();
          },
        });
      } else {
        drawables.push({
          zY,
          draw: (c) => c.drawImage(cached, fx, fy),
        });
      }
    }

    // Characters
    for (const ch of chars) {
      const sprites = getCharacterSprites(ch.palette, ch.hueShift);
      const spriteData = getCharacterSprite(ch, sprites);
      const cached = getCachedSprite(spriteData, zoom);
      const sittingOff = ch.state === CS.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
      const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - cached.height);
      const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

      // Selection/hover outline
      const isSelected = selectedAgent !== null && ch.id === selectedAgent.id;
      const isHovered = hoveredAgent !== null && ch.id === hoveredAgent;
      if (isSelected || isHovered) {
        const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA;
        const outlineData = getOutlineSprite(spriteData);
        const outlineCached = getCachedSprite(outlineData, zoom);
        drawables.push({
          zY: charZY - 0.001,
          draw: (c) => {
            c.save();
            c.globalAlpha = outlineAlpha;
            c.drawImage(outlineCached, drawX - zoom, drawY - zoom);
            c.restore();
          },
        });
      }

      drawables.push({
        zY: charZY,
        draw: (c) => c.drawImage(cached, drawX, drawY),
      });

      // Agent name label
      const agent = AGENTS.find(a => a.id === ch.id);
      if (agent) {
        drawables.push({
          zY: charZY + 0.01,
          draw: (c) => {
            const nameY = drawY - 8;
            c.save();
            c.font = `${Math.max(8, zoom * 2)}px monospace`;
            c.textAlign = 'center';
            c.fillStyle = 'rgba(0,0,0,0.7)';
            c.fillText(agent.emoji, drawX + cached.width / 2, nameY);
            c.restore();
          },
        });
      }
    }

    // Sort and draw
    drawables.sort((a, b) => a.zY - b.zY);
    for (const d of drawables) {
      d.draw(ctx);
    }

    // Draw agent names below characters (always visible)
    for (const ch of chars) {
      const agent = AGENTS.find(a => a.id === ch.id);
      if (!agent) continue;
      const sittingOff = ch.state === CS.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
      const baseX = offsetX + ch.x * zoom;
      const baseY = offsetY + (ch.y + sittingOff) * zoom;

      ctx.save();
      ctx.font = `bold ${Math.max(9, zoom * 2.2)}px monospace`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(agent.name, baseX, baseY + zoom * 4);
      ctx.fillStyle = agent.color;
      ctx.fillText(agent.name, baseX, baseY + zoom * 4);
      ctx.restore();
    }
  }, [zoom, panX, panY, selectedAgent, hoveredAgent]);

  // ── Game loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    lastTimeRef.current = performance.now();

    const loop = (time: number) => {
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = time;

      // Update characters
      const chars = charactersRef.current;
      for (const ch of chars) {
        ch.wanderTimer -= dt;

        if (ch.state === CS.IDLE) {
          // Bobbing idle animation
          ch.frameTimer += dt;
          if (ch.frameTimer > 0.5) {
            ch.frame = (ch.frame + 1) % 4;
            ch.frameTimer = 0;
          }

          // Start wandering
          if (ch.wanderTimer <= 0) {
            ch.state = CS.WALK;
            ch.wanderCount = 0;
            ch.wanderLimit = Math.floor(Math.random() * 3) + 2;
            // Pick random direction
            const dirs = [Dir.DOWN, Dir.UP, Dir.LEFT, Dir.RIGHT];
            ch.dir = dirs[Math.floor(Math.random() * dirs.length)];
          }
        } else if (ch.state === CS.WALK) {
          ch.frameTimer += dt;
          if (ch.frameTimer > WALK_FRAME_DURATION_SEC) {
            ch.frame = (ch.frame + 1) % 4;
            ch.frameTimer = 0;
          }

          // Move
          const speed = WALK_SPEED_PX_PER_SEC * dt;
          let dx = 0, dy = 0;
          switch (ch.dir) {
            case Dir.DOWN: dy = speed; break;
            case Dir.UP: dy = -speed; break;
            case Dir.LEFT: dx = -speed; break;
            case Dir.RIGHT: dx = speed; break;
          }
          ch.x += dx;
          ch.y += dy;

          // Keep in bounds
          ch.x = Math.max(TILE_SIZE * 1.5, Math.min(TILE_SIZE * (COLS - 1.5), ch.x));
          ch.y = Math.max(TILE_SIZE * 1.5, Math.min(TILE_SIZE * (ROWS - 1.5), ch.y));

          ch.wanderCount++;
          if (ch.wanderCount >= ch.wanderLimit) {
            ch.state = CS.IDLE;
            ch.wanderTimer = Math.random() * 8 + 3;
            ch.frame = 0;
          }
        } else if (ch.state === CS.TYPE) {
          ch.frameTimer += dt;
          if (ch.frameTimer > TYPE_FRAME_DURATION_SEC) {
            ch.frame = (ch.frame + 1) % 2;
            ch.frameTimer = 0;
          }
        }
      }

      renderFrame(ctx, canvas.width, canvas.height, time);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [loaded, renderFrame]);

  // ── Mouse handlers ────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const s = TILE_SIZE * zoom;
    const mapW = COLS * s;
    const mapH = ROWS * s;
    const offsetX = Math.floor((canvas.width / (window.devicePixelRatio || 1) - mapW) / 2) + Math.round(panX);
    const offsetY = Math.floor((canvas.height / (window.devicePixelRatio || 1) - mapH) / 2) + Math.round(panY);

    // Check if click is on a character
    let clicked: AgentInfo | null = null;
    for (const ch of charactersRef.current) {
      const sprites = getCharacterSprites(ch.palette, ch.hueShift);
      const spriteData = getCharacterSprite(ch, sprites);
      const cached = getCachedSprite(spriteData, zoom);
      const sittingOff = ch.state === CS.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
      const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - cached.height);

      if (mx >= drawX && mx <= drawX + cached.width && my >= drawY && my <= drawY + cached.height) {
        clicked = AGENTS.find(a => a.id === ch.id) || null;
        break;
      }
    }

    setSelectedAgent(clicked);
  }, [zoom, panX, panY]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      setZoom(z => Math.max(1, Math.min(6, z + (e.deltaY > 0 ? -0.5 : 0.5))));
    } else {
      // Pan
      setPanX(px => px - e.deltaX);
      setPanY(py => py - e.deltaY);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
    }
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPanX(panStart.current.panX + (e.clientX - panStart.current.x));
      setPanY(panStart.current.panY + (e.clientY - panStart.current.y));
    }

    // Hover detection
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const s = TILE_SIZE * zoom;
    const dpr = window.devicePixelRatio || 1;
    const mapW = COLS * s;
    const mapH = ROWS * s;
    const offsetX = Math.floor((canvas.width / dpr - mapW) / 2) + Math.round(panX);
    const offsetY = Math.floor((canvas.height / dpr - mapH) / 2) + Math.round(panY);

    let hovered: number | null = null;
    for (const ch of charactersRef.current) {
      const sprites = getCharacterSprites(ch.palette, ch.hueShift);
      const spriteData = getCharacterSprite(ch, sprites);
      const cached = getCachedSprite(spriteData, zoom);
      const sittingOff = ch.state === CS.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
      const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
      const drawY = Math.round(offsetY + (ch.y + sittingOff) * zoom - cached.height);

      if (mx >= drawX && mx <= drawX + cached.width && my >= drawY && my <= drawY + cached.height) {
        hovered = ch.id;
        break;
      }
    }
    setHoveredAgent(hovered);
  }, [isPanning, zoom, panX, panY]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 48px - 32px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            🎮 Oficina Pixel Art
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Los agentes de OpenClaw en su oficina. Click para seleccionar. Scroll para zoom.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.min(6, z + 0.5))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            🔍+
          </button>
          <button
            onClick={() => setZoom(z => Math.max(1, z - 0.5))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            🔍−
          </button>
          <button
            onClick={() => { setPanX(0); setPanY(0); setZoom(3); }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-4" style={{ minHeight: 0 }}>
        {/* Canvas area */}
        <div
          className="flex-1 rounded-xl overflow-hidden relative"
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid var(--border)",
            minHeight: "500px",
          }}
        >
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin text-4xl mb-4">🎮</div>
                <p style={{ color: "var(--text-muted)" }}>Cargando oficina pixel art...</p>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer"
            onClick={handleCanvasClick}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Side panel */}
        <div
          className="w-72 rounded-xl p-4 overflow-y-auto flex-shrink-0"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            maxHeight: "calc(100vh - 48px - 32px - 80px)",
          }}
        >
          <h2 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            Agentes
          </h2>

          <div className="space-y-2">
            {AGENTS.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                className="w-full text-left p-3 rounded-lg transition-all"
                style={{
                  backgroundColor: selectedAgent?.id === agent.id ? agent.color + "20" : "var(--card-elevated)",
                  border: selectedAgent?.id === agent.id ? `2px solid ${agent.color}` : "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{agent.emoji}</span>
                  <div>
                    <div className="font-semibold text-sm" style={{ color: agent.color }}>
                      {agent.name}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {agent.role}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected agent detail */}
          {selectedAgent && (
            <div
              className="mt-4 p-3 rounded-lg"
              style={{
                backgroundColor: "var(--card-elevated)",
                border: `1px solid ${selectedAgent.color}40`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{selectedAgent.emoji}</span>
                <div>
                  <div className="font-bold" style={{ color: selectedAgent.color }}>
                    {selectedAgent.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {selectedAgent.role}
                  </div>
                </div>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {selectedAgent.description}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: "#10B981" }}
                />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Online — {characters.find(c => c.id === selectedAgent.id)?.state === CS.TYPE ? "Escribiendo" : characters.find(c => c.id === selectedAgent.id)?.state === CS.WALK ? "Caminando" : "Idle"}
                </span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
              CONTROLES
            </h3>
            <div className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
              <div>🖱️ Click — Seleccionar agente</div>
              <div>🔍 Scroll — Zoom</div>
              <div>⌘ Scroll — Zoom rápido</div>
              <div>Alt+Arrastrar — Mover vista</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HSL to hex helper ──────────────────────────────────────
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
