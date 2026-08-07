/**
 * Latency Compensator
 * 
 * Provides latency compensation for real-time games.
 */

export interface LatencySample {
  timestamp: number;
  latencyMs: number;
}

export class LatencyCompensator {
  private samples = new Map<string, LatencySample[]>();
  private readonly maxSamples = 10;
  
  /**
   * Add a latency sample.
   */
  addSample(playerId: string, latencyMs: number): void {
    const playerSamples = this.samples.get(playerId) ?? [];
    
    playerSamples.push({
      timestamp: Date.now(),
      latencyMs,
    });
    
    // Keep only recent samples
    if (playerSamples.length > this.maxSamples) {
      playerSamples.shift();
    }
    
    this.samples.set(playerId, playerSamples);
  }
  
  /**
   * Get average latency for a player.
   */
  getAverageLatency(playerId: string): number {
    const playerSamples = this.samples.get(playerId);
    if (!playerSamples || playerSamples.length === 0) {
      return 0;
    }
    
    const sum = playerSamples.reduce((acc, s) => acc + s.latencyMs, 0);
    return sum / playerSamples.length;
  }
  
   /**
   * Get smoothed latency using exponential moving average.
   */
  getSmoothedLatency(playerId: string, alpha = 0.3): number {
    const playerSamples = this.samples.get(playerId);
    if (!playerSamples || playerSamples.length === 0) {
      return 0;
    }
    
    let smoothed = playerSamples[0]!.latencyMs;
    
    for (let i = 1; i < playerSamples.length; i++) {
      smoothed = alpha * playerSamples[i]!.latencyMs + (1 - alpha) * smoothed;
    }
    
    return smoothed;
  }
  
  /**
   * Predict player position/action based on latency.
   */
  predict<T extends { timestamp: number }>(
    playerId: string,
    lastKnown: T,
    extrapolate: (state: T, deltaMs: number) => T
  ): T {
    const latency = this.getAverageLatency(playerId);
    const deltaMs = latency / 2; // Half RTT
    
    return extrapolate(lastKnown, deltaMs);
  }
  
  /**
   * Rewind state to account for latency.
   */
  rewind<T>(currentState: T, deltaMs: number, interpolate: (state: T, factor: number) => T): T {
    // Simple linear interpolation
    const factor = Math.min(1, deltaMs / 1000);
    return interpolate(currentState, factor);
  }
  
  /**
   * Get latency jitter.
   */
  getJitter(playerId: string): number {
    const playerSamples = this.samples.get(playerId);
    if (!playerSamples || playerSamples.length < 2) {
      return 0;
    }
    
    const latencies = playerSamples.map(s => s.latencyMs);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    const squaredDiffs = latencies.map(l => Math.pow(l - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    
    return Math.sqrt(variance);
  }
  
  /**
   * Check if player is experiencing high latency.
   */
  isHighLatency(playerId: string, threshold = 200): boolean {
    return this.getAverageLatency(playerId) > threshold;
  }
  
  /**
   * Clear samples for a player.
   */
  clearPlayer(playerId: string): void {
    this.samples.delete(playerId);
  }
  
  /**
   * Clear all samples.
   */
  clear(): void {
    this.samples.clear();
  }
}
