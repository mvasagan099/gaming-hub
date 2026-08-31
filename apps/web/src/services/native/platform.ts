import { Capacitor } from '@capacitor/core';

/**
 * Checks if the application is running inside a Capacitor native shell.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Checks if the current native platform is Android.
 */
export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Checks if the current platform is a standard web browser.
 */
export function isWeb(): boolean {
  return !Capacitor.isNativePlatform();
}

/**
 * Gets the active platform identifier ('android' | 'ios' | 'web').
 */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
