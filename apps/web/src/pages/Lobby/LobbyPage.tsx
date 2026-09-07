import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Loader2,
  LogIn,
  LogOut,
  Play,
  Shield,
  Star,
  Swords,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  CHESS_GAME_MODES,
  chessModeId,
  DEFAULT_TIME_CONTROL,
  GAME_BY_ID,
  type GameId,
  type MatchSettings,
  type RoomFull,
  type PublicProfile,
} from "@gaming-hub/shared";
import { getAuthRedirectUrl } from "../../lib/authUtils";
import { getAuthErrorMessage, logAuthError } from "../../lib/authErrors";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useMe } from "../../services/api/useMe";
import { usePublicProfile } from "../../services/api/usePublicProfile";
import { RoomChat } from "./RoomChat";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";

const SEAT_COLORS = [
  { ring: "border-rose-500", text: "text-rose-400", bg: "bg-rose-500", glow: "shadow-rose-500/20", badge: "bg-rose-500/20 text-rose-300" },
  { ring: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500", glow: "shadow-emerald-500/20", badge: "bg-emerald-500/20 text-emerald-300" },
  { ring: "border-sky-500", text: "text-sky-400", bg: "bg-sky-500", glow: "shadow-sky-500/20", badge: "bg-sky-500/20 text-sky-300" },
  { ring: "border-amber-500", text: "text-amber-400", bg: "bg-amber-500", glow: "shadow-amber-500/20", badge: "bg-amber-500/20 text-amber-300" },
];

function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const offset = 0x1f1e6 - 0x41;
  return code.toUpperCase().split("").map(c => String.fromCodePoint(c.codePointAt(0)! + offset)).join("");
}

function xpForNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.5));
}

function winRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

function connectionLabel(status: RoomFull["players"][number]["connectionStatus"]) {
  switch (status) {
    case "connected":
      return { label: "Online", dot: "bg-emerald-500" };
    case "reconnecting":
      return { label: "Reconnecting…", dot: "bg-amber-500" };
    case "disconnected":
      return { label: "Offline", dot: "bg-rose-500" };
    case "forfeited":
      return { label: "Forfeited", dot: "bg-rose-600" };
    default:
      return { label: "Offline", dot: "bg-slate-500" };
  }
}

// ─── Premium Player Card ──────────────────────────────────────────────────

interface LobbyPlayerCardProps {
  player: RoomFull["players"][number];
  isMe: boolean;
  userId: string | null;
  index: number;
  meProfile: PublicProfile | null;
}

function LobbyPlayerCard({ player, isMe, index, meProfile }: LobbyPlayerCardProps) {
  const color = SEAT_COLORS[index % SEAT_COLORS.length];
  const conn = connectionLabel(player.connectionStatus);

  // Fetch profile for opponents; use meProfile for self
  const { profile: fetchedProfile } = usePublicProfile(isMe ? null : player.id);
  const profile = isMe ? meProfile : fetchedProfile;

  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;
  const total = wins + losses + draws;
  const wr = winRate(wins, total);
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const country = profile?.country ?? null;
  const needed = xpForNextLevel(level);
  const xpPct = Math.min(100, Math.round((xp / needed) * 100));
  const isVerified = level >= 10;

  return (
    <div
      className={`relative flex flex-col gap-2.5 p-3.5 rounded-2xl border-2 transition-all duration-300 ${
        player.isReady
          ? `${color.ring} bg-slate-800/80 shadow-md ${color.glow}`
          : "border-slate-700 bg-slate-800/50"
      }`}
    >
      {/* Ready glow ring */}
      {player.isReady && (
        <div className={`absolute inset-0 rounded-2xl opacity-10 ${color.bg} pointer-events-none`} />
      )}

      {/* Top row */}
      <div className="flex items-start gap-3 relative">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-xl border-2 ${color.ring} overflow-hidden bg-slate-700 flex items-center justify-center text-xl font-black text-white`}>
            {player.avatarUrl
              ? <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
              : (player.displayName || player.username || "?").slice(0, 1).toUpperCase()
            }
          </div>
          {/* Online dot */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${conn.dot} ${
            player.connectionStatus !== "disconnected" ? "animate-pulse" : ""
          }`} />
        </div>

        {/* Name block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-white truncate">
              {player.displayName || player.username}
            </p>
            {isMe && (
              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold uppercase">you</span>
            )}
            {player.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
            {isVerified && (
              <span title="Verified" className="flex items-center">
                <Shield className="w-3 h-3 text-sky-400 flex-shrink-0" />
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            @{player.username} {countryFlag(country)}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${color.badge}`}>
              Lv {level}
            </span>
            {profile && (
              <span className="text-[9px] text-amber-400 font-bold flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" />{wr}% WR
              </span>
            )}
          </div>
        </div>

        {/* Right: ready + ping */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {player.connectionStatus === "connected"
            ? <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            : <WifiOff className="w-3.5 h-3.5 text-rose-400" />
          }
          <span className={`text-[9px] font-bold ${
            player.connectionStatus === "connected" ? "text-emerald-400" : player.connectionStatus === "reconnecting" ? "text-amber-400" : "text-rose-400"
          }`}>
            {player.connectionStatus === "connected" ? "Good" : player.connectionStatus === "reconnecting" ? "High" : "Lost"}
          </span>
          {player.isReady
            ? <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">Ready ✓</span>
            : <span className="text-[8px] text-slate-500">Not ready</span>
          }
        </div>
      </div>

      {/* XP bar */}
      <div>
        <div className="flex justify-between text-[8px] font-bold text-slate-600 mb-0.5">
          <span>XP</span>
          <span>{xp.toLocaleString()} / {needed.toLocaleString()}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-700"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>

      {/* Mini stats row */}
      {profile && (
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="rounded-lg bg-slate-900/60 py-1">
            <p className="text-[8px] text-slate-500">Wins</p>
            <p className="text-[10px] font-black text-emerald-400">{wins}</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 py-1">
            <p className="text-[8px] text-slate-500">Games</p>
            <p className="text-[10px] font-black text-slate-200">{total}</p>
          </div>
          <div className="rounded-lg bg-slate-900/60 py-1">
            <p className="text-[8px] text-slate-500">XP</p>
            <p className="text-[10px] font-black text-violet-400">{xp >= 1000 ? `${(xp / 1000).toFixed(1)}k` : xp}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export const LobbyPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const def = slug ? GAME_BY_ID.get(slug as GameId) : undefined;
  const state = location.state as { stake?: number } | null;
  const [stake, setStake] = useState(state?.stake ?? def?.defaultStake ?? 100);
  const [joinCode, setJoinCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const session = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { me } = useMe();
  const siteSettings = useSettingsStore((s) => s.settings);
  const matchmakingTimeout = siteSettings?.game?.matchmakingTimeoutSeconds ?? 120;
  const [waitElapsed, setWaitElapsed] = useState(0);
  
  const isChess = def?.id === "chess";
  const allowsPlayerCountChoice = false;
  const [playerCount, setPlayerCount] = useState<2 | 4>(2);
  const [settings, setSettings] = useState<MatchSettings>({
    timeControl: isChess ? DEFAULT_TIME_CONTROL : null,
    rated: true,
  });

  useEffect(() => {
    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });
    setPlayerCount(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const socketStatus = useMultiplayerStore((s) => s.status);
  const socketError = useMultiplayerStore((s) => s.error);
  const connect = useMultiplayerStore((s) => s.connect);
  const disconnect = useMultiplayerStore((s) => s.disconnect);
  const room = useMultiplayerStore((s) => s.room);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const matchmaking = useMultiplayerStore((s) => s.matchmaking);
  const messages = useMultiplayerStore((s) => s.messages);
  const emojis = useMultiplayerStore((s) => s.emojis);
  const createRoom = useMultiplayerStore((s) => s.createRoom);
  const joinRoom = useMultiplayerStore((s) => s.joinRoom);
  const leaveRoom = useMultiplayerStore((s) => s.leaveRoom);
  const setReady = useMultiplayerStore((s) => s.setReady);
  const startGame = useMultiplayerStore((s) => s.startGame);
  const countdown = useMultiplayerStore((s) => s.countdown);
  const joinMatchmaking = useMultiplayerStore((s) => s.joinMatchmaking);
  const leaveMatchmaking = useMultiplayerStore((s) => s.leaveMatchmaking);
  const sendMessage = useMultiplayerStore((s) => s.sendMessage);
  const sendEmoji = useMultiplayerStore((s) => s.sendEmoji);
  const clearError = useMultiplayerStore((s) => s.clearError);

  useEffect(() => {
    clearError();
  }, [slug, clearError]);

  useEffect(() => {
    if (session) connect();
    else disconnect();
  }, [session, connect, disconnect]);

  useEffect(() => {
    if (room && slug && room.gameId === slug) {
      if (room.status === "playing" || room.matchId) {
        if (matchmaking.queued) {
          useMultiplayerStore.setState({
            matchmaking: { queued: false, position: 0, gameId: null, stake: null, settings: {} },
            pendingRequeue: null,
          });
        }
        navigate(`/games/${slug}`, { state: { mode: "multiplayer", stake: room.stake } });
      }
    }
  }, [room, slug, matchmaking.queued, navigate]);

  // Client-side queue timeout: gives feedback even if the server eviction
  // event is missed (e.g. while disconnected).
  useEffect(() => {
    if (!matchmaking.queued) {
      setWaitElapsed(0);
      return;
    }
    const interval = setInterval(() => setWaitElapsed((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [matchmaking.queued]);

  useEffect(() => {
    if (matchmaking.queued && waitElapsed >= matchmakingTimeout) {
      setWaitElapsed(0);
      void leaveMatchmaking();
      toast.error("No opponents found in time — please try again");
    }
  }, [matchmaking.queued, waitElapsed, matchmakingTimeout, leaveMatchmaking]);

  const secondsRemaining = Math.max(0, matchmakingTimeout - waitElapsed);

  if (!def) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-slate-900 dark:text-white">Game not found</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const handleSignIn = async () => {
    const email = authEmail.trim();
    if (!email) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: getAuthRedirectUrl("/auth/callback") },
      });
      if (error) {
        logAuthError("LobbySignInWithOtp", error);
        toast.error(getAuthErrorMessage(error));
        return;
      }
      toast.success("Magic link sent — check your inbox");
    } catch (err) {
      logAuthError("LobbySignInWithOtp", err);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await useAuthStore.getState().signOut();
    disconnect();
    navigate("/");
  };

  const handleCreatePrivate = async () => {
    if (!def) return;
    try {
      await createRoom(def.id, true, stake, allowsPlayerCountChoice ? playerCount : def.maxPlayers, settings);
      toast.success("Private room created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create room");
    }
  };

  const handleQuickMatch = async () => {
    if (!def) return;
    try {
      await joinMatchmaking(def.id, stake, { ...settings, playerCount: allowsPlayerCountChoice ? playerCount : undefined } as Record<string, unknown>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join matchmaking");
    }
  };

  const handleJoinByCode = async (asSpectator: boolean) => {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      toast.error("Enter a room code");
      return;
    }
    try {
      await joinRoom({ code, asSpectator });
      setJoinCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join room");
    }
  };

  const handleLeave = async () => {
    await leaveRoom();
    navigate("/");
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      toast.success(`Room code ${room.code} copied`);
    } catch {
      toast.error("Could not copy the room code");
    }
  };

  const myPlayer = room?.players.find((p) => p.id === userId) ?? null;
  const meReady = myPlayer?.isReady ?? false;
  const isHost = myPlayer?.isHost ?? false;
  const participants = room?.players ?? [];
  const spectators = room?.spectators ?? [];
  const allReady = participants.length >= (def.minPlayers ?? 2) && participants.every((p) => p.isReady);
  const canStart = isHost && room?.status === "waiting" && allReady;
  const stakeTiers = [def.defaultStake, def.defaultStake * 2, def.defaultStake * 5, def.defaultStake * 10];
  const balance = me?.wallet?.balance;

  const statusChip = (() => {
    switch (socketStatus) {
      case "connected":
        return { icon: Wifi, text: "Connected", cls: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" };
      case "connecting":
        return { icon: Loader2, text: "Connecting…", cls: "text-amber-400 border-amber-500/40 bg-amber-500/10" };
      case "reconnecting":
        return { icon: Loader2, text: "Reconnecting…", cls: "text-amber-400 border-amber-500/40 bg-amber-500/10" };
      default:
        return { icon: WifiOff, text: "Offline", cls: "text-rose-400 border-rose-500/40 bg-rose-500/10" };
    }
  })();
  const StatusIcon = statusChip.icon;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors border border-slate-300 dark:border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>{def.icon}</span> {def.name}
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                Online Arena
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {def.category} • {def.minPlayers}-{def.maxPlayers} players • {def.mode.replace("-", " ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {session && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <span className="text-slate-500 dark:text-slate-400">Coins:</span>
              <span className="text-amber-400 font-extrabold">🪙 {balance ?? "…"}</span>
            </div>
          )}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${statusChip.cls}`}
          >
            <StatusIcon className={`w-3.5 h-3.5 ${socketStatus === "connecting" || socketStatus === "reconnecting" ? "animate-spin" : ""}`} />
            {statusChip.text}
          </div>
        </div>
      </div>

      {socketError && (
        <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-xs font-semibold text-rose-400">
          {socketError}
        </div>
      )}

      {!session && (
        <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4">
            <LogIn className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Sign in to play online</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            Multiplayer matches are tied to your account — enter your email and we'll send you a
            magic sign-in link.
          </p>
          <div className="flex items-center gap-2 mt-5 w-full max-w-sm">
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSignIn();
              }}
              placeholder="you@example.com"
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              onClick={() => void handleSignIn()}
              disabled={signingIn}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
            >
              {signingIn ? "Sending…" : "Send Link"}
            </button>
          </div>
        </div>
      )}

      {session && !room && !matchmaking.queued && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Join options */}
          <div className="space-y-4">
            <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-amber-400" /> Entry Stake
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {stakeTiers.map((val) => (
                  <button
                    key={val}
                    onClick={() => setStake(val)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      stake === val
                        ? "bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    🪙 {val}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Prize pool</span>
                <span className="text-amber-400 font-extrabold flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> {Math.round(stake * 1.8)}
                </span>
              </div>
              {balance != null && balance < stake && (
                <p className="mt-3 text-[11px] font-semibold text-rose-400">
                  Insufficient balance for this stake.
                </p>
              )}
            </div>

            {/* Chess game mode selector */}
            {isChess && (
              <div className="mt-4 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Game Mode
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {CHESS_GAME_MODES.map((mode) => {
                    const selected = chessModeId(settings.timeControl) === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setSettings({ ...settings, timeControl: mode.timeControl })}
                        className={`flex flex-col items-start gap-1 p-3 rounded-lg text-left border transition-all ${
                          selected
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                        }`}
                      >
                        <span className="text-xs font-black">{mode.label}</span>
                        <span className={`text-[9px] font-medium leading-tight ${selected ? "text-indigo-200" : "text-slate-500 dark:text-slate-400"}`}>
                          {mode.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <label className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={settings.rated !== false}
                      onChange={(e) => setSettings({ ...settings, rated: e.target.checked })}
                      className="w-3.5 h-3.5 accent-indigo-600"
                    />
                    Rated (affects rating)
                  </label>
                </div>
              </div>
            )}

            {/* Player count selector for Ludo and Snake & Ladder */}
            {allowsPlayerCountChoice && (
              <div className="mt-4 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Players
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {([2, 4] as const).map((count) => (
                    <button
                      key={count}
                      onClick={() => setPlayerCount(count)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                        playerCount === count
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      <span className="text-xs font-black">{count} Players</span>
                      <span className={`text-[9px] font-medium ${playerCount === count ? "text-indigo-200" : "text-slate-500 dark:text-slate-400"}`}>
                        {count === 2 ? "1 vs 1" : "4-way battle"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => void handleQuickMatch()}
                disabled={balance != null && balance < stake}
                className="flex flex-col items-center gap-2 p-5 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-700 hover:from-indigo-500 hover:to-purple-600 disabled:opacity-40 text-white border border-indigo-500/40 shadow-xl shadow-indigo-500/20 transition-all"
              >
                <Swords className="w-7 h-7" />
                <span className="text-sm font-black">Quick Match</span>
                <span className="text-[10px] text-indigo-200">Auto-join an open game</span>
              </button>
              <button
                onClick={() => void handleCreatePrivate()}
                className="flex flex-col items-center gap-2 p-5 rounded-3xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 transition-all"
              >
                <Users className="w-7 h-7 text-indigo-400" />
                <span className="text-sm font-black">Private Room</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Create and invite friends</span>
              </button>
            </div>
          </div>

          {/* Join by code */}
          <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">
              Join with a room code
            </h3>
            <div className="flex items-center gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleJoinByCode(false);
                }}
                placeholder="e.g. AB12CD"
                maxLength={8}
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono font-bold tracking-widest uppercase text-slate-800 dark:text-slate-200 placeholder-slate-400 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <button
                onClick={() => void handleJoinByCode(false)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
              >
                Join
              </button>
            </div>
            <button
              onClick={() => void handleJoinByCode(true)}
              className="mt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-400 transition-colors"
            >
              👁️ Join as spectator instead
            </button>
            {session && (
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="mt-6 flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            )}
          </div>
        </div>
      )}

      {session && matchmaking.queued && (
        <div className="relative overflow-hidden glass-panel dark:bg-transparent border border-slate-800 rounded-3xl p-10 flex flex-col items-center text-center">
          {/* Animated radar rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="absolute rounded-full border border-indigo-500/20"
                style={{
                  width: `${i * 80}px`,
                  height: `${i * 80}px`,
                  animation: `ping ${i * 0.8 + 0.8}s cubic-bezier(0,0,0.2,1) infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <div className="relative z-10 w-16 h-16 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/20">
            <Swords className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <h3 className="relative z-10 text-lg font-black text-slate-900 dark:text-white">Finding opponents…</h3>
          <p className="relative z-10 text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1">
            <span className="block">{def.name} · 🪙 {matchmaking.stake ?? stake} stake{matchmaking.settings?.playerCount ? ` · ${matchmaking.settings.playerCount} players` : ""}</span>
            {matchmaking.position > 0 && <span className="block">Queue position: #{matchmaking.position}</span>}
            {secondsRemaining > 0 && (
              <span className="block font-semibold text-amber-400">Auto-cancels in {secondsRemaining}s</span>
            )}
          </p>
          {/* Progress bar */}
          <div className="relative z-10 w-48 mt-4 h-1 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000"
              style={{ width: `${Math.min(100, (waitElapsed / matchmakingTimeout) * 100)}%` }}
            />
          </div>
          <button
            onClick={() => void leaveMatchmaking()}
            className="relative z-10 mt-6 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg"
          >
            Cancel Search
          </button>
        </div>
      )}

      {session && room && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Room panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Room Code
                  </p>
                  <button
                    onClick={() => void copyCode()}
                    className="mt-1 flex items-center gap-2 text-2xl font-black font-mono tracking-[0.3em] text-indigo-400 hover:text-indigo-300 transition-colors"
                    title="Copy room code"
                  >
                    {room.code} <Copy className="w-4 h-4 opacity-60" />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Stake / Prize
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-amber-400">
                    🪙 {room.stake} → {Math.round(room.stake * 1.8)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Players
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">
                    {participants.length}/{room.maxPlayers}
                  </p>
                </div>
              </div>

              {(countdown !== null || room.status === "starting") && (
                <div className="mt-4 p-4 rounded-2xl bg-indigo-950/90 border-2 border-indigo-500 shadow-xl shadow-indigo-500/30 flex flex-col items-center justify-center text-center animate-pulse">
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-300">
                    MATCH STARTING IN
                  </p>
                  <p className="text-5xl font-black text-amber-400 my-1">
                    {countdown === 0 ? "START!" : countdown ?? 3}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-300">
                    All players ready — initializing game engine...
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.map((player, index) => {
                  const isMe = player.id === userId;
                  const mePublicProfile: PublicProfile | null = isMe && me ? {
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
                  } : null;
                  return (
                    <LobbyPlayerCard
                      key={player.id}
                      player={player}
                      isMe={isMe}
                      userId={userId}
                      index={index}
                      meProfile={mePublicProfile}
                    />
                  );
                })}
                {Array.from({ length: Math.max(0, room.maxPlayers - participants.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/30"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-700/60 flex items-center justify-center text-xl">
                      +
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold">Waiting for player…</p>
                  </div>
                ))}
              </div>

              {spectators.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Spectators ({spectators.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {spectators.map((s) => (
                      <span
                        key={s.id}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                      >
                        👁️ {s.displayName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {!isSpectator && (
                  <button
                    onClick={() => void setReady(!meReady)}
                    disabled={room.status !== "waiting"}
                    className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                      meReady
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                        : "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white"
                    }`}
                  >
                    {meReady ? "✓ Ready" : "Not Ready — click when ready"}
                  </button>
                )}

                {isHost && (
                  <button
                    onClick={() => void startGame()}
                    disabled={!canStart}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black shadow-lg shadow-emerald-500/20 transition-all"
                    title={canStart ? "Start the match" : `Need ${def.minPlayers}+ ready players`}
                  >
                    <Play className="w-4 h-4" /> Start Match
                  </button>
                )}

                <button
                  onClick={() => void handleLeave()}
                  className="px-4 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600 hover:text-white text-rose-500 text-xs font-black border border-rose-500/40 transition-colors"
                >
                  Leave Room
                </button>

                {isSpectator && (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    You are spectating — you'll watch the match.
                  </span>
                )}
              </div>

              <p className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
                Share code <span className="font-mono font-bold text-indigo-400">{room.code}</span> with
                friends to invite them. The match starts automatically when everyone is ready and the
                host presses start.
              </p>
            </div>
          </div>

          {/* Chat */}
          <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-4 h-[420px] lg:h-auto">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Room Chat
            </p>
            <RoomChat
              messages={messages}
              emojis={emojis}
              myUserId={userId}
              onSend={sendMessage}
              onEmoji={sendEmoji}
            />
          </div>
        </div>
      )}

      {/* Logout Confirmation Safety Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Logout?"
        message="Are you sure you want to log out?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
        icon="logout"
        onConfirm={handleSignOut}
      />
    </div>
  );
};
