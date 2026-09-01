/**
 * State Validator
 * 
 * Validates game state integrity.
 */

import type { JsonObject } from "@gaming-hub/shared";

export interface ValidationError {
  path: string;
  message: string;
}

export class StateValidator {
  /**
   * Validate state against a schema.
   */
  static validate<T extends JsonObject>(
    state: unknown,
    schema: StateSchema
  ): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    
    if (typeof state !== "object" || state === null) {
      return { valid: false, errors: [{ path: "", message: "State must be an object" }] };
    }
    
    this.validateObject(state as JsonObject, schema, "", errors);
    
    return { valid: errors.length === 0, errors };
  }
  
  /**
   * Validate an object.
   */
  private static validateObject(
    obj: JsonObject,
    schema: StateSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    for (const [key, expectedType] of Object.entries(schema)) {
      const currentPath = path ? `${path}.${key}` : key;
      const value = obj[key];
      
      if (expectedType === "string") {
        if (typeof value !== "string") {
          errors.push({ path: currentPath, message: `Expected string, got ${typeof value}` });
        }
      } else if (expectedType === "number") {
        if (typeof value !== "number") {
          errors.push({ path: currentPath, message: `Expected number, got ${typeof value}` });
        }
      } else if (expectedType === "boolean") {
        if (typeof value !== "boolean") {
          errors.push({ path: currentPath, message: `Expected boolean, got ${typeof value}` });
        }
      } else if (expectedType === "array") {
        if (!Array.isArray(value)) {
          errors.push({ path: currentPath, message: `Expected array, got ${typeof value}` });
        }
      } else if (typeof expectedType === "object") {
        if (typeof value !== "object" || value === null) {
          errors.push({ path: currentPath, message: `Expected object, got ${typeof value}` });
        } else {
          this.validateObject(value as JsonObject, expectedType as StateSchema, currentPath, errors);
        }
      }
    }
  }
  
  /**
   * Calculate state hash.
   */
  static calculateHash(state: JsonObject): string {
    const str = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  /**
   * Deep clone state.
   */
  static clone<T extends JsonObject>(state: T): T {
    return JSON.parse(JSON.stringify(state));
  }
}

export interface StateSchema {
  [key: string]: "string" | "number" | "boolean" | "array" | StateSchema;
}
