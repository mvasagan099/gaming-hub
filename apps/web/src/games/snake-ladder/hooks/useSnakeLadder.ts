import { useState, useCallback } from "react";
import type { SnakeLadderState } from "../types";
import { snakeMap } from "../data/snakes";
import { ladderMap } from "../data/ladders";
import confetti from "canvas-confetti";
import { useUserStore } from "../../../store/useUserStore";

export const useSnakeLadder = (mode: "ai" | "multiplayer", stake: number) => {
  const { addCoins } = useUserStore();

  const [state, setState] = useState<SnakeLadderState>({
    currentPlayer: 0,
    dice: 1,
    isRolling: false,
    isMoving: false,
    winner: undefined,
    players: [
      { id: 1, name: "Player 1 (You)", avatar: "🔴", color: "#ef4444", position: 1, isAI: false },
      { id: 2, name: mode === "ai" ? "Bot Opponent" : "Player 2", avatar: "🟢", color: "#10b981", position: 1, isAI: mode === "ai" },
    ],
    logs: ["Game started! Roll dice to move."],
  });

  const rollDice = useCallback(() => {
    if (state.isRolling || state.isMoving || state.winner !== undefined) return;

    setState((prev) => ({ ...prev, isRolling: true }));

    let count = 0;
    const interval = setInterval(() => {
      setState((prev) => ({ ...prev, dice: Math.floor(Math.random() * 6) + 1 }));
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalDice = Math.floor(Math.random() * 6) + 1;

        setState((prev) => {
          const playerIdx = prev.currentPlayer;
          const player = prev.players[playerIdx];

          let targetPos = player.position + finalDice;
          if (targetPos > 100) targetPos = player.position;

          let logMsg = `${player.name} rolled ${finalDice} → cell ${targetPos}.`;
          if (snakeMap.has(targetPos)) {
            logMsg = `🐍 ${player.name} bit by snake! Slid to ${snakeMap.get(targetPos)}.`;
            targetPos = snakeMap.get(targetPos)!;
          } else if (ladderMap.has(targetPos)) {
            logMsg = `🪜 ${player.name} climbed ladder up to ${ladderMap.get(targetPos)}!`;
            targetPos = ladderMap.get(targetPos)!;
          }

          const updatedPlayers: [typeof player, typeof player] = [
            playerIdx === 0 ? { ...player, position: targetPos } : prev.players[0],
            playerIdx === 1 ? { ...player, position: targetPos } : prev.players[1],
          ];

          const isWin = targetPos === 100;
          const winner = isWin ? playerIdx : undefined;

          if (isWin) {
            addCoins(stake * 1.8);
            confetti();
          }

          const nextPlayer = isWin ? playerIdx : (playerIdx + 1) % 2;

          if (!isWin && mode === "ai" && updatedPlayers[nextPlayer].isAI) {
            setTimeout(() => {
              triggerAITurn(updatedPlayers, nextPlayer);
            }, 900);
          }

          return {
            ...prev,
            players: updatedPlayers,
            dice: finalDice,
            isRolling: false,
            winner,
            currentPlayer: nextPlayer,
            logs: [logMsg, ...prev.logs.slice(0, 4)],
          };
        });
      }
    }, 50);
  }, [state.isRolling, state.isMoving, state.winner, mode, stake, addCoins]);

  const triggerAITurn = (playersList: typeof state.players, aiIdx: number) => {
    const aiDice = Math.floor(Math.random() * 6) + 1;
    const aiPlayer = playersList[aiIdx];

    let targetPos = aiPlayer.position + aiDice;
    if (targetPos > 100) targetPos = aiPlayer.position;

    let logMsg = `🤖 Bot rolled ${aiDice} → cell ${targetPos}.`;
    if (snakeMap.has(targetPos)) {
      logMsg = `🐍 Bot bit by snake! Slid to ${snakeMap.get(targetPos)}.`;
      targetPos = snakeMap.get(targetPos)!;
    } else if (ladderMap.has(targetPos)) {
      logMsg = `🪜 Bot climbed ladder to ${ladderMap.get(targetPos)}!`;
      targetPos = ladderMap.get(targetPos)!;
    }

    setState((prev) => {
      const updatedPlayers: [typeof aiPlayer, typeof aiPlayer] = [
        aiIdx === 0 ? { ...aiPlayer, position: targetPos } : prev.players[0],
        aiIdx === 1 ? { ...aiPlayer, position: targetPos } : prev.players[1],
      ];

      const isWin = targetPos === 100;
      const winner = isWin ? aiIdx : undefined;
      const nextPlayer = isWin ? aiIdx : (aiIdx + 1) % 2;

      return {
        ...prev,
        players: updatedPlayers,
        dice: aiDice,
        winner,
        currentPlayer: nextPlayer,
        logs: [logMsg, ...prev.logs.slice(0, 4)],
      };
    });
  };

  const restartGame = useCallback(() => {
    setState({
      currentPlayer: 0,
      dice: 1,
      isRolling: false,
      isMoving: false,
      winner: undefined,
      players: [
        { id: 1, name: "Player 1 (You)", avatar: "🔴", color: "#ef4444", position: 1, isAI: false },
        { id: 2, name: mode === "ai" ? "Bot Opponent" : "Player 2", avatar: "🟢", color: "#10b981", position: 1, isAI: mode === "ai" },
      ],
      logs: ["Game restarted!"],
    });
  }, [mode]);

  return { state, rollDice, restartGame };
};
