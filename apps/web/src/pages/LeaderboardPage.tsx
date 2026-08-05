import { Link } from "react-router-dom";

export default function LeaderboardPage() {
  return (
    <div className="p-10 max-w-4xl mx-auto space-y-4">
      <h1 className="text-3xl font-bold">Leaderboard</h1>
      <p className="text-slate-400">Global Champions Hall of Fame.</p>
      <Link to="/" className="inline-block bg-blue-600 px-4 py-2 rounded-lg font-bold text-xs">
        ← Back to Gaming Hub
      </Link>
    </div>
  );
}
