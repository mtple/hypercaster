/**
 * This browser's signing key.
 *
 * The key is an Ed25519 key pair made by the browser's own cryptography.
 * The private half is created non-extractable: scripts on this page can
 * ask it to sign, but cannot read it, export it or send it anywhere. It is
 * kept in IndexedDB, which stores such keys without exposing them.
 */
import type { Fid } from '~/hypersnap/types';
import { WriteError } from '~/hypersnap/writes/errors';
import type { MessageSigner } from '~/hypersnap/writes/messages';

const DATABASE = 'hypercast';
const STORE = 'signing-keys';

type StoredKey = {
  publicKey: Uint8Array;
  privateKey: CryptoKey;
  createdAt: number;
};

type KeyStore = {
  load: (fid: Fid) => Promise<StoredKey | null>;
  save: (fid: Fid, key: StoredKey) => Promise<void>;
  remove: (fid: Fid) => Promise<void>;
};

const ED25519 = { name: 'Ed25519' } as const;

async function createKey(): Promise<StoredKey> {
  let pair: CryptoKeyPair;
  try {
    pair = (await crypto.subtle.generateKey(ED25519, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
  } catch {
    throw new WriteError(
      'unsupported',
      'This browser cannot create the kind of signing key the network uses. Try a current version of Chrome, Firefox or Safari.',
    );
  }
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  );
  return { publicKey, privateKey: pair.privateKey, createdAt: Date.now() };
}

function toMessageSigner(key: StoredKey): MessageSigner {
  return {
    publicKey: key.publicKey,
    sign: async (payload) =>
      new Uint8Array(
        await crypto.subtle.sign(
          ED25519,
          key.privateKey,
          payload as Uint8Array<ArrayBuffer>,
        ),
      ),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new WriteError(
          'unsupported',
          'This browser has no place to keep a signing key (private browsing can cause this).',
        ),
      );
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new WriteError(
          'unsupported',
          'This browser would not open storage for the signing key.',
        ),
      );
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

const isStoredKey = (value: unknown): value is StoredKey =>
  typeof value === 'object' &&
  value !== null &&
  (value as StoredKey).publicKey instanceof Uint8Array &&
  (value as StoredKey).publicKey.length === 32 &&
  typeof (value as StoredKey).privateKey === 'object';

/** Keys kept in IndexedDB, one per account. */
const browserKeyStore: KeyStore = {
  async load(fid) {
    const value = await withStore<unknown>('readonly', (store) =>
      store.get(fid),
    );
    return isStoredKey(value) ? value : null;
  },
  async save(fid, key) {
    await withStore('readwrite', (store) => store.put(key, fid));
  },
  async remove(fid) {
    await withStore('readwrite', (store) => store.delete(fid));
  },
};

/** Keys kept in memory only. For tests. */
function memoryKeyStore(): KeyStore {
  const keys = new Map<Fid, StoredKey>();
  return {
    load: async (fid) => keys.get(fid) ?? null,
    save: async (fid, key) => {
      keys.set(fid, key);
    },
    remove: async (fid) => {
      keys.delete(fid);
    },
  };
}

export { browserKeyStore, createKey, memoryKeyStore, toMessageSigner };
export type { KeyStore, StoredKey };
