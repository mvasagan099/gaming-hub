import { io, Socket } from "socket.io-client";
import { SocketEvents } from "./socketEvents";

export interface GameStateDTO {
  roomId: string;
  currentTurn: string;
  winner: string | null;
  players: { id: string; name: string; position: number; finished: boolean }[];
}

export class SocketClientService {
  private socket: Socket | null = null;

  connect(serverUrl = "http://localhost:3001") {
    if (!this.socket) {
      this.socket = io(serverUrl, { autoConnect: true });
    }
  }

  joinRoom(roomId: string, playerName: string) {
    this.socket?.emit(SocketEvents.JOIN_ROOM, { roomId, playerName });
  }

  rollDice(roomId: string) {
    this.socket?.emit(SocketEvents.ROLL_DICE, { roomId });
  }

  onGameStateUpdated(callback: (state: GameStateDTO) => void) {
    this.socket?.on(SocketEvents.START_GAME, callback);
    this.socket?.on(SocketEvents.DICE_RESULT, (data: { state: GameStateDTO }) => {
      if (data.state) callback(data.state);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketClientService = new SocketClientService();
