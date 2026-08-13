/**
 * Cache curto (TTL) em sessionStorage para consultas repetidas.
 * Evita reexecutar RPCs pesadas quando o usuário volta a um filtro/página
 * já consultado nos últimos minutos.
 */

const PREFIX = "sc:";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 60;

type Entry<T> = { v: T; e: number };

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Chave estável a partir de um objeto de argumentos. */
export function cacheKey(namespace: string, args: unknown): string {
  const json = JSON.stringify(args, (_k, v) => (v === undefined ? null : v));
  let hash = 5381;
  for (let i = 0; i < json.length; i++) hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  return `${PREFIX}${namespace}:${(hash >>> 0).toString(36)}:${json.length}`;
}

export function readCache<T>(key: string): T | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.e !== "number" || entry.e < Date.now()) {
      store.removeItem(key);
      return null;
    }
    return entry.v;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  const store = safeStorage();
  if (!store) return;
  try {
    pruneIfNeeded(store);
    store.setItem(key, JSON.stringify({ v: value, e: Date.now() + ttlMs } satisfies Entry<T>));
  } catch {
    // quota cheia ou storage indisponível: cache é best-effort
    clearNamespace();
  }
}

function pruneIfNeeded(store: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  if (keys.length < MAX_ENTRIES) return;
  // remove expirados primeiro; se ainda estiver cheio, remove os mais antigos
  const remaining: { k: string; e: number }[] = [];
  for (const k of keys) {
    try {
      const entry = JSON.parse(store.getItem(k) || "{}") as Entry<unknown>;
      if (!entry?.e || entry.e < Date.now()) store.removeItem(k);
      else remaining.push({ k, e: entry.e });
    } catch {
      store.removeItem(k);
    }
  }
  remaining
    .sort((a, b) => a.e - b.e)
    .slice(0, Math.max(0, remaining.length - MAX_ENTRIES + 1))
    .forEach((r) => store.removeItem(r.k));
}

/** Limpa todo o cache curto (usar após ingestão/atualização de dados). */
export function clearNamespace(namespace?: string): void {
  const store = safeStorage();
  if (!store) return;
  const target = namespace ? `${PREFIX}${namespace}:` : PREFIX;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(target)) keys.push(k);
  }
  keys.forEach((k) => store.removeItem(k));
}
