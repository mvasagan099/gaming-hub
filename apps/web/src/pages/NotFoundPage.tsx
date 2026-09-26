import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center px-4 py-12">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 shadow-inner">
        <Compass className="w-8 h-8 animate-pulse" />
      </div>
      <h1 className="text-6xl font-black tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
        404
      </h1>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Page Not Found</h2>
      <p className="text-slate-600 dark:text-slate-400 max-w-sm text-sm">
        The gaming arena you're looking for doesn't exist, has ended, or has moved to a new lobby.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white transition-all px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Gaming Hub
      </Link>
    </div>
  );
}
