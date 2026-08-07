/**
 * Packet Sequencer
 * 
 * Manages packet sequence numbers to ensure ordered delivery.
 */

export class PacketSequencer {
  private sequences = new Map<string, number>();
  private receivedSequences = new Map<string, Set<number>>();
  
  /**
   * Get next sequence number for a stream.
   */
  next(streamId: string): number {
    const current = this.sequences.get(streamId) ?? 0;
    const next = current + 1;
    this.sequences.set(streamId, next);
    return next;
  }
  
  /**
   * Get current sequence number for a stream.
   */
  current(streamId: string): number {
    return this.sequences.get(streamId) ?? 0;
  }
  
  /**
   * Reset sequence for a stream.
   */
  reset(streamId: string): void {
    this.sequences.delete(streamId);
    this.receivedSequences.delete(streamId);
  }
  
  /**
   * Check if a sequence number has been received.
   */
  isReceived(streamId: string, sequence: number): boolean {
    const received = this.receivedSequences.get(streamId);
    return received ? received.has(sequence) : false;
  }
  
  /**
   * Mark a sequence number as received.
   */
  markReceived(streamId: string, sequence: number): void {
    const received = this.receivedSequences.get(streamId) ?? new Set();
    received.add(sequence);
    
    // Keep only last 1000 sequences
    if (received.size > 1000) {
      const sorted = [...received].sort((a, b) => a - b);
      const toKeep = sorted.slice(-1000);
      this.receivedSequences.set(streamId, new Set(toKeep));
    } else {
      this.receivedSequences.set(streamId, received);
    }
  }
  
  /**
   * Check if a sequence is valid (not duplicate and not too old).
   */
  isValid(streamId: string, sequence: number, maxAge = 1000): boolean {
    // Check for duplicates
    if (this.isReceived(streamId, sequence)) {
      return false;
    }
    
    // Check if sequence is too old
    const current = this.current(streamId);
    if (sequence < current - maxAge) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Detect missing sequences.
   */
  detectGaps(streamId: string): number[] {
    const current = this.current(streamId);
    const received = this.receivedSequences.get(streamId);
    
    if (!received) return [];
    
    const gaps: number[] = [];
    for (let i = 1; i <= current; i++) {
      if (!received.has(i)) {
        gaps.push(i);
      }
    }
    
    return gaps;
  }
}
