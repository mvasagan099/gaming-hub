import { prisma } from "@gaming-hub/db";

interface SeedAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  gameId: string | null;
  xpReward: number;
  condition: unknown;
}

const ACHIEVEMENTS: SeedAchievement[] = [
  { code: "first-win", title: "First Blood", description: "Win your first online match", icon: "🎯", gameId: null, xpReward: 50, condition: { rule: "first-win" } },
  { code: "play-5", title: "Social Butterfly", description: "Play 5 online matches", icon: "🤝", gameId: null, xpReward: 40, condition: { rule: "games", count: 5 } },
  { code: "play-25", title: "Marathon Runner", description: "Play 25 online matches", icon: "🏃", gameId: null, xpReward: 100, condition: { rule: "games", count: 25 } },
  { code: "win-5", title: "Five-Fingered Strike", description: "Win 5 online matches", icon: "⚔️", gameId: null, xpReward: 75, condition: { rule: "wins", count: 5 } },
  { code: "win-25", title: "King of the Arena", description: "Win 25 online matches", icon: "👑", gameId: null, xpReward: 250, condition: { rule: "wins", count: 25 } },
  { code: "snake-ladder-win", title: "Snake Charmer", description: "Win a Snake & Ladder match", icon: "🐍", gameId: "snake-ladder", xpReward: 30, condition: { rule: "game-win", gameId: "snake-ladder" } },
  { code: "snake-ladder-games-10", title: "Dice Lord", description: "Play 10 Snake & Ladder matches", icon: "🎲", gameId: "snake-ladder", xpReward: 60, condition: { rule: "game-games", gameId: "snake-ladder", count: 10 } },
  { code: "chess-win", title: "Grandmaster", description: "Win a Chess match", icon: "♟️", gameId: "chess", xpReward: 30, condition: { rule: "game-win", gameId: "chess" } },
  { code: "chess-games-10", title: "Strategist", description: "Play 10 Chess matches", icon: "🧠", gameId: "chess", xpReward: 60, condition: { rule: "game-games", gameId: "chess", count: 10 } },
  { code: "level-5", title: "Rising Star", description: "Reach level 5", icon: "🚀", gameId: null, xpReward: 80, condition: { rule: "level", level: 5 } },
  { code: "level-10", title: "Star Player", description: "Reach level 10", icon: "🌟", gameId: null, xpReward: 150, condition: { rule: "level", level: 10 } },
  { code: "referral-1", title: "Friend Bringer", description: "Refer 1 friend who joins with your code", icon: "🧲", gameId: null, xpReward: 60, condition: { rule: "referrals", count: 1 } },
  { code: "referral-5", title: "Networker", description: "Refer 5 friends who join with your code", icon: "📢", gameId: null, xpReward: 150, condition: { rule: "referrals", count: 5 } },
  { code: "referral-25", title: "Community Builder", description: "Refer 25 friends who join with your code", icon: "🏙️", gameId: null, xpReward: 400, condition: { rule: "referrals", count: 25 } },
  { code: "referral-reward-500", title: "Bonus Collector", description: "Earn 500 bonus coins in referral rewards", icon: "💰", gameId: null, xpReward: 100, condition: { rule: "referral-rewards", count: 500 } },
  { code: "friend-1", title: "Social Start", description: "Add your first friend", icon: "🤝", gameId: null, xpReward: 30, condition: { rule: "friends", count: 1 } },
  { code: "friend-10", title: "Social Circle", description: "Add 10 friends", icon: "👥", gameId: null, xpReward: 80, condition: { rule: "friends", count: 10 } },
  { code: "friend-50", title: "Influencer", description: "Add 50 friends", icon: "🫂", gameId: null, xpReward: 200, condition: { rule: "friends", count: 50 } },
  { code: "wallet-100", title: "First Stack", description: "Hold 100 coins in your main balance", icon: "💎", gameId: null, xpReward: 60, condition: { rule: "wallet-balance", min: 100 } },
  { code: "wallet-1000", title: "High Roller", description: "Hold 1,000 coins in your main balance", icon: "🏦", gameId: null, xpReward: 180, condition: { rule: "wallet-balance", min: 1000 } },
  { code: "wallet-10000", title: "Whale", description: "Hold 10,000 coins in your main balance", icon: "🐋", gameId: null, xpReward: 500, condition: { rule: "wallet-balance", min: 10000 } },
  { code: "tournament-win-1", title: "Tournament Champ", description: "Win your first tournament", icon: "🏆", gameId: null, xpReward: 150, condition: { rule: "tournament-wins", count: 1 } },
  { code: "tournament-win-5", title: "Tournament Legend", description: "Win 5 tournaments", icon: "🥇", gameId: null, xpReward: 400, condition: { rule: "tournament-wins", count: 5 } },
  { code: "xp-500", title: "Experience Seeker", description: "Earn 500 XP", icon: "🧗", gameId: null, xpReward: 50, condition: { rule: "xp", count: 500 } },
  { code: "xp-2500", title: "Experience Veteran", description: "Earn 2,500 XP", icon: "🧗‍♂️", gameId: null, xpReward: 120, condition: { rule: "xp", count: 2500 } },
];

async function main() {
  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      create: {
        code: achievement.code,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        gameId: achievement.gameId,
        xpReward: achievement.xpReward,
        condition: achievement.condition as object,
      },
      update: {
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        gameId: achievement.gameId,
        xpReward: achievement.xpReward,
        condition: achievement.condition as object,
      },
    });
  }
  console.log(`Seeded ${ACHIEVEMENTS.length} achievements`);
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
