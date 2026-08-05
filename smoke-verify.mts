import { prisma } from "@gaming-hub/db";

async function main() {
  const rooms = await prisma.room.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  console.log("\n=== ROOMS ===");
  for (const r of rooms) {
    const players = await prisma.roomPlayer.findMany({ where: { roomId: r.id } });
    console.log(
      `${r.code} game=${r.gameId} status=${r.status} stake=${r.stake} private=${r.isPrivate} host=${r.hostId.slice(0, 8)} players=${players.length}`
    );
    for (const p of players) {
      console.log(`   seat=${p.seat} ready=${p.isReady} host=${p.isHost} spec=${p.isSpectator} conn=${p.connectionStatus} user=${p.userId.slice(0, 8)}`);
    }
  }

  const matches = await prisma.match.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  console.log("\n=== MATCHES ===");
  for (const m of matches) {
    const players = await prisma.matchPlayer.findMany({ where: { matchId: m.id } });
    console.log(`match=${m.id.slice(0, 8)} game=${m.gameId} status=${m.status} stake=${m.stake} winners=${m.winnerIds} started=${m.startedAt} ended=${m.endedAt}`);
    for (const p of players) {
      console.log(`   seat=${p.seat} result=${p.result} score=${p.score} user=${p.userId.slice(0, 8)}`);
    }
  }

  const stateCount = await prisma.gameState.count();
  const moveCount = await prisma.move.count();
  console.log(`\n=== STATE === gameStates=${stateCount} moves=${moveCount}`);
  const moves = await prisma.move.findMany({ orderBy: { turnNumber: "desc" }, take: 10 });
  for (const mv of moves) {
    console.log(`move match=${mv.matchId.slice(0, 8)} seat=${mv.seat} turn=${mv.turnNumber} action=${JSON.stringify(mv.action)}`);
  }
  const gs = await prisma.gameState.findFirst({ orderBy: { updatedAt: "desc" } });
  if (gs) console.log(`latest state: turn=${gs.turnNumber} state=${JSON.stringify(gs.state).slice(0, 300)}`);

  const chats = await prisma.chatMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  console.log(`\n=== CHAT === count recent=${chats.length}`);
  for (const c of chats) console.log(`${c.senderId.slice(0, 8)}: ${c.text}`);

  const users = await prisma.user.findMany({ take: 10, select: { id: true, email: true, username: true, createdAt: true } });
  console.log("\n=== USERS ===");
  for (const u of users) console.log(`${u.id.slice(0, 8)} ${u.email} username=${u.username} created=${u.createdAt.toISOString()}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("\nDONE");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
