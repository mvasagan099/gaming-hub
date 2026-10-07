import { describe, expect, it } from 'vitest';
import { LudoEngine } from '@gaming-hub/game-engine';
import { HOME_COL_BASE as SERVER_BASE, START_POSITION as SERVER_START, HOME_COLUMN_ENTRY as SERVER_ENTRY, colorsForPlayerCount } from '../../../../../../../packages/game-engine/src/ludo/board';
import { YARDS, HOME_COL_BASE, START_POSITION, HOME_COLUMN_ENTRY, PLAYER_COLORS_ORDER } from './boardLayout';
import { LudoRuleEngine } from '../engine/LudoRuleEngine';
import { DEFAULT_SETTINGS } from '../types/ludo.types';

describe('Ludo canonical color layout', () => {
  it('uses the requested clockwise corner layout', () => {
    expect(YARDS).toEqual({ green: { col: 0, row: 0 }, yellow: { col: 9, row: 0 }, blue: { col: 9, row: 9 }, red: { col: 0, row: 9 } });
    expect(PLAYER_COLORS_ORDER).toEqual(['green', 'yellow', 'blue', 'red']);
  });
  it('keeps server rules and client world coordinates identical', () => {
    expect(HOME_COL_BASE).toEqual(SERVER_BASE);
    expect(START_POSITION).toEqual(SERVER_START);
    expect(HOME_COLUMN_ENTRY).toEqual(SERVER_ENTRY);
  });
  it('assigns opposite corners and preserves color/token ownership through turns and snapshots', () => {
    const engine = new LudoEngine([{ userId: 'black', seat: 1 }, { userId: 'white', seat: 0 }], () => 0);
    const colors = colorsForPlayerCount(2);
    const [a,b] = colors.map(color => YARDS[color]);
    expect(a.col).not.toBe(b.col); expect(a.row).not.toBe(b.row);
    const local = new LudoRuleEngine(DEFAULT_SETTINGS).createInitialState(2);
    expect(local.players.map(p => p.color)).toEqual(colors);
    expect(engine.state.players.map(p => p.color)).toEqual(colors);
    engine.apply({ type: 'roll' }, 0);
    const snapshot = engine.serialize() as typeof engine.state;
    expect(snapshot.currentSeat).toBe(1);
    expect(snapshot.players.find(p => p.seat === snapshot.currentSeat)?.color).toBe(colors[1]);
    for (const player of snapshot.players) expect(player.tokens.every(t => t.color === player.color && t.id.startsWith(player.color + '-'))).toBe(true);
  });
});
