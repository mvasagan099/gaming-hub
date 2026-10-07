import { AppError } from "@gaming-hub/shared";

/** Backpressure before any queries: waiting requests must not occupy DB connections.
 * Database locks and uniqueness still enforce correctness across API replicas.
 */
export class RegistrationAdmission {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly concurrency = 4, private readonly queueLimit = 1024) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.queueLimit) {
        throw new AppError("REGISTRATION_BUSY", "Registration is busy. Please retry shortly.", 503);
      }
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // Transfer the permit without letting a new request jump the queue.
      else this.active--;
    }
  }
}

export const registrationAdmission = new RegistrationAdmission();
