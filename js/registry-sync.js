'use strict';

import { Storage } from './storage.js';
import { exportRegistry, importRegistry, onRegistryChange } from './controller-registry.js';

/**
 * Registry sync over a shared folder
 *
 * Shares the controller registry between shop computers through a folder
 * that all of them can reach (a NAS share, or a Dropbox/Drive folder kept
 * in sync by its desktop client), accessed with the File System Access API.
 *
 * Each station writes only its own `registry-<stationId>.json`, so there
 * are never write conflicts, and reads + merges every other station's file
 * (rules in controller-registry.js). Merging is idempotent, so re-reading
 * unchanged files is harmless.
 *
 * The folder handle is persisted in IndexedDB (localStorage cannot hold
 * handles). After a browser restart the permission usually degrades to
 * 'prompt', and re-granting requires a user gesture; init reports the
 * 'reconnect' status so the UI can offer a click-to-reconnect.
 */

const IDB_NAME = 'dualshock-tools-sync';
const IDB_STORE = 'handles';
const IDB_DIR_KEY = 'sharedFolder';
const STATION_FILE_RE = /^registry-.+\.json$/i;
const SYNC_DEBOUNCE_MS = 2000;

let dirHandle = null;
let syncing = false;
let syncTimer = null;
let statusListener = null;

export function isSyncSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

// status: 'off' | 'reconnect' | 'syncing' | 'ok' | 'error'
function setStatus(status, detail = null) {
  statusListener?.(status, detail);
}

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbRequest(mode, operate) {
  const db = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const req = operate(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

const idbGet = (key) => idbRequest('readonly', store => store.get(key));
const idbSet = (key, value) => idbRequest('readwrite', store => store.put(value, key));
const idbDelete = (key) => idbRequest('readwrite', store => store.delete(key));

function stationFileName() {
  return `registry-${Storage.syncStationId.get()}.json`;
}

/**
 * Restore the persisted folder handle and start syncing (silently when the
 * permission survived, otherwise report 'reconnect' and wait for a click).
 * Also hooks registry changes so every local write schedules a sync.
 * @param {Function} onStatus - (status, detail) => void for the UI
 */
export async function initRegistrySync(onStatus) {
  statusListener = onStatus;
  if (!isSyncSupported()) return;

  onRegistryChange(scheduleSync);

  try {
    dirHandle = await idbGet(IDB_DIR_KEY) || null;
  } catch (e) {
    console.warn('sync: failed to restore folder handle:', e);
    dirHandle = null;
  }
  if (!dirHandle) {
    setStatus('off');
    return;
  }

  const permission = await dirHandle.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    await syncNow();
  } else {
    setStatus('reconnect');
  }
}

/**
 * Pick (or re-pick) the shared folder. Must be called from a user gesture.
 * Names the station on first use — the name only shows up in the file name,
 * so collisions between stations are what matters, not pretty formatting.
 */
export async function chooseSharedFolder() {
  const handle = await window.showDirectoryPicker({ id: 'registry-sync', mode: 'readwrite' });

  if (!Storage.syncStationId.get()) {
    const suggested = `station-${Math.random().toString(36).slice(2, 6)}`;
    const name = window.prompt('Name this computer (used in its sync file name):', suggested);
    const cleaned = (name || suggested).trim().replace(/[^\w-]+/g, '-') || suggested;
    Storage.syncStationId.set(cleaned);
  }

  await idbSet(IDB_DIR_KEY, handle);
  dirHandle = handle;
  await syncNow();
}

/**
 * Re-grant access to the stored folder after a browser restart.
 * Must be called from a user gesture.
 * @returns {boolean} Whether access was granted
 */
export async function reconnectSync() {
  if (!dirHandle) return false;
  const permission = await dirHandle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    setStatus('reconnect');
    return false;
  }
  await syncNow();
  return true;
}

export function isSyncConfigured() {
  return dirHandle !== null;
}

/**
 * Stop syncing and forget the folder. Local data and the station's file in
 * the shared folder are left as they are.
 */
export async function disconnectSync() {
  await idbDelete(IDB_DIR_KEY);
  dirHandle = null;
  setStatus('off');
}

// Debounced sync so a burst of writes (connect + owner save) becomes one
// folder pass. Changes applied by a running sync are ignored: pulls would
// otherwise re-trigger forever.
function scheduleSync() {
  if (!dirHandle || syncing) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow().catch(e => console.warn('sync: background sync failed:', e));
  }, SYNC_DEBOUNCE_MS);
}

/**
 * One full sync pass: merge every other station's file, then write our own
 * with the merged registry. Unreadable neighbor files are skipped (another
 * station may be mid-write); our own write is atomic via createWritable.
 */
export async function syncNow() {
  if (!dirHandle || syncing) return;
  syncing = true;
  clearTimeout(syncTimer);
  setStatus('syncing');

  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file' || !STATION_FILE_RE.test(entry.name)) continue;
      if (entry.name === stationFileName()) continue;
      try {
        const text = await (await entry.getFile()).text();
        importRegistry(JSON.parse(text));
      } catch (e) {
        console.warn(`sync: skipping unreadable ${entry.name}:`, e);
      }
    }

    const fileHandle = await dirHandle.getFileHandle(stationFileName(), { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(exportRegistry(), null, 2));
    await writable.close();

    setStatus('ok', new Date());
  } catch (e) {
    setStatus('error', e);
    throw e;
  } finally {
    syncing = false;
  }
}
