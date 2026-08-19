import { Trophy, Play } from 'lucide-react';
import type { TournamentBracket, TournamentPlayerStatus, TournamentBracketSlot } from '@gaming-hub/shared';
import { Badge } from '../ui/Badge';

interface Player {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seed: number | null;
  result: number | null;
}

interface Props {
  bracket: TournamentBracket;
  myStatus: TournamentPlayerStatus;
  players: Player[];
  onPlayMatch: (matchId: string) => void;
}

const ROUND_LABELS: Record<number, string> = {};

function getRoundLabel(roundNumber: number, totalRounds: number): string {
  if (ROUND_LABELS[roundNumber]) return ROUND_LABELS[roundNumber];
  const fromEnd = totalRounds - roundNumber;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return `Round ${roundNumber}`;
}

const SLOT_VARIANT: Record<string, 'success' | 'warning' | 'accent' | 'default' | 'outline'> = {
  COMPLETED: 'success',
  IN_PROGRESS: 'accent',
  READY: 'warning',
  PENDING: 'outline',
  BYE: 'default',
};

export function PlayerBracketView({ bracket, myStatus, players, onPlayMatch }: Props) {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  const myId = myStatus.seed != null ? players.find((p) => p.seed === myStatus.seed)?.userId : null;

  const getPlayer = (id: string | null) => {
    if (!id) return null;
    return playerMap.get(id) ?? { userId: id, username: id.slice(0, 8), displayName: id.slice(0, 8), avatarUrl: null, seed: null, result: null };
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:p-6">
      <div className="flex gap-6" style={{ minWidth: `${bracket.rounds.length * 220}px` }}>
        {bracket.rounds.map((round) => {
          const roundLabel = getRoundLabel(round.roundNumber, bracket.totalRounds);
          return (
            <div key={round.roundNumber} className="flex flex-col items-center gap-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {roundLabel}
              </div>
              {round.slots.map((slot) => (
                <BracketSlotCard
                  key={slot.id}
                  slot={slot}
                  playerA={getPlayer(slot.playerAId)}
                  playerB={getPlayer(slot.playerBId)}
                  winner={getPlayer(slot.winnerId)}
                  isMySlot={slot.playerAId === myId || slot.playerBId === myId}
                  isCurrentMatch={myStatus.currentMatchId === slot.matchId}
                  myStatus={myStatus}
                  onPlay={() => slot.matchId && onPlayMatch(slot.matchId)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketSlotCard({
  slot,
  playerA,
  playerB,
  winner,
  isMySlot,
  isCurrentMatch,
  myStatus,
  onPlay,
}: {
  slot: TournamentBracketSlot;
  playerA: { userId: string; username: string; displayName: string } | null;
  playerB: { userId: string; username: string; displayName: string } | null;
  winner: { userId: string; username: string; displayName: string } | null;
  isMySlot: boolean;
  isCurrentMatch: boolean;
  myStatus: TournamentPlayerStatus;
  onPlay: () => void;
}) {
  const isBye = slot.isBye;
  const isFinished = slot.status === 'COMPLETED';
  const isReady = slot.status === 'READY' || slot.status === 'IN_PROGRESS';

  return (
    <div
      className={`w-48 rounded-xl border p-2.5 transition-all ${
        isCurrentMatch
          ? 'border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/30 dark:bg-indigo-500/10'
          : isMySlot && isFinished
            ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/5'
            : isBye
              ? 'border-slate-200 bg-slate-50 opacity-50 dark:border-slate-800 dark:bg-slate-900/50'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
      }`}
    >
      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-medium text-slate-400">M{slot.matchNumber + 1}</span>
        <Badge variant={SLOT_VARIANT[slot.status] ?? 'outline'} className="text-[9px]">
          {slot.status === 'BYE' ? 'BYE' : slot.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {isBye ? (
        <div className="py-2 text-center text-[10px] italic text-slate-400">BYE</div>
      ) : (
        <div className="space-y-1">
          <PlayerRow player={playerA} score={slot.playerAScore} isWinner={winner?.userId === playerA?.userId} isMe={playerA?.userId === myStatus.seed} />
          <div className="text-center text-[9px] font-bold text-slate-300 dark:text-slate-600">vs</div>
          <PlayerRow player={playerB} score={slot.playerBScore} isWinner={winner?.userId === playerB?.userId} isMe={playerB?.userId === myStatus.seed} />
        </div>
      )}

      {/* Play button for current match */}
      {isCurrentMatch && isReady && slot.matchId && (
        <button
          onClick={onPlay}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-indigo-600"
        >
          <Play className="size-3" /> PLAY NOW
        </button>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  score,
  isWinner,
  isMe,
}: {
  player: { userId: string; username: string; displayName: string } | null;
  score: number;
  isWinner: boolean;
  isMe?: boolean;
}) {
  if (!player) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50">
        <span className="text-[10px] italic text-slate-400">TBD</span>
        <span className="text-[10px] tabular-nums text-slate-400">—</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
        isWinner
          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
          : isMe
            ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20'
            : 'bg-slate-50 dark:bg-slate-800/50'
      }`}
    >
      <span className={`flex items-center gap-1 truncate text-[10px] font-medium ${
        isWinner ? 'text-emerald-700 dark:text-emerald-400' :
        isMe ? 'text-indigo-700 dark:text-indigo-400' :
        'text-slate-700 dark:text-slate-300'
      }`}>
        {isMe && <span className="font-black">YOU</span>}
        {!isMe && <span className="truncate">{player.username}</span>}
        {isWinner && <Trophy className="size-3 shrink-0 text-emerald-500" />}
      </span>
      <span className={`text-[10px] tabular-nums font-bold ${
        isWinner ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
      }`}>
        {score}
      </span>
    </div>
  );
}
