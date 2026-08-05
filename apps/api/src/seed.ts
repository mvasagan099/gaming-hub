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
