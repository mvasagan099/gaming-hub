import { promises as fs } from "fs";
import path from "path";

const lobbySrc = path.join(process.cwd(), "apps/web/src/pages/Lobby/LobbyPage.tsx");

async function fixLobby() {
  const original = await fs.readFile(lobbySrc, "utf8");

  const additions = `
import {
  CHESS_TIME_CONTROLS,
  DEFAULT_TIME_CONTROL,
  UNLIMITED_TIME_CONTROL,
  formatTimeControl,
  GAME_BY_ID,
  type ChessTimeControlPreset,
  type GameId,
  type MatchSettings,
  type RoomFull,
} from "@gaming-hub/shared";
`;

  const importsLineIndex = original.includes("from \"@gaming-hub/shared\";") ? original.indexOf("from \"@gaming-hub/shared\";") + 1 : -1;
  if (importsLineIndex < 0) {
    console.error("Could not find the import line to replace");
    process.exit(1);
  }

  const startLine = 53; // after const [state, setStake, setStateMatchmakingTimeout, setWaitElapsed]

  const stateChangesNative = `
  const isChess = def?.id === "chess";
  const [settings, setSettings] = useState<MatchSettings>({
    timeControl: isChess ? DEFAULT_TIME_CONTROL : null,
    rated: true,
  });

  // Reset chess settings when navigating between game lobbies.
  useEffect(() => {
    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });
  }, [slug]);`;

  const settingsState = `  const isChess = def?.id === "chess";
  const [settings, setSettings] = useState<MatchSettings>({
    timeControl: isChess ? DEFAULT_TIME_CONTROL : null,
    rated: true,
  });

  // Reset chess settings when navigating between game lobbies.
  useEffect(() => {
    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);`;

  const createButtonChangeNative = `
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
  };`;

  const queueStatusChangeNative = `
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Matchmaking for {def.name} • 🪙 {matchmaking.stake ?? stake} stake
            {isChess && matchmaking.settings.timeControl && \` • \${matchmaking.settings.timeControl.baseSeconds}+\${matchmaking.settings.timeControl.incrementSeconds}\`}
            {matchmaking.settings.rated === false && " • Casual"}
            {matchmaking.position > 0 && \` • Queue position \${matchmaking.position}\`}
            {secondsRemaining > 0 && \` • Auto-cancels in \${secondsRemaining}s\`}
          </p>`;

  // Time control selector UI after the prize pool line (after line 361, after insufficient balance warning)
  const timeControlUiNative = `
              {/* Chess time control selector */}
              {isChess && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Time Control
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {CHESS_TIME_CONTROLS.map((tc) => (
                      <button
                        key={tc.label}
                        onClick={() => setSettings({ ...settings, timeControl: tc as unknown as ChessTimeControlConfig })}
                        className={\`py-1.5 rounded-lg text-[10px] font-bold border transition-all $\{
                          settings.timeControl?.label === tc.label
                            ? "bg-indigo-600 text-white border-indigo-500"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                        }\`}
                      >
                        {tc.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setSettings({ ...settings, timeControl: UNLIMITED_TIME_CONTROL as unknown as ChessTimeControlConfig })}
                      className={\`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
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
`;

  // Helper function to remove the corrupted time-control display (lines 478-481)
  const corruptedTimeControlMatch = /Matchmaking for .• ({def\.name} • 🪙 .+? stake\n.*{isChess && matchmaking\.settings\.timeControl && \`• \${formatTimeControl(matchmaking\.settings\.timeControl)}\`}\n/;
  
  const cleanQueueStatus = `
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Matchmaking for {def.name} • 🪙 {matchmaking.stake ?? stake} stake
            {isChess && matchmaking.settings.timeControl && \` • ${matchmaking.settings.timeControl.baseSeconds}+${matchmaking.settings.timeControl.incrementSeconds}\`}
            {matchmaking.settings.rated === false && " • Casual"}
            {matchmaking.position > 0 && \` • Queue position \${matchmaking.position}\`}
            {secondsRemaining > 0 && \` • Auto-cancels in ${secondsRemaining}s\`}
          </p>`;

  // Apply
  let result = original;
  // Replace imports
  const importIndex = original.indexOf('import { GAME_BY_ID, type GameId, type RoomFull } from "@gaming-hub/shared";');
  if (importIndex >= 0) {
    result = original.slice(0, importIndex) + additions;
  }

  result = result.replace(
    /const \[stake, setStake, setJoinCode, setSigningIn, setAuthEmail\] = useState\(info\);/,
    (match) => `\t${match}`
  );
  
  // Add state changes
  result = result.replace(
    /const \[waitElapsed, setWaitElapsed\] = useState\(0\);/,
    (match) => `\tconst [waitElapsed, setWaitElapsed] = useState(0);\n  // Client-side queue timeout...` + match
  );

  // Append checkboxes and handlers before stakeTiers map render
  result = result.replace(
    /const \[stakeTiers = \[def\.defaultStake \* 2, def\.defaultStake \* 5, def\.defaultStake \* 10\];/,
    `$&  const isChess = def?.id === "chess";\n  const [settings, setSettings] = useState<MatchSettings>({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });\n\n  // Reset chess settings when navigating between game lobbies.\n  useEffect(() => {\n    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [slug]);\n`
  );

  // Fix the queue status line (corrupted encoding)
  result = result.replace(
    corruptedTimeControlMatch,
    cleanQueueStatus
  );

  // Add time control selector in the (currently after stake panel before Quick Match/Private Room cards)
  // Find the line after prize pool closing </p> at apprx line 360
  const afterPrizePool = /\+ {secondsRemaining > 0 && ` \• Auto-cancels in \${secondsRemaining}s\`}\n<\/p>\n    <\/div>\n    \s+<div className="grid grid-cols-2 gap-4">/;

  result = result.replace(
    afterPrizePool,
    `$&    ${timeControlUiNative}\n    </div>\n    \n    <div className="grid grid-cols-2 gap-4">`
  );

  // Fix createRoom/joinMatchmaking to pass settings
  result = result.replace(
    /await createRoom\(def\.id, true, stake, def\.maxPlayers\);/,
    (match) => `await createRoom(def.id, true, stake, def.maxPlayers, settings);`
  );
  result = result.replace(
    /await joinMatchmaking\(def\.id, stake\);/,
    (match) => `await joinMatchmaking(def.id, stake, settings);`
  );

  await fs.writeFile(lobbySrc, result, "utf8");
  console.log("LobbyPage.tsx fixed");
}

fixLobby().catch((err) => console.error("Failed to fix LobbyPage.tsx:", err));
