// Shared between background.js (service worker) and preview.js (extension
// page) via importScripts()/<script>. A stitched capture routinely exceeds
// the 64MiB hard cap Chrome puts on a single runtime message — sendResponse
// with a huge data URL just fails silently past that size — so the pixels
// never travel through chrome.runtime messaging. Only a small id does; the
// blob itself goes through IndexedDB, which both contexts share.
const QOL_DB_NAME = "qol-fullpage-capture";
const QOL_STORE_NAME = "captures";
const QOL_CAPTURE_TTL_MS = 10 * 60 * 1000; // stale if a preview tab is never opened

function qolOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QOL_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(QOL_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function qolPutCapture(id, record) {
  const db = await qolOpenDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(QOL_STORE_NAME, "readwrite");
      tx.objectStore(QOL_STORE_NAME).put(record, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Collected once, then dropped — same contract the in-memory version had.
async function qolTakeCapture(id) {
  const db = await qolOpenDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QOL_STORE_NAME, "readwrite");
      const store = tx.objectStore(QOL_STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => store.delete(id);
      tx.oncomplete = () => resolve(getReq.result || null);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Best-effort: drops anything older than the TTL so a capture whose preview
// tab never opened (closed early, browser restarted) doesn't sit in
// IndexedDB forever.
async function qolPruneStaleCaptures() {
  const db = await qolOpenDb();
  try {
    await new Promise((resolve) => {
      const tx = db.transaction(QOL_STORE_NAME, "readwrite");
      const store = tx.objectStore(QOL_STORE_NAME);
      const cutoff = Date.now() - QOL_CAPTURE_TTL_MS;
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if (cursor.value && cursor.value.at < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = resolve; // best-effort — a failed prune isn't worth surfacing
    });
  } finally {
    db.close();
  }
}
