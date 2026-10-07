/** One animation loop; background tabs resume with a fresh clock. */
export function startAnimationLoop(callback: (dt: number) => void): () => void {
  let request: number | undefined;
  let previous: number | undefined;
  let active = true;
  const frame = (time: number) => {
    request = undefined;
    if (!active || document.hidden) return;
    if (previous !== undefined) callback(Math.min(Math.max(0, time - previous) / 1000, 0.1));
    previous = time;
    if (active) request = requestAnimationFrame(frame);
  };
  const visibility = () => {
    if (request !== undefined) cancelAnimationFrame(request);
    request = undefined; previous = undefined;
    if (active && !document.hidden) request = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', visibility);
  visibility();
  return () => {
    active = false;
    if (request !== undefined) cancelAnimationFrame(request);
    document.removeEventListener('visibilitychange', visibility);
  };
}
