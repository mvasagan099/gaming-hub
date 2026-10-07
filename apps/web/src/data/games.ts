import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { Game } from '../types/game';

// Online capability and player limits come from the same registry as the server.
export const games: Game[] = GAME_DEFINITIONS.map((game, index) => ({
  id: index + 1,
  name: game.name,
  slug: game.slug,
  description: game.description,
  icon: game.icon,
  category: game.category,
  multiplayer: game.online,
  featured: game.featured,
  image: `/images/${game.id}.png`,
}));

export const GAMES_DATA = GAME_DEFINITIONS.map(game => ({
  id: game.id,
  name: game.name,
  slug: game.slug,
  image: `/images/${game.id}.png`,
  description: game.description,
  players: game.minPlayers === game.maxPlayers ? `${game.maxPlayers}` : `${game.minPlayers}–${game.maxPlayers}`,
  category: game.category,
  online: game.online,
  rating: 4.8,
  bgGradient: 'from-indigo-600 to-purple-600',
  isFeatured: game.featured,
}));
