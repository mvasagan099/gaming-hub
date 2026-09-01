import { useEffect, useState } from 'react';
import { apiClient } from '../../services/api/client';

interface Room {
  id: string;
  status: string;
  gameId: string;
  stake: number | null;
  host: { username: string };
  createdAt: string;
  _count: { players: number };
};

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRooms() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<Room[]>('/admin/rooms');
        setRooms(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load rooms';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }
    loadRooms();
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
        <p className="font-medium">Failed to load rooms</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Active Rooms</h1>
      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Room ID</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Stake</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {rooms?.map((room) => (
              <tr key={room.id} className="border-b border-border">
                <td className="px-4 py-3 font-mono text-sm">
                  {room.id.slice(0, 8)}
                </td>
                <td className="px-4 py-3">{room.gameId}</td>
                <td className="px-4 py-3">{room.host.username}</td>
                <td className="px-4 py-3">{room.stake || 'Free'}</td>
                <td className="px-4 py-3">{room._count.players}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      room.status === 'WAITING'
                        ? 'bg-yellow-500/10 text-yellow-600'
                        : room.status === 'PLAYING'
                          ? 'bg-blue-500/10 text-blue-600'
                          : 'bg-gray-500/10 text-gray-600'
                    }`}
                  >
                    {room.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {new Date(room.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rooms && rooms.length === 0 && (
          <div className="px-4 py-8 text-center text-muted-foreground">
            No active rooms
          </div>
        )}
      </div>
    </div>
  );
}