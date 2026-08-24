import { prisma, SeasonStatus } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { audit } from "./audit";

export class SeasonService {
  static async listSeasons(status?: SeasonStatus) {
    const where = status ? { status } : {};
    return prisma.season.findMany({
      where,
      orderBy: { startDate: "desc" },
    });
  }

  static async getSeason(id: string, userId?: string) {
    const season = await prisma.season.findUnique({
      where: { id },
    });
    if (!season) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }
    return {
      season,
      userId,
    };
  }

  static async getSeasonLeaderboard(id: string, page: number, pageSize: number, userId?: string) {
    const season = await prisma.season.findUnique({
      where: { id },
    });
    if (!season) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }

    const total = await prisma.competitiveRank.count({
      where: { seasonId: id },
    });

    const entries = await prisma.competitiveRank.findMany({
      where: { seasonId: id },
      orderBy: { rating: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      seasonId: id,
      entries,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      requestingUserId: userId,
    };
  }

  static async createSeason(data: any, userId: string) {
    const season = await prisma.season.create({
      data: {
        gameId: data.gameIds?.[0] || "chess",
        name: data.title,
        startDate: new Date(data.startAt),
        endDate: new Date(data.endAt),
        status: data.status || SeasonStatus.UPCOMING,
        rewards: data.rewards || [],
      },
    });

    await audit({
      actorId: userId,
      category: "admin",
      action: "CREATE_SEASON",
      targetId: season.id,
      meta: { data },
    });

    return season;
  }

  static async updateSeason(id: string, data: any, userId: string) {
    const existing = await prisma.season.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }

    const updated = await prisma.season.update({
      where: { id },
      data: {
        ...(data.title && { name: data.title }),
        ...(data.startAt && { startDate: new Date(data.startAt) }),
        ...(data.endAt && { endDate: new Date(data.endAt) }),
        ...(data.status && { status: data.status }),
        ...(data.rewards && { rewards: data.rewards }),
      },
    });

    await audit({
      actorId: userId,
      category: "admin",
      action: "UPDATE_SEASON",
      targetId: id,
      meta: { data },
    });

    return updated;
  }

  static async activateSeason(id: string, userId: string) {
    const season = await prisma.season.findUnique({ where: { id } });
    if (!season) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }

    const updated = await prisma.season.update({
      where: { id },
      data: { status: SeasonStatus.ACTIVE },
    });

    await audit({
      actorId: userId,
      category: "admin",
      action: "ACTIVATE_SEASON",
      targetId: id,
    });

    return updated;
  }

  static async endSeason(id: string, userId: string) {
    const season = await prisma.season.findUnique({ where: { id } });
    if (!season) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }

    const updated = await prisma.season.update({
      where: { id },
      data: { status: SeasonStatus.ENDED },
    });

    await audit({
      actorId: userId,
      category: "admin",
      action: "END_SEASON",
      targetId: id,
    });

    return updated;
  }

  static async cancelSeason(id: string, userId: string, reason?: string) {
    const season = await prisma.season.findUnique({ where: { id } });
    if (!season) {
      throw new AppError("NOT_FOUND", "Season not found", 404);
    }

    const updated = await prisma.season.update({
      where: { id },
      data: { status: SeasonStatus.ENDED },
    });

    await audit({
      actorId: userId,
      category: "admin",
      action: "CANCEL_SEASON",
      targetId: id,
      meta: { reason },
    });

    return updated;
  }
}
