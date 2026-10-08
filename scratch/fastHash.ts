export function calculateStateHashFast(obj: unknown): string {
  if (obj === null || obj === undefined) return "0";
  
  // Custom deterministic stringify
  const json = deterministicStringify(obj);
  
  // MurmurHash3-like logic
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function deterministicStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    let out = "[";
    for (let i = 0; i < obj.length; i++) {
      if (i > 0) out += ",";
      out += (obj[i] === undefined ? "null" : deterministicStringify(obj[i]));
    }
    return out + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  let out = "{";
  let first = true;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined) {
      if (!first) out += ",";
      out += JSON.stringify(key) + ":" + deterministicStringify(val);
      first = false;
    }
  }
  return out + "}";
}
