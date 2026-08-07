/**
 * Gaming Hub Enterprise Platform
 * 
 * Enterprise-grade services for global scalability, AI-powered operations,
 * advanced analytics, monetization, and cloud infrastructure.
 * 
 * @module @gaming-hub/enterprise
 */

// Core exports
export { LiveOpsManager } from "./live-ops";
export { AIService } from "./ai";
export { EconomyManager } from "./economy";
export { MonetizationManager } from "./monetization";
export { NotificationService } from "./notifications";

// Types
export * from "./types";

// Live Operations exports
export type { LiveOpsConfig } from "./live-ops";

// AI exports
export type { AIServiceConfig } from "./ai";

// Economy exports
export type { EconomyConfig, LevelConfig } from "./economy";

// Monetization exports
export type { MonetizationConfig } from "./monetization";

// Notifications exports
export type { NotificationConfig } from "./notifications";

// Version
export const VERSION = "1.0.0";
