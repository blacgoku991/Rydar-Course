import "server-only";
import { env } from "@/lib/env";

/**
 * Petit stockage clé/valeur :
 *  - Upstash Redis (ou Vercel KV) si configuré → fiable entre instances serverless ;
 *  - sinon mémoire du processus (suffisant pour démarrer, remis à zéro à chaque déploiement).
 */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  /** Pose la clé seulement si elle n'existe pas. true = posée. */
  setNX(key: string, value: string, ttlSec: number): Promise<boolean>;
  incr(key: string, ttlSec: number): Promise<number>;
  del(key: string): Promise<void>;
  readonly kind: "redis" | "memory";
}

class MemoryKV implements KV {
  readonly kind = "memory" as const;
  private data = new Map<string, { v: string; exp: number }>();

  private live(key: string) {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return e;
  }

  private sweep() {
    if (this.data.size < 5000) return;
    const now = Date.now();
    for (const [k, e] of this.data) if (e.exp < now) this.data.delete(k);
  }

  async get(key: string) {
    return this.live(key)?.v ?? null;
  }
  async set(key: string, value: string, ttlSec: number) {
    this.sweep();
    this.data.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
  }
  async setNX(key: string, value: string, ttlSec: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSec);
    return true;
  }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (e ? Number(e.v) : 0) + 1;
    this.data.set(key, { v: String(n), exp: e ? e.exp : Date.now() + ttlSec * 1000 });
    return n;
  }
  async del(key: string) {
    this.data.delete(key);
  }
}

class UpstashKV implements KV {
  readonly kind = "redis" as const;
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || json.error) throw new Error(`Upstash: ${json.error ?? res.status}`);
    return json.result as T;
  }

  async get(key: string) {
    return this.cmd<string | null>("GET", key);
  }
  async set(key: string, value: string, ttlSec: number) {
    await this.cmd("SET", key, value, "EX", Math.max(1, Math.round(ttlSec)));
  }
  async setNX(key: string, value: string, ttlSec: number) {
    const r = await this.cmd<string | null>("SET", key, value, "NX", "EX", Math.max(1, Math.round(ttlSec)));
    return r === "OK";
  }
  async incr(key: string, ttlSec: number) {
    const n = await this.cmd<number>("INCR", key);
    if (n === 1) await this.cmd("EXPIRE", key, Math.max(1, Math.round(ttlSec)));
    return n;
  }
  async del(key: string) {
    await this.cmd("DEL", key);
  }
}

const globalForKV = globalThis as unknown as { __rydarKV?: KV };

export function kv(): KV {
  if (!globalForKV.__rydarKV) {
    const url = env.upstashUrl;
    const token = env.upstashToken;
    globalForKV.__rydarKV = url && token ? new UpstashKV(url.replace(/\/+$/, ""), token) : new MemoryKV();
  }
  return globalForKV.__rydarKV;
}
