import React, { useState, useEffect } from 'react';
import type { GameMetadata, GameId } from '../../types';
import { GameCard } from '../../components/GameCard';
import { MatchSetupModal } from '../../components/MatchSetupModal';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { CategoryCard } from '../../components/CategoryCard/CategoryCard';
import { GAMES_DATA } from '../../data/games';
import { Sparkles, Clock, Flame, Trophy, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const gamesList: GameMetadata[] = GAMES_DATA.map(g => ({
  id: g.id as GameId,
  title: g.name,
  category: g.category,
  description: g.description,
  players: `${g.players} Players`,
  minEntryFee: 100,
  rating: g.rating,
  thumbnailUrl: g.image,
  bgGradient: g.bgGradient,
  isHot: g.isFeatured
}));

const banners = [
  {
    id: 4,
    tagText: "PREMIUM GAMES",
    tagIcon: Sparkles,
    title: "Many New Games \n Available Now!",
    desc: "Discover a world of new entertainment. From action to strategy, there's a game for everyone.",
    btnText: "BROWSE ALL GAMES",
    targetGame: "", // If empty, we can just scroll down or do nothing
    gradient: "from-emerald-900 via-teal-900 to-slate-900",
    border: "border-emerald-500/20",
    tagStyle: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    btnStyle: "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/25",
    images: ['/assets/mixed-games.png']
  },
  {
    id: 1,
    tagText: "UNIFIED GAMING HUB PLATFORM",
    tagIcon: Sparkles,
    title: "Play 9 Iconic Games \n In One Arena.",
    desc: "Jump directly into Snake & Ladder, Ludo, Chess, Fruit Ninja, Cricket & more.",
    btnText: "PLAY CHESS NOW",
    targetGame: "chess",
    gradient: "from-indigo-900 via-purple-900 to-slate-900",
    border: "border-indigo-500/20",
    tagStyle: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    btnStyle: "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25",
    images: ['/assets/chess-arena.png']
  },
  {
    id: 2,
    tagText: "CLASSIC BOARD GAME",
    tagIcon: Trophy,
    title: "Master the Board \n in Pro Carrom",
    desc: "Experience the most realistic physics and stunning graphics in our brand new Carrom game.",
    btnText: "PLAY CARROM NOW",
    targetGame: "carrom",
    gradient: "from-amber-900 via-orange-900 to-slate-900",
    border: "border-amber-500/20",
    tagStyle: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    btnStyle: "bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/25",
    images: ['/assets/carrom.png']
  },
  {
    id: 3,
    tagText: "ARCADE ACTION",
    tagIcon: Flame,
    title: "Slice & Dice \n in Blade Fury",
    desc: "Test your reflexes! Slice fruits, avoid bombs, and set new high scores in Blade Fury.",
    btnText: "PLAY FRUIT NINJA NOW",
    targetGame: "fruit-ninja",
    gradient: "from-rose-900 via-red-900 to-slate-900",
    border: "border-rose-500/20",
    tagStyle: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    btnStyle: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/25",
    images: ['/assets/fruit-ninja.png']
  }
];

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('search') || '';
  });
  const [modalGame, setModalGame] = useState<GameMetadata | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('search');
    if (q !== null && q !== searchQuery) {
      setSearchQuery(q);
      // Optional: automatically scroll to the games grid when a search is performed from navbar
      if (q.trim() !== '') {
        document.getElementById('all-games-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.search]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const sliderRef = React.useRef<HTMLDivElement>(null);
  const scrollLeft = () => {
    if (sliderRef.current) sliderRef.current.scrollBy({ left: -350, behavior: 'smooth' });
  };
  const scrollRight = () => {
    if (sliderRef.current) sliderRef.current.scrollBy({ left: 350, behavior: 'smooth' });
  };



  const recentlyPlayed = gamesList.slice(0, 3);
  const popularGames = gamesList.filter(g => g.isHot);

  const filteredGames = gamesList.filter(g => {
    const matchesCat = selectedCategory === 'All' || g.category === selectedCategory;
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleStartGame = (gameId: GameId, mode: 'ai' | 'multiplayer', stake: number) => {
    setModalGame(null);
    navigate(`/games/${gameId}`, { state: { mode, stake } });
  };

  return (
    <div className="space-y-10 w-full max-w-6xl mx-auto pb-8">
      {/* Hero Banner */}
      <div className={`relative rounded-3xl overflow-hidden bg-gradient-to-r ${banners[currentBannerIndex].gradient} p-8 border ${banners[currentBannerIndex].border} shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-500 min-h-[340px] md:min-h-[280px]`}>
        
        {/* Invisible Click Areas for Navigation */}
        <div 
          onClick={() => setCurrentBannerIndex((prev) => (prev - 1 + banners.length) % banners.length)}
          className="absolute left-0 top-0 w-20 h-full z-20 cursor-pointer" 
        />
        <div 
          onClick={() => setCurrentBannerIndex((prev) => (prev + 1) % banners.length)}
          className="absolute right-0 top-0 w-20 h-full z-20 cursor-pointer" 
        />

        <div className="space-y-3 z-30 w-full md:w-2/3 pointer-events-none [&>div>button]:pointer-events-auto">
          <span className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${banners[currentBannerIndex].tagStyle}`}>
            {React.createElement(banners[currentBannerIndex].tagIcon, { className: "w-3.5 h-3.5" })} {banners[currentBannerIndex].tagText}
          </span>
          <h2 className="text-3xl lg:text-4xl font-black text-white leading-tight whitespace-pre-line">
            {banners[currentBannerIndex].title}
          </h2>
          <p className="text-xs text-slate-300 max-w-md">
            {banners[currentBannerIndex].desc}
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                if (banners[currentBannerIndex].targetGame) {
                  const target = gamesList.find(g => g.id === banners[currentBannerIndex].targetGame);
                  if (target) setModalGame(target);
                } else {
                  // For the browse all games button, scroll to games grid
                  document.getElementById('all-games-section')?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className={`py-3.5 px-6 rounded-2xl font-black text-xs shadow-xl transition-all hover:scale-105 ${banners[currentBannerIndex].btnStyle}`}
            >
              {banners[currentBannerIndex].btnText}
            </button>
          </div>
        </div>

        {banners[currentBannerIndex].images && banners[currentBannerIndex].images.length > 0 && (
          <div className="absolute top-0 right-0 h-full w-[70%] md:w-[60%] z-0 pointer-events-none" style={{
            maskImage: 'linear-gradient(to right, transparent 0%, black 50%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 50%)'
          }}>
            <div className="flex h-full w-full opacity-50 mix-blend-overlay">
              {banners[currentBannerIndex].images.map((img, i) => (
                <img 
                  key={i} 
                  src={img} 
                  alt="Game background" 
                  className="h-full w-full object-cover object-center flex-1"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search & Category Filter Section */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <CategoryCard
          categories={['All', 'Board', 'Strategy', 'Arcade', 'Sports']}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />

      </div>

      {/* SECTION 1: Continue Playing (Recently Played) */}
      {searchQuery === '' && selectedCategory === 'All' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white transition-colors duration-300">
            <Clock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xl font-black">Continue Playing</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentlyPlayed.map((game) => (
              <div
                key={game.id}
                onClick={() => setModalGame(game)}
                className="p-4 rounded-2xl glass-panel bg-white dark:bg-transparent border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 cursor-pointer flex items-center justify-between group transition-all shadow-sm dark:shadow-none"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${game.bgGradient} flex items-center justify-center text-xl font-black text-white shadow-md`}>
                    {game.title[0]}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{game.title}</h4>
                    <p className="text-[10px] text-slate-400">{game.category} • {game.players}</p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-indigo-600 text-slate-500 dark:text-slate-400 group-hover:text-white flex items-center justify-center transition-all">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: Popular Games */}
      {searchQuery === '' && selectedCategory === 'All' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white transition-colors duration-300">
            <Flame className="w-5 h-5 text-rose-500" />
            <h3 className="text-xl font-black">Popular Games</h3>
          </div>
          
          <div className="relative group">
            <button 
              onClick={scrollLeft} 
              className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 dark:hover:bg-indigo-600 hover:text-white hover:scale-110"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div 
              ref={sliderRef}
              className="flex overflow-x-auto gap-4 md:gap-6 snap-x snap-mandatory pb-2 [&::-webkit-scrollbar]:hidden px-2"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {popularGames.map((game) => (
                <div key={game.id} className="w-[85%] sm:w-[45%] md:w-[31%] shrink-0 snap-center">
                  <GameCard game={game} onPlay={() => setModalGame(game)} />
                </div>
              ))}
            </div>

            <button 
              onClick={scrollRight} 
              className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 dark:hover:bg-indigo-600 hover:text-white hover:scale-110"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* SECTION 3: All Games Grid */}
      <div id="all-games-section" className="space-y-4">
        <div className="flex items-center justify-between text-slate-900 dark:text-white transition-colors duration-300">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="text-xl font-black">All Games ({filteredGames.length})</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <GameCard key={game.id} game={game} onPlay={() => setModalGame(game)} />
          ))}
        </div>
      </div>

      {modalGame && (
        <MatchSetupModal
          game={modalGame}
          onClose={() => setModalGame(null)}
          onStartGame={handleStartGame}
        />
      )}
    </div>
  );
};
