import { LedgerError, type Json } from './types.ts';

/**
 * Canonical JSON (CE-LEDGER-002): object keys sorted by UTF-16 code unit, no whitespace, strings escaped by
 * JSON.stringify and numbers in ECMAScript form, the subset of RFC 8785 that canonical JSON data needs.
 * Throws LedgerError("invalid") on anything that is not canonical JSON data (CE-LEDGER-006).
 */
export function canonicalize(value: unknown): string {
  return write(value, '$', new Set());
}

/** True when value is canonical JSON data. */
export function isJson(value: unknown): value is Json {
  try {
    canonicalize(value);
    return true;
  } catch {
    return false;
  }
}

function write(value: unknown, path: string, seen: Set<object>): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw invalid(path, `${value} is not a finite number`);
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw invalid(path, `a ${typeof value} is not JSON data`);
  }
  const obj = value as object;
  if (seen.has(obj)) throw invalid(path, 'a cycle is not JSON data');
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        if (!(i in obj)) throw invalid(`${path}[${i}]`, 'a sparse array hole is not JSON data');
        parts.push(write(obj[i], `${path}[${i}]`, seen));
      }
      return `[${parts.join(',')}]`;
    }
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      throw invalid(path, `a ${proto?.constructor?.name ?? 'non-plain'} object is not JSON data`);
    }
    if (Object.getOwnPropertySymbols(obj).length > 0) throw invalid(path, 'a symbol key is not JSON data');
    const keys = Object.keys(obj).sort(compareCodeUnits);
    const parts = keys.map((k) => `${JSON.stringify(k)}:${write((obj as Record<string, unknown>)[k], `${path}.${k}`, seen)}`);
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(obj);
  }
}

/** Orders strings by UTF-16 code unit, as RFC 8785 requires (not by locale). */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function invalid(path: string, why: string): LedgerError {
  return new LedgerError('invalid', `${path}: ${why}`);
}
