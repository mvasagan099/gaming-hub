/** Use the server's pause instant; browser animation ticks cannot consume it. */
export function remainingCarromTurnMs(expiresAt: number, serverNow: number, pausedAt: number | null): number {
  return Math.max(0, expiresAt - (pausedAt ?? serverNow));
}
