import { describe, expect, it } from 'vitest';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import { games, GAMES_DATA } from './games';

describe('frontend canonical game inventory', () => {
  it('exposes exactly the server-supported game capabilities and player ranges', () => {
    expect(games.map(game => game.slug)).toEqual(GAME_DEFINITIONS.map(game => game.id));
    for (const definition of GAME_DEFINITIONS) {
      expect(games.find(game => game.slug === definition.id)?.multiplayer).toBe(definition.online);
      expect(GAMES_DATA.find(game => game.id === definition.id)).toMatchObject({
        online: definition.online,
        players: definition.minPlayers === definition.maxPlayers ? `${definition.maxPlayers}` : `${definition.minPlayers}–${definition.maxPlayers}`,
      });
    }
  });
});
