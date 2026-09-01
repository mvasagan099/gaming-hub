import Phaser from "phaser";

export function generateTileCoordinates(
  boardSize = 800,
  rows = 10,
  cols = 10
): Map<number, Phaser.Math.Vector2> {
  const tileSize = boardSize / cols;
  const coordinates = new Map<number, Phaser.Math.Vector2>();

  for (let tile = 1; tile <= 100; tile++) {
    const index = tile - 1;
    const row = Math.floor(index / cols);
    let col = index % cols;

    if (row % 2 === 1) {
      col = cols - 1 - col;
    }

    const x = col * tileSize + tileSize / 2;
    const y = boardSize - (row * tileSize + tileSize / 2);

    coordinates.set(tile, new Phaser.Math.Vector2(x, y));
  }

  return coordinates;
}
