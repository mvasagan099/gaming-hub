/**
 * Network Optimizations Manager
 * 
 * Implements advanced networking features for smooth gameplay:
 * - Delta synchronization (only send changes)
 * - Payload compression
 * - Client-side state prediction
 * - Latency compensation
 * - Bandwidth optimization
 */

import type { JsonObject } from "@gaming-hub/shared";
import type { MultiplayerFramework } from "../framework";

export interface DeltaState {
  added: JsonObject;
  modified: JsonObject;
  deleted: string[];
}

export interface StateDiff {
  path: string;
  oldValue: any;
  newValue: any;
  type: "add" | "modify" | "delete";
}

export interface PredictionConfig {
  enabled: boolean;
  maxPredictions: number;
  reconciliationDelayMs: number;
}

export interface CompressionConfig {
  enabled: boolean;
  threshold: number; // bytes
  level: number; // 0-9
}

export const DEFAULT_PREDICTION_CONFIG: PredictionConfig = {
  enabled: true,
  maxPredictions: 10,
  reconciliationDelayMs: 100,
};

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: true,
  threshold: 1024,
  level: 6,
};

export class NetworkOptimizationsManager {
  private readonly framework: MultiplayerFramework;
  private readonly previousStates = new Map<string, JsonObject>();
  private readonly predictionQueue = new Map<string, JsonObject[]>();
  private readonly compressionCache = new Map<string, Buffer>();

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("[NetworkOptimizationsManager] Initialized");
  }

  async shutdown(): Promise<void> {
    this.previousStates.clear();
    this.predictionQueue.clear();
    this.compressionCache.clear();
  }

  calculateDelta(
    roomId: string,
    newState: JsonObject
  ): DeltaState {
    const previousState = this.previousStates.get(roomId);

    if (!previousState) {
      this.previousStates.set(roomId, newState);
      return {
        added: newState,
        modified: {},
        deleted: [],
      };
    }

    const diffs = this.deepDiff(previousState, newState);
    const delta: DeltaState = {
      added: {},
      modified: {},
      deleted: [],
    };

    for (const diff of diffs) {
      if (diff.type === "add") {
        this.deepSet(delta.added, diff.path, diff.newValue);
      } else if (diff.type === "modify") {
        this.deepSet(delta.modified, diff.path, diff.newValue);
      } else if (diff.type === "delete") {
        delta.deleted.push(diff.path);
      }
    }

    this.previousStates.set(roomId, newState);

    return delta;
  }

  applyDelta(baseState: JsonObject, delta: DeltaState): JsonObject {
    const result = JSON.parse(JSON.stringify(baseState));

    for (const [path, value] of Object.entries(delta.added)) {
      this.deepSet(result, path, value);
    }

    for (const [path, value] of Object.entries(delta.modified)) {
      this.deepSet(result, path, value);
    }

    for (const path of delta.deleted) {
      this.deepDelete(result, path);
    }

    return result;
  }

  compressPayload(payload: JsonObject): { compressed: boolean; data: Buffer | JsonObject } {
    const jsonStr = JSON.stringify(payload);
    const byteSize = Buffer.byteLength(jsonStr, "utf8");

    if (
      DEFAULT_COMPRESSION_CONFIG.enabled &&
      byteSize >= DEFAULT_COMPRESSION_CONFIG.threshold
    ) {
      const zlib = require("zlib");
      const compressed = zlib.deflateSync(
        jsonStr,
        { level: DEFAULT_COMPRESSION_CONFIG.level }
      );

      if (compressed.length < byteSize * 0.8) {
        return { compressed: true, data: compressed };
      }
    }

    return { compressed: false, data: payload };
  }

  decompressPayload(data: Buffer | JsonObject): JsonObject {
    if (Buffer.isBuffer(data)) {
      const zlib = require("zlib");
      const jsonStr = zlib.inflateSync(data).toString("utf8");
      return JSON.parse(jsonStr);
    }

    return data as JsonObject;
  }

  predictState(
    playerId: string,
    currentState: JsonObject,
    action: JsonObject,
    latency: number
  ): JsonObject {
    if (!DEFAULT_PREDICTION_CONFIG.enabled) {
      return currentState;
    }

    const predictedState = this.applyPrediction(currentState, action);
    const predictions = this.predictionQueue.get(playerId) ?? [];
    predictions.push(predictedState);

    if (predictions.length > DEFAULT_PREDICTION_CONFIG.maxPredictions) {
      predictions.shift();
    }

    this.predictionQueue.set(playerId, predictions);

    return predictedState;
  }

  reconcileState(
    playerId: string,
    serverState: JsonObject,
    timestamp: number
  ): JsonObject {
    const predictions = this.predictionQueue.get(playerId) ?? [];

    if (predictions.length === 0) {
      return serverState;
    }

    let reconciledState = serverState;

    for (const predictedState of predictions) {
      reconciledState = this.mergePrediction(reconciledState, predictedState);
    }

    this.predictionQueue.delete(playerId);

    return reconciledState;
  }

  optimizeBandwidth(payload: JsonObject): JsonObject {
    const optimized = JSON.parse(JSON.stringify(payload));

    this.removeRedundantFields(optimized);
    this.shortenKeys(optimized);
    this.roundNumbers(optimized);

    return optimized;
  }

  private deepDiff(
    oldObj: any,
    newObj: any,
    path = ""
  ): StateDiff[] {
    const diffs: StateDiff[] = [];

    if (this.isPrimitive(oldObj) || this.isPrimitive(newObj)) {
      if (oldObj !== newObj) {
        diffs.push({
          path,
          oldValue: oldObj,
          newValue: newObj,
          type: oldObj === undefined ? "add" : newObj === undefined ? "delete" : "modify",
        });
      }
      return diffs;
    }

    const oldKeys = Object.keys(oldObj);
    const newKeys = Object.keys(newObj);

    for (const key of oldKeys) {
      if (!(key in newObj)) {
        diffs.push({
          path: path ? `${path}.${key}` : key,
          oldValue: oldObj[key],
          newValue: undefined,
          type: "delete",
        });
      }
    }

    for (const key of newKeys) {
      if (!(key in oldObj)) {
        diffs.push({
          path: path ? `${path}.${key}` : key,
          oldValue: undefined,
          newValue: newObj[key],
          type: "add",
        });
      } else {
        const nestedDiffs = this.deepDiff(
          oldObj[key],
          newObj[key],
          path ? `${path}.${key}` : key
        );
        diffs.push(...nestedDiffs);
      }
    }

    return diffs;
  }

  private deepSet(obj: any, path: string, value: any): void {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private deepDelete(obj: any, path: string): void {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
      if (!current) return;
    }

    delete current[keys[keys.length - 1]];
  }

  private applyPrediction(state: JsonObject, action: JsonObject): JsonObject {
    const predicted = JSON.parse(JSON.stringify(state));
    const act = action as any;

    if (act.type === "move" && act.position) {
      predicted.position = act.position;
    }

    return predicted;
  }

  private mergePrediction(serverState: JsonObject, predictedState: JsonObject): JsonObject {
    return { ...serverState, ...predictedState };
  }

  private isPrimitive(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  }

  private removeRedundantFields(obj: any): void {
    const fieldsToRemove = ["_debug", "_internal", "debugInfo"];
    for (const field of fieldsToRemove) {
      delete obj[field];
    }
  }

  private shortenKeys(obj: any, keyMap: Record<string, string> = {}): void {
    for (const [longKey, shortKey] of Object.entries(keyMap)) {
      if (longKey in obj) {
        obj[shortKey] = obj[longKey];
        delete obj[longKey];
      }
    }
  }

  private roundNumbers(obj: any, decimals = 2): void {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "number") {
        obj[key] = Math.round(obj[key] * Math.pow(10, decimals)) / Math.pow(10, decimals);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        this.roundNumbers(obj[key], decimals);
      }
    }
  }
}
