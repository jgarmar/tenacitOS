// ── Furniture Catalog (simplified for mission-control) ────────

import type { FurnitureCatalogEntry, SpriteData } from '../types';

// Simple catalog entry for known furniture types
const SIMPLE_CATALOG: Record<string, FurnitureCatalogEntry> = {
  DESK_FRONT: {
    type: 'DESK_FRONT',
    label: 'Desk',
    footprintW: 2,
    footprintH: 1,
    sprite: [['#8B4513', '#8B4513'], ['#8B4513', '#8B4513']],
    isDesk: true,
  },
  WOODEN_CHAIR_SIDE: {
    type: 'WOODEN_CHAIR_SIDE',
    label: 'Chair',
    footprintW: 1,
    footprintH: 1,
    sprite: [['#8B4513']],
    isDesk: false,
    category: 'chairs',
  },
  CUSHIONED_BENCH: {
    type: 'CUSHIONED_BENCH',
    label: 'Sofa',
    footprintW: 2,
    footprintH: 1,
    sprite: [['#4682B4', '#4682B4']],
    isDesk: false,
    category: 'chairs',
  },
};

export function getCatalogEntry(type: string): FurnitureCatalogEntry | undefined {
  return SIMPLE_CATALOG[type];
}

export function isRotatable(_type: string): boolean {
  return false;
}

export const FURNITURE_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'desks', label: 'Desks' },
  { id: 'chairs', label: 'Chairs' },
  { id: 'decor', label: 'Decor' },
];