import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Check,
  Crown,
  Eye,
  Globe,
  Lock,
  Star,
  Swords,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
  Shield,
  Activity,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import type { RoomFull, RoomPlayer, PublicProfile } from "@gaming-hub/shared";
import { GAME_BY_ID } from "@gaming-hub/shared";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import { useAuthStore } from "../../../store/authStore";
import { usePublicProfile } from "../../../services/api/usePublicProfile";
import { useMe } from "../../../services/api/useMe";

// ─── helpers ───────────────────────────────────────────────────────────────

/** Convert ISO 3166-1 alpha-2 code → emoji flag */
function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🌍";
  const offset = 0x1f1e6 - 0x41;
  const chars = code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(c.codePointAt(0)! + offset));
  return chars.join("");
}

/** XP needed to reach the next level (simple quadratic curve) */
function xpForNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** Win-rate percentage */
function winRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

/** Format elapsed seconds as mm:ss */
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Estimate ping category from connection events */
function pingLabel(status: RoomPlayer["connectionStatus"]): {
  text: string;
  color: string;
} {
  switch (status) {
    case "connected":
      return { text: "Good", color: "text-emerald-400" };
    case "reconnecting":
      return { text: "High", color: "text-amber-400" };
    case "disconnected":
      return { text: "Lost", color: "text-rose-400" };
  }
}

// ─── sub-components ────────────────────────────────────────────────────────

interface XpBarProps {
  xp: number;
  level: number;
}

function XpBar({ xp, level }: XpBarProps) {
  const needed = xpForNextLevel(level);
  const pct = Math.min(100, Math.round((xp / needed) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-0.5">
        <span>XP</span>
        <span>
          {xp.toLocaleString()} / {needed.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface ProfileCardProps {
  roomPlayer: RoomPlayer;
  publicProfile: PublicProfile | null;
  isMe: boolean;
  seatColor: { ring: string; glow: string; badge: string };
}

function ProfileCard({
  roomPlayer,
  publicProfile,
  isMe,
  seatColor,
}: ProfileCardProps) {
  const wins = publicProfile?.wins ?? 0;
  const losses = publicProfile?.losses ?? 0;
  const draws = publicProfile?.draws ?? 0;
  const totalMatches = wins + losses + draws;
  const wr = winRate(wins, totalMatches);
  const level = publicProfile?.level ?? 1;
  const xp = publicProfile?.xp ?? 0;
  const country = publicProfile?.country ?? null;
  const ping = pingLabel(roomPlayer.connectionStatus);
  const isVerified = level >= 10;

  return (
    <div
      className={`relative rounded-2xl p-3 border transition-all duration-300 ${
        isMe
          ? `bg-gradient-to-br from-indigo-950/60 to-slate-900/80 ${seatColor.ring} shadow-lg ${seatColor.glow}`
          : "bg-slate-900/60 border-slate-700/50"
      }`}
    >
      {/* Top row: avatar + name block */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className={`w-12 h-12 rounded-xl overflow-hidden border-2 ${seatColor.ring} flex items-center justify-center bg-slate-800 text-xl font-black text-white`}
          >
            {roomPlayer.avatarUrl ? (
              <img
                src={roomPlayer.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              (roomPlayer.displayName || roomPlayer.username || "?")
                .slice(0, 1)
                .toUpperCase()
            )}
          </div>
          {/* Online dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
              roomPlayer.connectionStatus === "connected"
                ? "bg-emerald-400 animate-pulse"
                : roomPlayer.connectionStatus === "reconnecting"
                ? "bg-amber-400 animate-pulse"
                : "bg-slate-500"
            }`}
          />
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-white truncate">
              {roomPlayer.displayName || roomPlayer.username}
            </p>
            {isMe && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-bold uppercase tracking-wide">
                You
              </span>
            )}
            {roomPlayer.isHost && (
              <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            )}
            {isVerified && (
              <span title="Verified" className="flex items-center">
                <Shield className="w-3 h-3 text-sky-400 flex-shrink-0" />
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            @{roomPlayer.username} {countryFlag(country)}
          </p>

          {/* Level + Rating row */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${seatColor.badge}`}
            >
              Lv {level}
            </span>
            {publicProfile && (
              <span className="text-[9px] text-amber-400 font-bold flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" />
                {wr}% WR
              </span>
            )}
          </div>
        </div>

        {/* Ping / ready status */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {roomPlayer.connectionStatus === "connected" ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span className={`text-[9px] font-bold ${ping.color}`}>
            {ping.text}
          </span>
          {roomPlayer.isReady ? (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
              Ready
            </span>
          ) : (
            <span className="text-[8px] text-slate-500">Not ready</span>
          )}
        </div>
      </div>

      {/* XP bar */}
      <div className="mt-2.5">
        <XpBar xp={xp} level={level} />
      </div>

      {/* Stats row */}
      {publicProfile && (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-slate-800/60 py-1.5 px-1">
            <p className="text-[9px] text-slate-500 font-semibold">Wins</p>
            <p className="text-[11px] font-black text-emerald-400">{wins}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 py-1.5 px-1">
            <p className="text-[9px] text-slate-500 font-semibold">Matches</p>
            <p className="text-[11px] font-black text-slate-200">
              {totalMatches}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/60 py-1.5 px-1">
            <p className="text-[9px] text-slate-500 font-semibold">XP</p>
            <p className="text-[11px] font-black text-violet-400">
              {xp >= 1000 ? `${(xp / 1000).toFixed(1)}k` : xp}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── seat colours ──────────────────────────────────────────────────────────

const SEAT_COLORS = [
  {
    ring: "border-rose-500",
    glow: "shadow-rose-500/20",
    badge: "bg-rose-500/20 text-rose-300",
  },
  {
    ring: "border-emerald-500",
    glow: "shadow-emerald-500/20",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
  {
    ring: "border-sky-500",
    glow: "shadow-sky-500/20",
    badge: "bg-sky-500/20 text-sky-300",
  },
  {
    ring: "border-amber-500",
    glow: "shadow-amber-500/20",
    badge: "bg-amber-500/20 text-amber-300",
  },
];

// ─── main panel ────────────────────────────────────────────────────────────

interface MultiplayerMatchPanelProps {
  /** Compact variant for in-game sidebar (hides some stats) */
  compact?: boolean;
}

/**
 * Shared multiplayer match panel shown in the pre-game lobby and during play.
 * Reads room + game state from the multiplayer Zustand store.
 */
export function MultiplayerMatchPanel({
  compact = false,
}: MultiplayerMatchPanelProps) {
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { me } = useMe();

  // Match timer
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!room) return;
    startRef.current = room.createdAt
      ? new Date(room.createdAt).getTime()
      : Date.now();
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [room?.id]);

  // Copied state
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      toast.success(`Room code ${room.code} copied!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!room) return null;

  const participants = room.players.slice().sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const spectators = room.spectators;
  const gameDef = GAME_BY_ID.get(room.gameId);

  return (
    <div className="w-72 flex flex-col gap-3 text-xs select-none">
      {/* ── Game Info Card ───────────────────────────────────── */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-3.5 space-y-2.5">
        {/* Game name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{gameDef?.icon ?? "🎮"}</span>
            <div>
              <p className="font-black text-white text-sm leading-none">
                {gameDef?.name ?? room.gameId}
              </p>
              <p className="text-[9px] text-slate-500 capitalize mt-0.5">
                {gameDef?.mode?.replace("-", " ") ?? "Game"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${
                room.isPrivate
                  ? "bg-slate-700/60 text-slate-300 border-slate-600"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {room.isPrivate ? (
                <span className="flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Private
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Globe className="w-2.5 h-2.5" /> Public
                </span>
              )}
            </span>
            <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border bg-violet-500/10 text-violet-400 border-violet-500/20">
              {(room.settings as Record<string, unknown>)?.rated !== false
                ? "Ranked"
                : "Casual"}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Room Code */}
          <button
            onClick={() => void copyCode()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-2 py-1.5 hover:bg-slate-700 transition-colors group"
            title="Copy room code"
          >
            <span className="text-[9px] text-slate-500">Code</span>
            <span className="font-mono font-black text-indigo-300 text-[10px] tracking-widest">
              {room.code}
            </span>
            {copied ? (
              <Check className="w-2.5 h-2.5 text-emerald-400 ml-auto" />
            ) : (
              <Copy className="w-2.5 h-2.5 text-slate-500 ml-auto group-hover:text-indigo-400" />
            )}
          </button>

          {/* Match Timer */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-2 py-1.5">
            <Timer className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-slate-500">Time</span>
            <span className="font-mono font-black text-amber-300 text-[10px] ml-auto">
              {formatElapsed(elapsed)}
            </span>
          </div>

          {/* Players */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-2 py-1.5">
            <Users className="w-3 h-3 text-sky-400" />
            <span className="text-[9px] text-slate-500">Players</span>
            <span className="font-black text-sky-300 text-[10px] ml-auto">
              {participants.length}/{room.maxPlayers}
            </span>
          </div>

          {/* Spectators */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-2 py-1.5">
            <Eye className="w-3 h-3 text-slate-400" />
            <span className="text-[9px] text-slate-500">Spectators</span>
            <span className="font-black text-slate-300 text-[10px] ml-auto">
              {spectators.length}
            </span>
          </div>
        </div>

        {/* Stake */}
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-900/20 to-amber-800/10 border border-amber-700/20 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] text-slate-400">Entry / Prize</span>
          </div>
          <span className="font-black text-amber-400 text-xs">
            🪙 {room.stake} → {Math.round(room.stake * 1.8)}
          </span>
        </div>

        {/* Match ID */}
        {!compact && (
          <p className="text-[8px] text-slate-600 font-mono truncate">
            Match #{room.id.slice(0, 12)}…
          </p>
        )}
      </div>

      {/* ── VS Separator ─────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-slate-700" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700">
          <Swords className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider">
            VS
          </span>
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-slate-700" />
      </div>

      {/* ── Player Cards ─────────────────────────────────────── */}
      <div className="space-y-2">
        {participants.map((player, idx) => {
          const isMe = player.id === userId;
          const seatColor = SEAT_COLORS[idx % SEAT_COLORS.length];
          return (
            <PlayerProfileCardFetcher
              key={player.id}
              roomPlayer={player}
              isMe={isMe}
              seatColor={seatColor}
              meProfile={isMe && me ? {
                wins: me.profile?.wins ?? 0,
                losses: me.profile?.losses ?? 0,
                draws: me.profile?.draws ?? 0,
                xp: me.profile?.xp ?? 0,
                level: me.profile?.level ?? 1,
                country: me.profile?.country ?? null,
                userId: me.user.id,
                bio: null,
                coins: 0,
                gems: 0,
                isOnline: true,
                lastSeenAt: null,
                username: me.user.username,
                displayName: me.user.displayName,
                avatarUrl: me.user.avatarUrl ?? null,
              } as PublicProfile : null}
            />
          );
        })}
      </div>

      {/* Spectator chip */}
      {isSpectator && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-[10px] text-slate-400">
          <Eye className="w-3.5 h-3.5" />
          You are spectating this match
        </div>
      )}

      {/* TrendingUp  strip */}
      {!compact && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[9px] text-slate-500">
          <TrendingUp className="w-3 h-3 text-indigo-400" />
          Win to earn{" "}
          <span className="text-amber-400 font-bold">
            🪙 {Math.round(room.stake * 1.8)}
          </span>{" "}
          &amp; XP
        </div>
      )}
    </div>
  );
}

// ─── helper: fetches profile for non-me players ────────────────────────────

interface PlayerProfileCardFetcherProps {
  roomPlayer: RoomPlayer;
  isMe: boolean;
  seatColor: (typeof SEAT_COLORS)[0];
  meProfile: PublicProfile | null;
}

function PlayerProfileCardFetcher({
  roomPlayer,
  isMe,
  seatColor,
  meProfile,
}: PlayerProfileCardFetcherProps) {
  // For "me" we already have the data from useMe(); skip API fetch
  const { profile: fetchedProfile } = usePublicProfile(isMe ? null : roomPlayer.id);
  const profile = isMe ? meProfile : fetchedProfile;

  return (
    <ProfileCard
      roomPlayer={roomPlayer}
      publicProfile={profile}
      isMe={isMe}
      seatColor={seatColor}
    />
  );
}
