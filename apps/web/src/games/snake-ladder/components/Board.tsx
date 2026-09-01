import Cell from "./Cell";
import { generateBoard } from "../utils/board";
import type { PlayerData } from "../types";

interface BoardProps {
  players?: PlayerData[];
  onCellClick?: (cellNumber: number) => void;
}

export default function Board({ players = [] }: BoardProps) {
  const board = generateBoard();

  return (
    <div className="grid grid-cols-10 aspect-square mx-auto max-w-full max-w-3xl h-auto max-h-[85vh] border-4 border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
      {board.map((cell) => (
        <Cell key={cell.number} cell={cell} />
      ))}
    </div>
  );
}
export { Board };
