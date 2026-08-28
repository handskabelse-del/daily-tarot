/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly DAILY_TAROT_KV?: KVNamespace;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
