import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import GameCard from "../components/game/GameCard";
import { games } from "../data/games";
import { Gamepad2, Sparkles, Trophy, User, Search, Flame } from "lucide-react";
import { useUserStore } from "../store/useUserStore";

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const { username, avatar, coins, level } = useUserStore();

  const featuredGames = useMemo(() => games.filter(g => g.featured), []);

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const matchesSearch = game.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "All" || game.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, selectedCategory]);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-8">
      {/* Modern Gaming Navbar Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-wider text-white">
              GAMING<span className="text-indigo-400">HUB</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-700 text-xs font-extrabold text-amber-400">
            🪙 {coins.toLocaleString()} Coins
          </div>
          <Link to="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 hover:border-indigo-500 transition">
            <span className="text-lg">{avatar}</span>
            <div className="text-left">
              <p className="text-xs font-bold text-white leading-tight">{username}</p>
              <p className="text-[9px] text-indigo-300 font-semibold">Lvl {level}</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Featured Games Carousel Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 p-8 border border-indigo-500/20 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-3 z-10">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> FEATURED CHAMPIONSHIP
          </span>
          <h2 className="text-3xl lg:text-4xl font-black text-white leading-tight">
            Play 9 Iconic 2D Games. <br /> Win Daily Rewards.
          </h2>
          <p className="text-xs text-slate-300 max-w-md">
            Challenge players or test your skills vs AI in Snake & Ladder, Ludo, Chess & more.
          </p>
        </div>
        <Link
          to="/games/snake-ladder"
          className="z-10 py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/25 transition transform hover:scale-105"
        >
          PLAY SNAKE & LADDER NOW
        </Link>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
          {["All", "Board", "Arcade", "Sports"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search games..."
            className="w-full rounded-xl bg-slate-800 pl-10 pr-4 py-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
          />
        </div>
      </div>

      {/* Featured Games Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-white">
          <Flame className="w-5 h-5 text-rose-500" />
          <h3 className="text-xl font-black">Featured Titles</h3>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>

      {/* All Games Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-white">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="text-xl font-black">All Games ({filteredGames.length})</h3>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </div>
    </div>
  );
}
