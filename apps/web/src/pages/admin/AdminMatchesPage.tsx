import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api/client';

interface Player {
  id: string;
  user: { username: string };
};

interface Match {
  id: string;
  status: string;
  gameSlug: string;
  stake: number | null;
  createdAt: string;
  players: Player[];
};

export function AdminMatchesPage() {
  const [matches, setMatches] = useState<{
    items: Match[];
    total: number;
    page: number;
    pageSize: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMatches() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<{ items: Match[]; total: number; page: number; pageSize: number }>('/admin/matches?page=1&pageSize=50');
        setMatches(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load matches';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }
    loadMatches();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600">
        <p className="font-medium">Failed to load matches</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Matches</h1>
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Match ID</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Stake</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {matches?.items.map((match) => (
              <tr key={match.id} className="border-b border-border">
                <td className="px-4 py-3 font-mono text-sm">
                  {match.id.slice(0, 8)}
                </td>
                <td className="px-4 py-3">{match.gameSlug}</td>
                <td className="px-4 py-3">{match.stake || 'Free'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      match.status === 'COMPLETED'
                        ? 'bg-green-500/10 text-green-600'
                        : match.status === 'ACTIVE'
                          ? 'bg-blue-500/10 text-blue-600'
                          : match.status === 'ABANDONED'
                            ? 'bg-red-500/10 text-red-600'
                            : 'bg-gray-500/10 text-gray-600'
                    }`}
                  >
                    {match.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {match.players.map((p) => p.user.username).join(', ')}
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(match.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {matches && (
          <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            Total: {matches.total} matches
          </div>
        )}
      </div>
    </div>
  );
}