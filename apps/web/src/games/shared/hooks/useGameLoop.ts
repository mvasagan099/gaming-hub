import { useEffect, useRef } from 'react';

/**
 * A custom hook to manage a game loop with requestAnimationFrame.
 * It provides delta time (dt) in seconds to the callback to ensure frame-rate independent gameplay.
 * 
 * @param callback The update function to run on each frame.
 * @param isRunning Whether the game loop should currently be active.
 */
export function useGameLoop(
  callback: (dt: number) => void,
  isRunning: boolean = true
) {
  const requestRef = useRef<number>(undefined);
  const previousTimeRef = useRef<number>(undefined);
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isRunning) {
      if (requestRef.current !== undefined) {
        cancelAnimationFrame(requestRef.current);
      }
      return;
    }

    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        // Cap dt to prevent massive jumps if tab is inactive
        const dtInSeconds = Math.min(deltaTime / 1000, 0.1); 
        savedCallback.current(dtInSeconds);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current !== undefined) {
        cancelAnimationFrame(requestRef.current);
      }
      // Reset previous time so dt doesn't spike when re-started
      previousTimeRef.current = undefined;
    };
  }, [isRunning]);
}
