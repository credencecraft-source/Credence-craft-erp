const DATABASE_NAME = "credencecraft-contact-imports";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type ContactImportDraft = {
  file: Blob;
  fileName: string;
  lastModified: number;
  contentType: string;
  phase: "validated" | "importing" | "interrupted";
  processed: number;
  created: number;
  total: number;
  expiresAt: number;
};

type EncryptedContactImportDraft = Omit<ContactImportDraft, "file"> & {
  encryptedFile: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  key: CryptoKey;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support saved import workbooks."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open saved import workbooks."));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T | undefined;
    let hasResult = false;
    request.onsuccess = () => {
      result = request.result;
      hasResult = true;
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error("Unable to access the saved import workbook."));
    };
    transaction.oncomplete = () => {
      database.close();
      if (hasResult) resolve(result as T);
      else reject(new Error("The saved import workbook operation returned no result."));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Unable to save the import workbook."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("The saved import workbook operation was cancelled."));
    };
  }));
}

export async function loadContactImportDraft(key: string): Promise<ContactImportDraft | null> {
  const stored = await withStore<EncryptedContactImportDraft | undefined>("readonly", (store) => store.get(key));
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    await deleteContactImportDraft(key);
    return null;
  }
  const fileBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: stored.iv },
    stored.key,
    stored.encryptedFile,
  );
  return {
    ...stored,
    file: new Blob([fileBuffer], { type: stored.contentType }),
  };
}

export async function saveContactImportDraft(
  key: string,
  file: File,
  progress: Pick<ContactImportDraft, "phase" | "processed" | "created" | "total">,
) {
  if (!crypto?.subtle) throw new Error("Encrypted workbook storage is unavailable in this browser.");
  const encryptionKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const encryptedFile = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    await file.arrayBuffer(),
  );
  const draft: EncryptedContactImportDraft = {
    fileName: file.name,
    lastModified: file.lastModified,
    contentType: file.type,
    encryptedFile,
    iv,
    key: encryptionKey,
    ...progress,
    expiresAt: Date.now() + DRAFT_TTL_MS,
  };
  return withStore<IDBValidKey>("readwrite", (store) => store.put(draft, key)).then(() => undefined);
}

export function deleteContactImportDraft(key: string) {
  return withStore<undefined>("readwrite", (store) => store.delete(key));
}
