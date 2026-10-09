import type { Socket } from "socket.io";
import type { AuthenticatedUser } from "./auth";

/** Bounded, single-flight checks: no DB request per physics input and no growing queue. */
export function installSessionGuard(socket: Socket, user: AuthenticatedUser,
  verify: (user: AuthenticatedUser) => Promise<AuthenticatedUser>, intervalMs = 2_000) {
  let checkedAt = Date.now();
  let checking: Promise<void> | null = null;
  let stopped = false;
  let pendingPackets = 0;
  const check = (force = false): Promise<void> => {
    if (stopped) return Promise.reject(new Error("SESSION_REVOKED"));
    if (checking) return checking;
    if (!force && Date.now() - checkedAt < intervalMs && (user.expiresAtMs ?? Infinity) > Date.now()) return Promise.resolve();
    let deadline: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error("AUTHORIZATION_UNAVAILABLE")), intervalMs);
      deadline.unref();
    });
    checking = Promise.race([verify(user), timedOut]).then(async (current) => {
      if (stopped) throw new Error("SESSION_REVOKED");
      Object.assign(user, current);
      if (user.role !== "ADMIN") await socket.leave("admin:analytics");
      checkedAt = Date.now();
    }).catch((error) => {
      const reason = error instanceof Error && ["TOKEN_REFRESH", "TOKEN_EXPIRED", "MFA_PENDING"].includes(error.message)
        ? error.message : "SESSION_INVALID";
      socket.emit("auth:session-revoked", { reason });
      socket.disconnect(true);
      throw error;
    }).finally(() => { clearTimeout(deadline); checking = null; });
    return checking;
  };
  socket.use((packet, next) => {
    const event = packet[0];
    const ack = packet[packet.length - 1];
    if (pendingPackets >= 64) { next(new Error("RATE_LIMITED")); return; }
    pendingPackets++;
    void check(typeof event === "string" && (event.startsWith("admin:") || event.startsWith("room:") || event.includes("rematch") || event.includes("queue") || event.startsWith("matchmaking:")))
      .then(() => { if (!stopped) next(); }, () => {
        if (typeof ack === "function") ack({ ok: false, error: { code: "SESSION_REVOKED", message: "Please sign in again" } });
        next(new Error("SESSION_REVOKED"));
      }).finally(() => { pendingPackets--; });
  });
  const timer = setInterval(() => { void check(true).catch(() => {}); }, intervalMs);
  timer.unref();
  socket.once("disconnect", () => { stopped = true; clearInterval(timer); });
}

/** fetchSockets traverses the configured adapter, including remote replicas. */
export async function evictPreviousSessions(io: import("socket.io").Server, socket: Socket, user: AuthenticatedUser) {
  await socket.join(`user:${user.userId}`);
  const sockets = await io.in(`user:${user.userId}`).fetchSockets();
  for (const other of sockets) {
    if (other.id !== socket.id && other.data.tokenHash !== user.tokenHash) {
      const sameProviderSession = user.providerSessionId && other.data.user?.providerSessionId === user.providerSessionId;
      other.emit("auth:session-revoked", { reason: sameProviderSession ? "TOKEN_REFRESH" : "NEW_LOGIN" });
      other.disconnect(true);
    }
  }
}
