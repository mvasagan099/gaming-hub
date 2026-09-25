import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { fenToPieces } from "../phaser/utils/chessUtils";
import { chessPieceGlyph, orientationForChessColor, pairChessHistory, resolveChessParticipants } from "./chessState";

const players = [
  { userId: "black-user", seat: 1, color: "b" as const },
  { userId: "white-user", seat: 0, color: "w" as const },
];

describe("Chess client state", () => {
  it("resolves both colors by authoritative user ID, independent of array order or turn", () => {
    expect(resolveChessParticipants(players, "white-user")).toEqual({ local: players[1], opponent: players[0] });
    expect(resolveChessParticipants(players, "black-user")).toEqual({ local: players[0], opponent: players[1] });
    expect(resolveChessParticipants(players, "spectator")).toBeNull();
  });

  it("orients each board to the local color without changing logical piece colors", () => {
    const chess = new Chess();
    const before = fenToPieces(chess.fen());
    expect(orientationForChessColor(players[1]!.color)).toBe("white");
    expect(orientationForChessColor(players[0]!.color)).toBe("black");
    expect(fenToPieces(chess.fen())).toEqual(before);
    expect(before.find((piece) => piece.square === "e2")?.color).toBe("w");
    expect(before.find((piece) => piece.square === "e7")?.color).toBe("b");
  });

  it("uses the correct white and black piece glyphs", () => {
    const pieceTypes = ["p", "n", "b", "r", "q", "k"] as const;
    expect(pieceTypes.map((piece) => chessPieceGlyph("w", piece))).toEqual(["♙", "♘", "♗", "♖", "♕", "♔"]);
    expect(pieceTypes.map((piece) => chessPieceGlyph("b", piece))).toEqual(["♟", "♞", "♝", "♜", "♛", "♚"]);
  });

  it("keeps white then black SAN turns identical for both viewers and repeated socket snapshots", () => {
    const history = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];
    const expected = [
      { num: 1, white: "e4", black: "e5" },
      { num: 2, white: "Nf3", black: "Nc6" },
      { num: 3, white: "Bb5", black: "a6" },
    ];
    for (const userId of ["white-user", "black-user"]) {
      expect(resolveChessParticipants(players, userId)).not.toBeNull();
      expect(pairChessHistory(history)).toEqual(expected);
    }
    expect(pairChessHistory(history)).toEqual(expected); // repeated server snapshot
    expect(pairChessHistory(["e4"])).toEqual([{ num: 1, white: "e4", black: undefined }]);
  });
});
