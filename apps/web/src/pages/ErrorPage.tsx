import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";

export function ErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.statusText || `Request failed (${error.status})`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-7xl font-black bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
          {status}
        </p>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          {status === 404 ? "Page not found" : "Something went wrong"}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 break-words">{message}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Go home
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-sm font-bold transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
