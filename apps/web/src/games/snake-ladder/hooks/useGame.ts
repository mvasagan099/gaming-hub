import { useState, useCallback } from 'react';
import type { GameState, PlayerState } from '../types/game';
import { DiceEngine } from '../engine/DiceEngine';
import { MovementEngine } from '../engine/MovementEngine';
import { WinEngine } from '../engine/WinEngine';
import confetti from 'canvas-confetti';
import { useUserStore } from '../../../store/useUserStore';

export const useGame = (mode: 'ai' | 'multiplayer', stake: number) => {
  const { addCoins } = useUserStore();

  const [gameState, setGameState] = useState<GameState>({
    players: [
      { id: 'player1', name: 'Player 1 (You)', avatar: '🔴', color: '#ef4444', position: 1, isAI: false },
      { id: 'player2', name: mode === 'ai' ? 'Bot Opponent' : 'Player 2', avatar: '🟢', color: '#10b981', position: 1, isAI: mode === 'ai' }
    ],
    currentTurnIndex: 0,
    diceValue: 1,
    isRolling: false,
    isMoving: false,
    winner: null,
    logs: ['Game started! Roll dice to move.']
  });

  const rollDice = useCallback(() => {
    if (gameState.isRolling || gameState.isMoving || gameState.winner) return;

    setGameState(prev => ({ ...prev, isRolling: true }));

    let count = 0;
    const interval = setInterval(() => {
      setGameState(prev => ({ ...prev, diceValue: DiceEngine.roll() }));
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalDice = DiceEngine.roll();

        setGameState(prev => {
          const currentPlayer = prev.players[prev.currentTurnIndex];
          const moveResult = MovementEngine.calculateMove(currentPlayer.position, finalDice);

          let logMsg = `${currentPlayer.name} rolled ${finalDice} → moved to ${moveResult.targetPos}.`;
          if (moveResult.isSnake) logMsg = `🐍 ${currentPlayer.name} got bit by a snake! Slid to ${moveResult.targetPos}.`;
          if (moveResult.isLadder) logMsg = `🪜 ${currentPlayer.name} climbed a ladder to ${moveResult.targetPos}!`;

          const updatedPlayers = prev.players.map((p, idx) =>
            idx === prev.currentTurnIndex ? { ...p, position: moveResult.targetPos } : p
          );

          const winner = WinEngine.checkWin(updatedPlayers[prev.currentTurnIndex])
            ? updatedPlayers[prev.currentTurnIndex]
            : null;

          if (winner) {
            addCoins(stake * 1.8);
            confetti();
          }

          const nextTurnIndex = winner ? prev.currentTurnIndex : (prev.currentTurnIndex + 1) % prev.players.length;

          // AI Turn trigger check
          if (!winner && mode === 'ai' && updatedPlayers[nextTurnIndex].isAI) {
            setTimeout(() => {
              triggerAITurn(updatedPlayers, nextTurnIndex);
            }, 900);
          }

          return {
            ...prev,
            players: updatedPlayers,
            diceValue: finalDice,
            isRolling: false,
            winner,
            currentTurnIndex: nextTurnIndex,
            logs: [logMsg, ...prev.logs.slice(0, 4)]
          };
        });
      }
    }, 50);
  }, [gameState.isRolling, gameState.isMoving, gameState.winner, mode, stake, addCoins]);

  const triggerAITurn = (playersList: PlayerState[], aiIdx: number) => {
    const aiDice = DiceEngine.roll();
    const aiPlayer = playersList[aiIdx];
    const moveResult = MovementEngine.calculateMove(aiPlayer.position, aiDice);

    let logMsg = `🤖 Bot rolled ${aiDice} → moved to ${moveResult.targetPos}.`;
    if (moveResult.isSnake) logMsg = `🐍 Bot got bit by a snake! Slid to ${moveResult.targetPos}.`;
    if (moveResult.isLadder) logMsg = `🪜 Bot climbed a ladder to ${moveResult.targetPos}!`;

    setGameState(prev => {
      const updatedPlayers = prev.players.map((p, idx) =>
        idx === aiIdx ? { ...p, position: moveResult.targetPos } : p
      );

      const winner = WinEngine.checkWin(updatedPlayers[aiIdx]) ? updatedPlayers[aiIdx] : null;
      const nextTurnIndex = winner ? aiIdx : (aiIdx + 1) % prev.players.length;

      return {
        ...prev,
        players: updatedPlayers,
        diceValue: aiDice,
        winner,
        currentTurnIndex: nextTurnIndex,
        logs: [logMsg, ...prev.logs.slice(0, 4)]
      };
    });
  };

  const restartGame = useCallback(() => {
    setGameState({
      players: [
        { id: 'player1', name: 'Player 1 (You)', avatar: '🔴', color: '#ef4444', position: 1, isAI: false },
        { id: 'player2', name: mode === 'ai' ? 'Bot Opponent' : 'Player 2', avatar: '🟢', color: '#10b981', position: 1, isAI: mode === 'ai' }
      ],
      currentTurnIndex: 0,
      diceValue: 1,
      isRolling: false,
      isMoving: false,
      winner: null,
      logs: ['Game restarted!']
    });
  }, [mode]);

  return { gameState, rollDice, restartGame };
};
