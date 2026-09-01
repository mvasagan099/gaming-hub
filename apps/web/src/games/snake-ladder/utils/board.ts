export interface CellData {
  number: number;
  row: number;
  col: number;
}

export function generateBoard(): CellData[] {
  const cells: CellData[] = [];

  for (let row = 0; row < 10; row++) {
    const start = row * 10 + 1;
    const numbers = Array.from({ length: 10 }, (_, i) => start + i);

    // Zig-zag every other row
    if (row % 2 === 1) {
      numbers.reverse();
    }

    numbers.forEach((number, col) => {
      cells.push({
        number,
        row,
        col,
      });
    });
  }

  return cells.reverse(); // Cell 100 appears at the top-left
}
