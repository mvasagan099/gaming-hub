import { createHash } from 'node:crypto';
import type { RecordedAction } from '../types';
const BYTES = 8192;
function decode(encoded?: string): Buffer {
  if (encoded == null) return Buffer.alloc(BYTES);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== BYTES || bytes.toString('base64') !== encoded) throw new Error('INVALID_ARCHIVED_ACTION_FILTER');
  return bytes;
}
function indices(playerId: string, actionId: string): number[] {
  const digest = createHash('sha256').update(JSON.stringify([playerId, actionId])).digest();
  return Array.from({ length: 6 }, (_, i) => digest.readUInt16BE(i * 2));
}
/** Fixed-size negative filter only: a positive always requires a DB receipt. */
export function addArchivedActions(encoded: string | undefined, records: RecordedAction[]): string | undefined {
  if (!records.length) return encoded;
  // Missing filters on legacy archives cannot be made complete from a new suffix.
  const bytes = decode(encoded);
  for (const record of records) if (typeof record.action.actionId === 'string') {
    for (const bit of indices(record.playerId, record.action.actionId)) bytes[bit >>> 3] |= 1 << (bit & 7);
  }
  return bytes.toString('base64');
}
export function mightContainArchivedAction(encoded: string | undefined, playerId: string, actionId: string): boolean {
  if (encoded == null) return true; // Legacy archive: consult DB, never guess absent.
  const bytes = decode(encoded);
  return indices(playerId, actionId).every(bit => (bytes[bit >>> 3] & (1 << (bit & 7))) !== 0);
}
export function validateArchivedActionFilter(encoded?: string): void { if (encoded != null) decode(encoded); }
