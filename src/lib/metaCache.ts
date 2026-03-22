import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface MetaCacheEntry<T = unknown> {
  storedAtMs: number;
  ttlMs: number;
  data: T;
}

export class MetaDiskCache {
  private readonly ready: Promise<void>;

  constructor(
    private readonly baseDir: string,
    private readonly enabled: boolean
  ) {
    this.ready = this.enabled ? this.ensureDir() : Promise.resolve();
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch {
      // Caller treats cache as best-effort; directory creation failure disables writes only.
    }
  }

  private filePath(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return join(this.baseDir, `${hash}.json`);
  }

  async get<T>(key: string): Promise<MetaCacheEntry<T> | null> {
    if (!this.enabled) {
      return null;
    }
    await this.ready;
    try {
      const raw = await readFile(this.filePath(key), "utf8");
      const parsed = JSON.parse(raw) as MetaCacheEntry<T>;
      if (
        typeof parsed.storedAtMs !== "number" ||
        typeof parsed.ttlMs !== "number" ||
        parsed.data === undefined
      ) {
        return null;
      }
      if (Date.now() > parsed.storedAtMs + parsed.ttlMs) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, ttlMs: number, data: T): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }
    await this.ready;
    const entry: MetaCacheEntry<T> = {
      storedAtMs: Date.now(),
      ttlMs,
      data
    };
    try {
      await writeFile(
        this.filePath(key),
        JSON.stringify(entry),
        "utf8"
      );
      return true;
    } catch {
      return false;
    }
  }
}
