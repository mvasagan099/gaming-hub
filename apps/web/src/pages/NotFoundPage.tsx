import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
      <h1 className="text-6xl font-black text-indigo-500">404</h1>
      <h2 className="text-2xl font-bold text-white">Page Not Found</h2>
      <p className="text-slate-400 max-w-sm">
        The gaming arena you're looking for doesn't exist or has moved.
      </p>
      <Link to="/" className="inline-block bg-indigo-600 hover:bg-indigo-500 transition px-6 py-2.5 rounded-xl font-extrabold text-sm text-white shadow-lg shadow-indigo-600/30">
        Return to Gaming Hub
      </Link>
    </div>
  );
}
