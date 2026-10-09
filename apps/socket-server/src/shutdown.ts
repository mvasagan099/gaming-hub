/** Run teardown once, in dependency order, completing cleanup even after a failure. */
export function createSocketShutdown(steps: Array<() => void | Promise<unknown>>) {
  let pending: Promise<void> | undefined;
  return () => pending ??= (async () => {
    const failures: unknown[] = [];
    for (const step of steps) {
      try { await step(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Socket shutdown failed");
  })();
}
