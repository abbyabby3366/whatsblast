import type { CacheStore } from 'baileys';

/**
 * High-performance, strictly bounded in-memory cache for Baileys Signal keys and socket operations.
 * - Enforces hard key limit (FIFO eviction) to prevent memory growth.
 * - TTL expiration on read without background setInterval timers.
 * - Clean close() / flushAll() methods to guarantee full resource teardown on session close.
 */
export class BoundedSignalCache implements CacheStore {
  private store = new Map<string, { val: any; exp: number }>();
  private readonly maxKeys: number;
  private readonly ttlMs: number;

  constructor(maxKeys = 1500, ttlSeconds = 300) {
    this.maxKeys = maxKeys;
    this.ttlMs = ttlSeconds * 1000;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.exp) {
      this.store.delete(key);
      return undefined;
    }
    return entry.val as T;
  }

  set<T>(key: string, value: T): void {
    if (this.store.size >= this.maxKeys) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
    this.store.set(key, { val: value, exp: Date.now() + this.ttlMs });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  flushAll(): void {
    this.store.clear();
  }

  close(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
