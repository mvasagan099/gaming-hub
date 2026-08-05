import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Gamepad2 } from "lucide-react";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Link to="/" className="flex items-center gap-3 mb-8 group">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <Gamepad2 className="w-6 h-6 text-white" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-black tracking-wider text-slate-900 dark:text-white">
            GAMING<span className="text-indigo-500">HUB</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase">
            Unified Arena
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
