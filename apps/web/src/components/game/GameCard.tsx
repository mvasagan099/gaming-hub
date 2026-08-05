import { Link } from "react-router-dom";
import type { Game } from "../../types/game";

interface Props {
  game: Game;
}

export default function GameCard({ game }: Props) {
  return (
    <Link
      to={`/games/${game.slug}`}
      className="rounded-2xl bg-slate-800 p-5 transition hover:-translate-y-1 hover:bg-slate-700 flex flex-col justify-between border border-slate-700/50"
    >
      <div>
        {game.image ? (
          <img src={game.image} alt={game.name} className="w-full h-32 object-cover rounded-xl shadow-lg border border-slate-700" />
        ) : (
          <div className="text-5xl">{game.icon}</div>
        )}

        <h2 className="mt-4 text-xl font-bold">
          {game.name}
        </h2>

        <p className="mt-2 text-sm text-slate-300">
          {game.description}
        </p>
      </div>

      <div>
        <div className="mt-4 flex items-center justify-between">
          <span className="rounded bg-blue-600 px-2 py-1 text-xs font-bold">
            {game.category}
          </span>

          {game.multiplayer && (
            <span className="text-xs text-green-400 font-semibold">
              Multiplayer
            </span>
          )}
        </div>

        <button className="mt-6 w-full rounded-lg bg-indigo-600 py-2 font-semibold hover:bg-indigo-500 transition">
          Play
        </button>
      </div>
    </Link>
  );
}
