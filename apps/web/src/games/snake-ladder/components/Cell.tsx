import type { CellData } from "../utils/board";
import { snakeMap } from "../data/snakes";
import { ladderMap } from "../data/ladders";

interface Props {
  cell: CellData;
}

export default function Cell({ cell }: Props) {
  const isSnakeHead = snakeMap.has(cell.number);
  const isLadderBase = ladderMap.has(cell.number);

  return (
    <div
      className="relative flex items-center justify-center border border-slate-700 bg-slate-800 text-white min-h-[40px] select-none hover:bg-slate-700/80 transition"
    >
      <span className="absolute left-1 top-1 text-xs text-slate-300">
        {cell.number}
      </span>

      {isSnakeHead && (
        <span className="text-xs drop-shadow" title={`Snake slides to ${snakeMap.get(cell.number)}`}>
          🐍
        </span>
      )}
      {isLadderBase && (
        <span className="text-xs drop-shadow" title={`Ladder climbs to ${ladderMap.get(cell.number)}`}>
          🪜
        </span>
      )}
    </div>
  );
}
