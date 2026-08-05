import { Search, Bell, UserCircle2, Sun, Moon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";

interface NavbarProps {
  onLogoClick?: () => void;
}

export default function Navbar({ onLogoClick }: NavbarProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">

        <button 
          onClick={() => {
            if (onLogoClick) onLogoClick();
            else navigate('/');
          }} 
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <span className="text-3xl">🎮</span>

          <h1 className="text-xl font-bold text-slate-900 dark:text-white transition-colors duration-300">
            Gaming Hub
          </h1>
        </button>

        <div className="hidden md:flex items-center w-96 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 border border-slate-200 dark:border-slate-700/50 transition-colors duration-300">
          <Search size={18} className="text-slate-400" />
          <input
            placeholder="Search games..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
            onChange={(e) => navigate(`/?search=${encodeURIComponent(e.target.value)}`)}
          />
        </div>

        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-300">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <Bell className="cursor-pointer hover:text-slate-900 dark:hover:text-white transition" size={20} />
          <Link to="/profile">
            <UserCircle2 className="cursor-pointer hover:text-white transition text-indigo-400" size={34} />
          </Link>
        </div>

      </div>
    </header>
  );
}
