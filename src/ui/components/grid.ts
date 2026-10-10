import type { CSSProperties } from 'react';

export const GRID_COLS = 3;
export const GRID_ROWS = 2;
export const GRID_SLOTS = GRID_COLS * GRID_ROWS;

export const CARD_STYLE: CSSProperties = {
  padding: '10px 6px',
  minHeight: 84,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};
