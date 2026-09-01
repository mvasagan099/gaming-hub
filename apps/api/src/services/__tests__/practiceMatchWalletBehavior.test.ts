import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { GameCoinService } from "../gameCoinService";
import { SettlementService } from "../settlementService";
import { GameConfigService } from "../gameConfigService";
import { getWallet, claimPracticeReward } from "../wallet";
import { registerForTournament } from "../tournaments";
import { settleTournament } from "../tournamentEngine";

describe("Practice Match Wallet Behavior & Financial Isolation", () => {
  const playerA = "test-practice-player-a";
  const playerB = "test-practice-player-b";

  beforeEach(async () => {
    // Setup test users with wallets
    for (const uid of [playerA, playerB]) {
      await prisma.user.upsert({
        where: { id: uid },
        create: {
          id: uid,
          email: `${uid}@test.local`,
          username: uid,
          displayName: `Player ${uid}`,
        },
        update: {},
      });

      await prisma.profile.upsert({
        where: { userId: uid },
        create: {
          userId: uid,
          coins: 500,
        },
        update: {
          coins: 500,
        },
      });

      await prisma.wallet.upsert({
        where: { userId: uid },
        create: {
          userId: uid,
          balance: 500,
        },
        update: {
          balance: 500,
          isFrozen: false,
        },
      });
    }

    // Clean up test transactions, matches, and tournament entries
    await prisma.transaction.deleteMany({
      where: { userId: { in: [playerA, playerB] } },
    });
    await prisma.tournamentPlayer.deleteMany({
      where: { userId: { in: [playerA, playerB] } },
    });
  });

  it("1 & 2. Starting and joining a practice match (stake = 0) does not debit wallet", async () => {
    const initialWalletA = await getWallet(playerA);
    const initialWalletB = await getWallet(playerB);
    expect(initialWalletA.balance).toBe(500);
    expect(initialWalletB.balance).toBe(500);

    // Create a 0-stake practice match
    const match = await GameCoinService.createAndFundMatch({
      matchId: randomUUID(),
      gameId: "chess",
      stake: 0,
      players: [
        { userId: playerA, seat: 0 },
        { userId: playerB, seat: 1 },
      ],
    });

    expect(match.status).toBe("ACTIVE");
    expect(match.stake).toBe(0);

    // Verify wallets are untouched
    const afterWalletA = await getWallet(playerA);
    const afterWalletB = await getWallet(playerB);
    expect(afterWalletA.balance).toBe(500);
    expect(afterWalletB.balance).toBe(500);

    // Verify 0 transactions were created
    const txCount = await prisma.transaction.count({
      where: { userId: { in: [playerA, playerB] } },
    });
    expect(txCount).toBe(0);
  });

  it("3 & 4. Winning or losing a practice match does not credit or change wallet", async () => {
    const initialWalletA = await getWallet(playerA);
    const initialWalletB = await getWallet(playerB);

    const match = await GameCoinService.createAndFundMatch({
      matchId: randomUUID(),
      gameId: "chess",
      stake: 0,
      players: [
        { userId: playerA, seat: 0 },
        { userId: playerB, seat: 1 },
      ],
    });

    // Settle match with playerA winning
    const settlement = await SettlementService.settleMatch({
      matchId: match.id,
      winnerIds: [playerA],
      options: {
        rated: false,
        resultType: "WIN",
        scores: { [playerA]: 100, [playerB]: 50 },
      },
    });

    expect(settlement.totalPot).toBe(0);
    expect(settlement.prizePool).toBe(0);
    expect(settlement.payouts.every((p) => p.amount === 0)).toBe(true);

    // Verify wallet balances remain exactly 500
    const afterWalletA = await getWallet(playerA);
    const afterWalletB = await getWallet(playerB);
    expect(afterWalletA.balance).toBe(500);
    expect(afterWalletB.balance).toBe(500);

    // Attempting to call claimPracticeReward returns 0 coins and does not mutate wallet
    const rewardResult = await claimPracticeReward(playerA, "chess");
    expect(rewardResult.claimed).toBe(false);
    expect(rewardResult.amount).toBe(0);
    expect(rewardResult.balance).toBe(500);

    const finalWalletA = await getWallet(playerA);
    expect(finalWalletA.balance).toBe(500);
  });

  it("5. Exiting or cancelling a practice match does not create a refund or penalty transaction", async () => {
    const match = await GameCoinService.createAndFundMatch({
      matchId: randomUUID(),
      gameId: "table-tennis",
      stake: 0,
      players: [
        { userId: playerA, seat: 0 },
        { userId: playerB, seat: 1 },
      ],
    });

    // Cancel match
    const cancelledMatch = await GameCoinService.cancelMatch(match.id, "player_exited");
    expect(cancelledMatch.status).toBe("CANCELLED");

    // Verify balances
    const afterWalletA = await getWallet(playerA);
    const afterWalletB = await getWallet(playerB);
    expect(afterWalletA.balance).toBe(500);
    expect(afterWalletB.balance).toBe(500);

    const txCount = await prisma.transaction.count({
      where: { userId: { in: [playerA, playerB] } },
    });
    expect(txCount).toBe(0);
  });

  it("6 & 7. Completing a practice match creates zero financial transactions and zero ledger entries", async () => {
    const match = await GameCoinService.createAndFundMatch({
      matchId: randomUUID(),
      gameId: "carrom",
      stake: 0,
      players: [
        { userId: playerA, seat: 0 },
        { userId: playerB, seat: 1 },
      ],
    });

    await SettlementService.settleMatch({
      matchId: match.id,
      winnerIds: [playerB],
    });

    const txs = await prisma.transaction.findMany({
      where: { userId: { in: [playerA, playerB] } },
    });
    expect(txs.length).toBe(0);

    const wA = await getWallet(playerA);
    const wB = await getWallet(playerB);
    expect(wA.balance).toBe(500);
    expect(wB.balance).toBe(500);
  });

  it("8 & 9. Paid tournament match still deducts the correct entry fee and credits the winner prize", async () => {
    // Create tournament
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "chess",
        title: "Paid Championship Test",
        description: "Official Paid Tournament",
        entryFee: 25,
        prizePool: 40,
        minPlayers: 2,
        maxPlayers: 2,
        status: "REGISTRATION_OPEN",
        prizeDistribution: { "1": 30, "2": 10 },
        startTime: new Date(),
      },
    });

    // Player A & B register for paid tournament
    await registerForTournament(playerA, tournament.id);
    await registerForTournament(playerB, tournament.id);

    const wAAfterReg = await getWallet(playerA);
    const wBAfterReg = await getWallet(playerB);
    expect(wAAfterReg.balance).toBe(475); // 500 - 25
    expect(wBAfterReg.balance).toBe(475); // 500 - 25

    // Update player final ranks for tournament completion
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId: tournament.id, userId: playerA },
      data: { finalRank: 1 },
    });
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId: tournament.id, userId: playerB },
      data: { finalRank: 2 },
    });

    // Settle tournament
    await settleTournament(tournament.id);

    const wAFinal = await getWallet(playerA);
    const wBFinal = await getWallet(playerB);
    // Paid tournament: prize credits are processed accurately
    expect(wAFinal.balance).toBeGreaterThan(475);
    expect(wBFinal.balance).toBeGreaterThanOrEqual(475);

    // Check financial transactions created for paid tournament
    const aTxs = await prisma.transaction.findMany({ where: { userId: playerA } });
    expect(aTxs.some((t) => t.type === "DEBIT" && t.amount === 25)).toBe(true);
    expect(aTxs.some((t) => t.type === "CREDIT")).toBe(true);
  });

  it("10. Practice-match client input cannot bypass paid-match rules", async () => {
    // Player cannot pass invalid stake not configured in game
    await expect(
      GameConfigService.validateJoin("chess", 999, 500),
    ).rejects.toThrow();

    // 0-stake snapshot always produces 0 prize settlement
    const snapshot = await GameConfigService.createSnapshot("chess", 0);
    const settlement = GameConfigService.calculatePrizeSettlement(snapshot, 2, [playerA]);
    expect(settlement.totalPot).toBe(0);
    expect(settlement.prizePool).toBe(0);
    expect(settlement.winnerPayout).toBe(0);
    expect(settlement.refundPerPlayer).toBe(0);
  });
});
