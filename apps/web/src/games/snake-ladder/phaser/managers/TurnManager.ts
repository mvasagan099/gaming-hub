export class TurnManager {
  private currentPlayer = 0;
  private totalPlayers = 2;

  getCurrentPlayer(): number {
    return this.currentPlayer;
  }

  nextTurn(): number {
    this.currentPlayer = (this.currentPlayer + 1) % this.totalPlayers;
    return this.currentPlayer;
  }

  reset() {
    this.currentPlayer = 0;
  }
}
