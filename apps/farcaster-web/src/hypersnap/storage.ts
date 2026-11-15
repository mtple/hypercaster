/**
 * Device-local persistence under one versioned namespace.
 *
 * Nothing stored here is ever sent anywhere. Reads and writes never throw:
 * private browsing modes and full disks degrade to in-memory state.
 */

const NAMESPACE = 'hypercast:v1:';

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();
const memory = new Map<string, string>();

function nativeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

function readRaw(key: string): string | null {
  const fullKey = NAMESPACE + key;
  try {
    const stored = nativeStorage()?.getItem(fullKey);
    if (stored !== null && stored !== undefined) {
      return stored;
    }
  } catch {
    // Fall through to memory.
  }
  return memory.get(fullKey) ?? null;
}

function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = readRaw(key);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const fullKey = NAMESPACE + key;
  const serialized = JSON.stringify(value);
  memory.set(fullKey, serialized);
  try {
    nativeStorage()?.setItem(fullKey, serialized);
  } catch {
    // Kept in memory for this session only.
  }
  notify(key);
}

function remove(key: string): void {
  const fullKey = NAMESPACE + key;
  memory.delete(fullKey);
  try {
    nativeStorage()?.removeItem(fullKey);
  } catch {
    // Nothing to do.
  }
  notify(key);
}

/** Removes everything this app has stored on the device. */
function clearAll(): void {
  const keys = new Set<string>();
  memory.forEach((_value, fullKey) => keys.add(fullKey));
  try {
    const storage = nativeStorage();
    if (storage) {
      for (let i = 0; i < storage.length; i += 1) {
        const fullKey = storage.key(i);
        if (fullKey?.startsWith(NAMESPACE)) {
          keys.add(fullKey);
        }
      }
      keys.forEach((fullKey) => storage.removeItem(fullKey));
    }
  } catch {
    // Nothing to do.
  }
  memory.clear();
  keys.forEach((fullKey) => notify(fullKey.slice(NAMESPACE.length)));
}

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === NAMESPACE + key || event.key === null) {
      listener();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    set?.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export { clearAll, NAMESPACE, readJson, readRaw, remove, subscribe, writeJson };
