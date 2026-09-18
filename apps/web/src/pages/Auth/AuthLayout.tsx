import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { MobileBackButton } from "../../components/layout/MobileBackButton";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950 transition-colors duration-300 relative">
      <div className="fixed top-4 left-4 pt-[env(safe-area-inset-top)] z-50">
        <MobileBackButton fallback="/" />
      </div>

      <Link to="/" className="flex items-center gap-3 mb-8 group">
        <img
          src="/logo.png"
          alt="Gaming Hub Logo"
          className="w-12 h-12 rounded-2xl object-contain shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform"
        />
        <div className="text-left">
          <h1 className="text-xl font-black tracking-wider text-slate-900 dark:text-white">
            GAMING<span className="text-indigo-500">HUB</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">
            Play • Compete • Win
          </p>
        </div>
      </Link>

      <div className="w-full max-w-md">
        <div className="glass-panel dark:bg-transparent border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl transition-colors duration-300">
          <div className="text-center space-y-1.5 mb-6">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
