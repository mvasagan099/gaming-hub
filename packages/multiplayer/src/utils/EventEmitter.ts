/**
 * Event Emitter
 * 
 * Type-safe event emitter for the multiplayer framework.
 */

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export class EventEmitter {
  private handlers = new Map<string, EventHandler[]>();
  
  /**
   * Subscribe to an event.
   */
  on<T>(event: string, handler: EventHandler<T>): () => void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler as EventHandler);
    this.handlers.set(event, handlers);
    
    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }
  
  /**
   * Subscribe to an event once.
   */
  once<T>(event: string, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (data) => {
      this.off(event, onceHandler);
      handler(data);
    };
    this.on(event, onceHandler);
  }
  
  /**
   * Unsubscribe from an event.
   */
  off<T>(event: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    
    const index = handlers.indexOf(handler as EventHandler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    
    if (handlers.length === 0) {
      this.handlers.delete(event);
    }
  }
  
  /**
   * Emit an event.
   */
  async emit<T>(event: string, data: T): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    
    for (const handler of [...handlers]) {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Event handler error for ${event}:`, error);
      }
    }
  }
  
  /**
   * Remove all handlers for an event.
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
  
  /**
   * Get listener count for an event.
   */
  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
