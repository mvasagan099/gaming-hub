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
  Swords,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  CHESS_TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  UNLIMITED_TIME_CONTROL,
  GAME_BY_ID,
  type GameId,
  type MatchSettings,
  type RoomFull,
} from "@gaming-hub/shared";
import { supabase } from "../../services/supabase";
import { useAuthStore } from "../../store/authStore";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useMe } from "../../services/api/useMe";
import { RoomChat } from "./RoomChat";

const SEAT_COLORS = [
  { ring: "border-rose-500", text: "text-rose-400", bg: "bg-rose-500" },
  { ring: "border-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500" },
  { ring: "border-sky-500", text: "text-sky-400", bg: "bg-sky-500" },
  { ring: "border-amber-500", text: "text-amber-400", bg: "bg-amber-500" },
];

function connectionLabel(status: RoomFull["players"][number]["connectionStatus"]) {
  switch (status) {
    case "connected":
      return { label: "Online", dot: "bg-emerald-500" };
    case "reconnecting":
      return { label: "Reconnecting…", dot: "bg-amber-500" };
    case "disconnected":
      return { label: "Offline", dot: "bg-rose-500" };
  }
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

  const session = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { me } = useMe();
  const siteSettings = useSettingsStore((s) => s.settings);
  const matchmakingTimeout = siteSettings?.game?.matchmakingTimeoutSeconds ?? 120;
  const [waitElapsed, setWaitElapsed] = useState(0);
  
  const isChess = def?.id === "chess";
  const [settings, setSettings] = useState<MatchSettings>({
    timeControl: isChess ? DEFAULT_TIME_CONTROL : null,
    rated: true,
  });

  useEffect(() => {
    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });
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
  const joinMatchmaking = useMultiplayerStore((s) => s.joinMatchmaking);
  const leaveMatchmaking = useMultiplayerStore((s) => s.leaveMatchmaking);
  const sendMessage = useMultiplayerStore((s) => s.sendMessage);
  const sendEmoji = useMultiplayerStore((s) => s.sendEmoji);

  useEffect(() => {
    if (session) connect();
    else disconnect();
  }, [session, connect, disconnect]);

  useEffect(() => {
    if (room && slug && room.gameId === slug && room.status === "playing" && room.matchId) {
      navigate(`/games/${slug}`, { state: { mode: "multiplayer", stake: room.stake } });
    }
  }, [room, slug, navigate]);

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
      toast.error("Enter your email to sign in");
      return;
    }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success("Magic link sent — check your inbox");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send sign-in link");
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
      await createRoom(def.id, true, stake, def.maxPlayers, settings);
      toast.success("Private room created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create room");
    }
  };

  const handleQuickMatch = async () => {
    if (!def) return;
    try {
      await joinMatchmaking(def.id, stake, settings);
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

            {/* Chess time control selector */}
            {isChess && (
              <div className="mt-4 space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Time Control
                </h4>
                <div className="grid grid-cols-4 gap-2 flex flex-wrap">
                  {CHESS_TIME_CONTROLS.map((tc) => (
                    <button
                      key={tc.label}
                      onClick={() => setSettings({ ...settings, timeControl: tc })}
                      className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        settings.timeControl?.label === tc.label
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                      }`}
                    >
                      {tc.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setSettings({ ...settings, timeControl: UNLIMITED_TIME_CONTROL })}
                    className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                      settings.timeControl === UNLIMITED_TIME_CONTROL
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                    }`}
                  >
                    ∞
                  </button>
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
                onClick={() => void handleSignOut()}
                className="mt-6 flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            )}
          </div>
        </div>
      )}

      {session && matchmaking.queued && (
        <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-500/15 flex items-center justify-center mb-4">
            <Swords className="w-7 h-7 text-indigo-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">Looking for opponents…</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Matchmaking for {def.name} • 🪙 {matchmaking.stake ?? stake} stake
            {matchmaking.position > 0 && ` • Queue position ${matchmaking.position}`}
            {secondsRemaining > 0 && ` • Auto-cancels in ${secondsRemaining}s`}
          </p>
          <button
            onClick={() => void leaveMatchmaking()}
            className="mt-5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
          >
            Cancel
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

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {participants.map((player, index) => {
                  const color = SEAT_COLORS[index % SEAT_COLORS.length];
                  const conn = connectionLabel(player.connectionStatus);
                  const isMe = player.id === userId;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${color.ring} bg-slate-100 dark:bg-slate-800/60`}
                    >
                      <div className={`w-8 h-8 rounded-full ${color.bg} flex items-center justify-center text-xs font-black text-white`}>
                        {player.seat != null ? player.seat + 1 : "–"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                          {player.displayName}
                          {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">you</span>}
                          {player.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} /> {conn.label}
                          {player.isReady ? (
                            <span className="ml-1 text-emerald-500 font-bold">• Ready</span>
                          ) : (
                            <span className="ml-1 text-slate-400">• Not ready</span>
                          )}
                        </p>
                      </div>
                      {player.isReady && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                  );
                })}
                {Array.from({ length: Math.max(0, room.maxPlayers - participants.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center text-xs font-black text-slate-500">
                      +
                    </div>
                    <p className="text-xs text-slate-400">Waiting for player…</p>
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
    </div>
  );
};
