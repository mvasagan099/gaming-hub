/**
 * JSON-serializable value used for opaque game state payloads that cross the
 * network boundary. Game engines always operate on these shapes so state can
 * be persisted, replayed and reconnected deterministically.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type Json = JsonValue;
