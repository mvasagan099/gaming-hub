import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;

  connect(url = 'http://localhost:4000') {
    if (!this.socket) {
      this.socket = io(url, {
        autoConnect: true,
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('⚡ Socket Connected:', this.socket?.id);
      });
    }
    return this.socket;
  }

  joinRoom(gameId: string, username: string) {
    this.socket?.emit('joinRoom', { gameId, username });
  }

  sendMove(gameId: string, moveData: any) {
    this.socket?.emit('sendGameMove', { gameId, ...moveData });
  }

  onOpponentMove(callback: (data: any) => void) {
    this.socket?.on('opponentMove', callback);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
