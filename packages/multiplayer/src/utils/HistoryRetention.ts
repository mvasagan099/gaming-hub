import { addArchivedActions } from "./ArchivedActionFilter";
import type { MatchRuntime } from "../types";

export const LIVE_ACTION_HISTORY_LIMIT = 128;
export const LIVE_ACTION_HISTORY_TAIL = 64;
export const LOCAL_SNAPSHOT_LIMIT = 32;

/** Plan only; callers must durably archive the prefix before changing runtime. */
export function planHistoryRetention(match: Pick<MatchRuntime, "actionHistory" | "archivedThroughTurn" | "archivedActionFilter">) {
  const count = match.actionHistory.length > LIVE_ACTION_HISTORY_LIMIT
    ? match.actionHistory.length - LIVE_ACTION_HISTORY_TAIL : 0;
  const archive = match.actionHistory.slice(0, count);
  // Existing pruned checkpoints without a filter must keep DB lookup fallback:
  // building a suffix-only filter would incorrectly miss older receipts.
  const archivedActionFilter = (match.archivedThroughTurn ?? 0) > 0 && match.archivedActionFilter == null
    ? undefined : addArchivedActions(match.archivedActionFilter, archive);
  return { archive, retained: count ? match.actionHistory.slice(count) : match.actionHistory,
    archivedActionFilter,
    archivedThroughTurn: count ? match.actionHistory[count - 1].turnNumber : (match.archivedThroughTurn ?? 0) };
}
