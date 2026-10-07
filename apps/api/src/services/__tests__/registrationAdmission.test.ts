import { describe, expect, it } from "vitest";
import { RegistrationAdmission } from "../registrationAdmission";

describe("registration admission", () => {
  it("admits a burst without exhausting connections and releases failed operations", async () => {
    const gate = new RegistrationAdmission(4);
    let active = 0;
    let peak = 0;
    const results = await Promise.allSettled(Array.from({ length: 200 }, (_, index) => gate.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      if (index === 0) throw new Error("transaction failed");
      return index;
    })));
    expect(peak).toBe(4);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(199);
    expect(await gate.run(async () => "next registration")).toBe("next registration");
  });

  it("rejects overflow before invoking the database operation", async () => {
    const gate = new RegistrationAdmission(1, 1);
    let release!: () => void;
    const first = gate.run(() => new Promise<void>(resolve => { release = resolve; }));
    const second = gate.run(async () => "queued");
    let invoked = false;
    await expect(gate.run(async () => { invoked = true; })).rejects.toThrow("Registration is busy");
    expect(invoked).toBe(false);
    release();
    await first;
    expect(await second).toBe("queued");
  });
});
