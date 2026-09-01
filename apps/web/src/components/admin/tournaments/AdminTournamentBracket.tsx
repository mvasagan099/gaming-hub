import { useMemo } from 'react';
import type { AdminTournamentBracket } from '../../../services/api/enterprise';
import { Badge } from '../../ui/Badge';

interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
}

interface Props {
  bracket: AdminTournamentBracket;
  playerMap: Map<string, PlayerInfo>;
}

const SLOT_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default' | 'accent' | 'outline'> = {
  FINISHED: 'success',
  ACTIVE: 'accent',
  PENDING: 'outline',
  BYE: 'default',
};

export function AdminTournamentBracketView({ bracket, playerMap }: Props) {
  const totalRounds = bracket.totalRounds;
  const rounds = bracket.rounds;

  const getPlayer = (id: string | null) => {
    if (!id) return null;
    return playerMap.get(id) ?? { id, username: id.slice(0, 8), displayName: id.slice(0, 8) };
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-4 text-sm font-semibold text-slate-500">
        {bracket.format?.replace(/_/g, ' ')} Bracket — {totalRounds} Round{totalRounds !== 1 ? 's' : ''}
      </h3>

      <div className="flex gap-8">
        {rounds.map((round) => (
          <div key={round.roundNumber} className="flex flex-col items-center gap-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Round {round.roundNumber}
            </div>
            {round.slots.map((slot) => {
              const playerA = getPlayer(slot.playerAId);
              const playerB = getPlayer(slot.playerBId);
              const winner = getPlayer(slot.winnerId);
              const isFinished = slot.status === 'FINISHED';
              const isBye = slot.isBye;

              return (
                <div
                  key={slot.id}
                  className={`w-48 rounded-xl border p-3 transition-colors ${
                    isFinished
                      ? 'border-emerald-500/30 bg-emerald-500/5 dark:border-emerald-500/20 dark:bg-emerald-500/5'
                      : isBye
                        ? 'border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/50'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-slate-400">
                      M{slot.matchNumber}
                    </span>
                    <Badge variant={SLOT_STATUS_VARIANT[slot.status] ?? 'outline'} className="text-[10px]">
                      {slot.status}
                    </Badge>
                  </div>

                  {isBye ? (
                    <div className="py-2 text-center text-xs text-slate-400 italic">BYE</div>
                  ) : (
                    <div className="space-y-1">
                      <SlotPlayer
                        player={playerA}
                        score={slot.playerAScore}
                        isWinner={winner?.id === slot.playerAId}
                      />
                      <div className="text-center text-[10px] font-bold text-slate-300">vs</div>
                      <SlotPlayer
                        player={playerB}
                        score={slot.playerBScore}
                        isWinner={winner?.id === slot.playerBId}
                      />
                    </div>
                  )}

                  {slot.matchId && (
                    <div className="mt-2 text-[10px] text-slate-400 truncate">
                      Match: {slot.matchId.slice(0, 8)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {rounds.length === 0 && (
        <div className="py-12 text-center text-sm text-slate-400">
          No bracket slots generated yet
        </div>
      )}
    </div>
  );
}

function SlotPlayer({
  player,
  score,
  isWinner,
}: {
  player: PlayerInfo | null;
  score: number;
  isWinner: boolean;
}) {
  if (!player) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50">
        <span className="text-xs text-slate-400 italic">TBD</span>
        <span className="text-xs tabular-nums text-slate-400">—</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
        isWinner
          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30 dark:bg-emerald-500/10'
          : 'bg-slate-50 dark:bg-slate-800/50'
      }`}
    >
      <span className={`text-xs font-medium truncate ${isWinner ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {player.username}
      </span>
      <span className={`text-xs tabular-nums font-bold ${isWinner ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
        {score}
      </span>
    </div>
  );
}
