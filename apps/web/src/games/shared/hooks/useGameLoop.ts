import { useEffect, useRef } from 'react';
import { startAnimationLoop } from './animationLoop';

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
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isRunning) return;
    return startAnimationLoop(dt => savedCallback.current(dt));
  }, [isRunning]);
}
