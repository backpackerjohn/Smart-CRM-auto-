// IndexedDB-based capture queue for mobile offline tolerance.
// When the rep captures a photo and the upload fails (no signal / timeout),
// the capture gets stashed locally and drained on the next online event.

const DB_NAME = "smart-crm-offline";
const DB_VERSION = 1;
const STORE = "capture-queue";

export interface QueuedCapture {
  id: string;
  createdAt: number;
  dealId: string | null;
  kind: string;
  assignedTo: string;
  device: string;
  createNewDeal: boolean;
  blob: Blob;
  filename: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueCapture(
  item: Omit<QueuedCapture, "id" | "createdAt">,
): Promise<string> {
  const id = crypto.randomUUID();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...item, id, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return id;
}

export async function listPending(): Promise<QueuedCapture[]> {
  const db = await openDb();
  const items = await new Promise<QueuedCapture[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedCapture[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function removePending(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function countPending(): Promise<number> {
  const db = await openDb();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}

/**
 * Walk the queue and attempt to upload each item. Removes successfully sent
 * items. Returns counts. Safe to call on load + on 'online' event.
 */
export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  const items = await listPending();
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    const fd = new FormData();
    fd.set("file", item.blob, item.filename);
    fd.set("kind", item.kind);
    fd.set("assignedTo", item.assignedTo);
    fd.set("device", item.device);
    if (item.dealId) fd.set("dealId", item.dealId);
    if (item.createNewDeal) fd.set("createNewDeal", "1");

    try {
      const res = await fetch("/api/captures", { method: "POST", body: fd });
      if (res.ok) {
        await removePending(item.id);
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
