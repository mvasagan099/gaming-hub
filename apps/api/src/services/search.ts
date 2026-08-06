import { prisma } from "@gaming-hub/db";
import { GAME_DEFINITIONS } from "@gaming-hub/shared";
import type { SearchType } from "@gaming-hub/shared";
import { getCategorySettings } from "./settings";
import { isFeatureEnabled } from "./featureFlags";

export interface SearchInput {
  query: string;
  type?: SearchType;
  limit?: number;
}

/**
 * Global enterprise search across users, games, and tournaments. Results are
 * trimmed to the configured max and the query is optionally recorded to each
 * user's search history.
 */
export async function globalSearch(userId: string, input: SearchInput) {
  const searchSettings = await getCategorySettings("search");
  if (!searchSettings.enabled) {
    return { users: [], games: [], tournaments: [], tickets: [], coupons: [], total: 0 };
  }

  const q = input.query.trim();
  const limit = Math.min(searchSettings.maxResults, Math.max(1, input.limit ?? searchSettings.maxResults));
  const type = input.type ?? "GLOBAL";

  const [
    usersEnabled,
    gamesFlag,
    tournamentsEnabled,
    ticketsEnabled,
    couponsEnabled,
  ] = await Promise.all([
    Promise.resolve(searchSettings.userSearchEnabled),
    isFeatureEnabled("social.profiles"),
    Promise.resolve(searchSettings.tournamentSearchEnabled),
    Promise.resolve(searchSettings.ticketSearchEnabled),
    Promise.resolve(searchSettings.couponSearchEnabled),
  ]);

  const wants = (t: SearchType) => type === "GLOBAL" || type === t;

  const [userRows, gameRows, tournamentRows, ticketRows, couponRows] = await Promise.all([
    wants("USERS") && usersEnabled
      ? prisma.user.findMany({
          where: {
            deletedAt: null,
            OR: [
              { username: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          },
          take: limit,
          select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
        })
      : Promise.resolve([]),
    wants("GAMES")
      ? Promise.resolve(
          GAME_DEFINITIONS.filter(
            (g) =>
              g.name.toLowerCase().includes(q.toLowerCase()) ||
              g.description.toLowerCase().includes(q.toLowerCase()) ||
              g.category.toLowerCase().includes(q.toLowerCase()),
          )
            .slice(0, limit)
            .map((g) => ({
              gameId: g.id,
              name: g.name,
              description: g.description,
              icon: g.icon,
              playersOnline: 0,
            })),
        )
      : Promise.resolve([]),
    wants("TOURNAMENTS") && tournamentsEnabled
      ? prisma.tournament.findMany({
          where: {
            status: { in: ["UPCOMING", "LIVE"] },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { startTime: "asc" },
          take: limit,
          include: { _count: { select: { players: true } } },
        })
      : Promise.resolve([]),
    wants("TICKETS") && ticketsEnabled
      ? prisma.supportTicket.findMany({
          where: {
            userId,
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: {
            id: true,
            subject: true,
            category: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    wants("COUPONS") && couponsEnabled
      ? prisma.couponRedemption.findMany({
          where: {
            userId,
            coupon: {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
              ],
            },
          },
          include: { coupon: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  if (searchSettings.saveHistory && q.length >= 2) {
    await prisma.searchHistory.create({
      data: { userId, query: q.slice(0, 120), type },
    });
  }

  const tournaments = tournamentRows.map((t) => ({
    id: t.id,
    gameId: t.gameId as import("@gaming-hub/shared").GameId,
    title: t.title,
    description: t.description,
    format: t.format,
    prizePool: t.prizePool,
    entryFee: t.entryFee,
    maxPlayers: t.maxPlayers,
    registeredCount: t._count.players,
    startTime: t.startTime.toISOString(),
    status: t.status,
  }));

  const tickets = ticketRows.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED",
    priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
    createdAt: t.createdAt.toISOString(),
  }));

  const coupons = couponRows.map((c) => ({
    id: c.id,
    code: c.coupon.code,
    title: c.coupon.title,
    value: c.value,
    createdAt: c.createdAt.toISOString(),
  }));

  return {
    users: userRows,
    games: gameRows,
    tournaments,
    tickets,
    coupons,
    total: userRows.length + gameRows.length + tournaments.length + tickets.length + coupons.length,
  };
}

export async function getSearchSuggestions(userId: string, prefix: string, limit = 8) {
  const q = prefix.trim();
  if (!q) return [];
  const history = await prisma.searchHistory.findMany({
    where: { userId, query: { startsWith: q, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    distinct: ["query"],
  });
  return history.map((h) => ({ query: h.query, type: h.type as SearchType }));
}

export async function clearSearchHistory(userId: string) {
  await prisma.searchHistory.deleteMany({ where: { userId } });
  return { ok: true };
}
