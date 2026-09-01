export class CoordinateSystem {
  static getTileCoords(tile: number, boardSize = 800, gridDimension = 10): { x: number; y: number } {
    const tileSize = boardSize / gridDimension;
    const clampedTile = Math.max(1, Math.min(tile, gridDimension * gridDimension));

    const rowFromBottom = Math.floor((clampedTile - 1) / gridDimension);
    const colInRow = (clampedTile - 1) % gridDimension;

    const col = rowFromBottom % 2 === 0 ? colInRow : gridDimension - 1 - colInRow;
    const row = gridDimension - 1 - rowFromBottom;

    return {
      x: col * tileSize + tileSize / 2,
      y: row * tileSize + tileSize / 2,
    };
  }
}
