const fs = require("fs");
const path = require("path");

const lobbySrc = path.join(process.cwd(), "apps/web/src/pages/Lobby/LobbyPage.tsx");

async function fixLobby() {
  const original = await fs.promises.readFile(lobbySrc, "utf8");

  // Prepare imports addition
  const additions = `import {
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

  const importMatch = /import { GAME_BY_ID, type GameId, type RoomFull } from "@gaming-hub\/shared";/;

  if (!importMatch.test(original)) {
    console.error("Could not find the import line to replace");
    process.exit(1);
  }

  // Insert after imports
  let result = original.replace(
    importMatch[0],
    additions + "\n"
  );

  // Add state changes after the useState lines (after line 62)
  const stateMatch = /const \[waitElapsed, setWaitElapsed\] = useState\(0\);/;
  const stateChanges = `\n  const isChess = def?.id === "chess";
  const [settings, setSettings] = useState({
    timeControl: isChess ? DEFAULT_TIME_CONTROL : null,
    rated: true,
  });

  // Reset chess settings when navigating between game lobbies.
  useEffect(() => {
    setSettings({ timeControl: isChess ? DEFAULT_TIME_CONTROL : null, rated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);`;

  result = result.replace(stateMatch, stateChanges + "\n");

  // Replace handle methods to pass settings
  result = result.replace(
    /await createRoom\(def\.id, true, stake, def\.maxPlayers\);/,
    "await createRoom(def.id, true, stake, def.maxPlayers, settings);"
  );
  result = result.replace(
    /await joinMatchmaking\(def\.id, stake\)/,
    "await joinMatchmaking(def.id, stake, settings);"
  );

  // Fix the queue status line (corrupted Unicode characters)
  // Line with: Matchmaking for {def.name} • 🪙 {matchmaking.stake ?? stake} stake
  // Replace with clean version
  const queueLineStart = "<p className=\"text-xs text-slate-500 dark:text-slate-400 mt-1\">";
  const queueLineEnd = "</p>";
  const queueLineMiddle = `Matchmaking for ${def.name} • 🪙 {matchmaking.stake ?? stake} stake`;

  result = result.replace(
    /Matchmaking for \{def\.name\}.*\n<\/p>/s,
    `${queueLineStart}${queueLineMiddle}${queueLineEnd}`
  );

  // Add time control selector UI after the stake panel (after the prize pool/p)
  // Find the location: after the Stake panel div (limited characters shown in error)
  // We'll insert it before the grid-cols-2 Quick Match/Private section
  const beforeQuickMatch = /<\/div>\n\n            <div className="grid grid-cols-2 gap-4">/;
  const timeControlUi = `
    {/* Chess time control selector */}
    {isChess && (
      <div className="mt-4 space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Time Control
        </h4>
        <div className="grid grid-cols-3 gap-2 flex flex-wrap">
          {CHESS_TIME_CONTROLS.map((tc) => (
            <button
              key={tc.label}
              onClick={() => setSettings({ ...settings, timeControl: tc })}
              className={settings.timeControl?.label === tc.label ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"}
            >
              {tc.label}
            </button>
          ))}
          <button
            onClick={() => setSettings({ ...settings, timeControl: UNLIMITED_TIME_CONTROL })}
            className={settings.timeControl === UNLIMITED_TIME_CONTROL ? "bg-indigo-600 text-white border-indigo-500" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300"}
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
            Rated (moves affect rating)
          </label>
        </div>
      </div>
    )}`;

  result = result.replace(
    beforeQuickMatch,
    `\n            ${timeControlUi}\n`
  );

  await fs.promises.writeFile(lobbySrc, result, "utf8");
  console.log("LobbyPage.tsx fixed successfully");
}

fixLobby().catch((err) => {
  console.error("Failed to fix LobbyPage.tsx:", err);
  process.exit(1);
});
