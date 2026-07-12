'use strict';

import { Storage } from './storage.js';

/**
 * Controller Registry
 *
 * Local record of every controller that has been connected, keyed by serial
 * number. All reads and writes go through this module so the storage backend
 * can be extended later (e.g. a shared per-station file merged across repair
 * bench computers) without touching the callers.
 *
 * Record shape (designed to merge across stations: firstSeen = min,
 * lastSeen = max, connectCount = max, owner/repair by newest updatedAt,
 * union of serials):
 * {
 *   serial: "G129007VN10806085",
 *   model: "DS5",
 *   deviceName: "DualSense Controller",
 *   firstSeen: "2026-07-11T09:14:00.000Z",
 *   lastSeen: "2026-07-11T09:14:00.000Z",
 *   connectCount: 3
 * }
 */

// Versioned envelope for registry files (export/import and, later, shared
// per-station files). Bump the version when the stored data changes shape
// and add a migration step in importRegistry.
export const REGISTRY_FILE_FORMAT = 'dualshock-tools/controller-registry';
export const REGISTRY_FILE_VERSION = 1;

/**
 * Record a controller connection: insert a new record for an unseen serial,
 * or update lastSeen/connectCount (and refresh metadata) for a known one.
 * @param {Object} info - { serial, model, deviceName }
 * @returns {Object|null} The stored record, or null when there is no serial
 */
export function recordConnection({ serial, model, deviceName, boardModel, color }) {
  if (!serial) return null;

  const records = Storage.connectedControllers.get();
  const now = new Date().toISOString();
  const existing = records[serial];

  const record = {
    serial,
    model: model || existing?.model || null,
    deviceName: deviceName || existing?.deviceName || null,
    boardModel: boardModel || existing?.boardModel || null,
    color: color || existing?.color || null,
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
    connectCount: (existing?.connectCount || 0) + 1,
    owner: existing?.owner || null,
    repair: existing?.repair || null,
  };

  records[serial] = record;
  Storage.connectedControllers.set(records);
  return record;
}

/**
 * All known controller records, keyed by serial number
 */
export function getAllControllers() {
  return Storage.connectedControllers.get();
}

/**
 * A single controller record by serial number, or null
 */
export function getController(serial) {
  return serial ? getAllControllers()[serial] || null : null;
}

/**
 * Store the owner details for a known controller
 * @param {string} serial - Controller serial number
 * @param {Object} owner - { name, phone, address }
 * @returns {Object|null} The updated record, or null for unknown serials
 */
export function setOwner(serial, owner) {
  return _updateRecord(serial, record => {
    record.owner = { ...owner, updatedAt: new Date().toISOString() };
  });
}

/**
 * Store the repair details for a known controller
 * @param {string} serial - Controller serial number
 * @param {Object} repair - { channel, tech, faultDescription, priceEstimate,
 *                            foundFaults, actualPrice, done }
 * @returns {Object|null} The updated record, or null for unknown serials
 */
export function setRepair(serial, repair) {
  return _updateRecord(serial, record => {
    record.repair = { ...repair, updatedAt: new Date().toISOString() };
  });
}

function _updateRecord(serial, mutate) {
  if (!serial) return null;

  const records = Storage.connectedControllers.get();
  const record = records[serial];
  if (!record) return null;

  mutate(record);
  Storage.connectedControllers.set(records);
  return record;
}

/**
 * The full registry wrapped in the versioned file envelope, ready to be
 * serialized to a registry file.
 */
export function exportRegistry() {
  return {
    format: REGISTRY_FILE_FORMAT,
    version: REGISTRY_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    controllers: getAllControllers(),
  };
}

/**
 * Merge a parsed registry file into the local registry. Importing is
 * idempotent: bringing in the same file twice changes nothing.
 * @param {Object} data - Parsed contents of a registry file
 * @returns {{added: number, merged: number}} Import counts
 * @throws {Error} When the data is not a registry file or from a newer version
 */
export function importRegistry(data) {
  if (data?.format !== REGISTRY_FILE_FORMAT || typeof data.controllers !== 'object') {
    throw new Error('not a controller registry file');
  }
  if (typeof data.version !== 'number' || data.version > REGISTRY_FILE_VERSION) {
    throw new Error(`registry file version ${data.version} is newer than this app understands (${REGISTRY_FILE_VERSION})`);
  }
  // When REGISTRY_FILE_VERSION grows past 1, migrate older files here before merging

  const records = Storage.connectedControllers.get();
  let added = 0;
  let merged = 0;
  for (const [serial, incoming] of Object.entries(data.controllers || {})) {
    if (!serial || !incoming) continue;
    if (records[serial]) {
      records[serial] = _mergeRecords(records[serial], incoming);
      merged++;
    } else {
      records[serial] = _normalizeRecord(incoming, serial);
      added++;
    }
  }
  Storage.connectedControllers.set(records);
  return { added, merged };
}

// Force an imported record into the canonical shape, dropping unknown
// fields. Keeps imports idempotent: an added record and a merged one
// serialize identically.
function _normalizeRecord(record, serial) {
  return {
    serial,
    model: record.model || null,
    deviceName: record.deviceName || null,
    boardModel: record.boardModel || null,
    color: record.color || null,
    firstSeen: record.firstSeen || null,
    lastSeen: record.lastSeen || null,
    connectCount: record.connectCount || 0,
    owner: record.owner || null,
    repair: record.repair || null,
  };
}

// Merge two records for the same controller. ISO timestamps compare
// correctly as strings.
function _mergeRecords(a, b) {
  // The record seen more recently wins the descriptive fields
  const newer = (a.lastSeen || '') >= (b.lastSeen || '') ? a : b;
  const older = newer === a ? b : a;
  const minSeen = [a.firstSeen, b.firstSeen].filter(Boolean).sort()[0] || null;
  return {
    serial: a.serial,
    model: newer.model || older.model || null,
    deviceName: newer.deviceName || older.deviceName || null,
    boardModel: newer.boardModel || older.boardModel || null,
    color: newer.color || older.color || null,
    firstSeen: minSeen,
    lastSeen: newer.lastSeen || older.lastSeen || null,
    // max, not sum: re-importing the same file must not double-count
    connectCount: Math.max(a.connectCount || 0, b.connectCount || 0),
    owner: _newestDetails(a.owner, b.owner),
    repair: _newestDetails(a.repair, b.repair),
  };
}

// Pick the owner/repair object edited last; details without an updatedAt
// (stored before timestamps existed) count as oldest
function _newestDetails(a, b) {
  if (!a || !b) return a || b || null;
  return (a.updatedAt || '') >= (b.updatedAt || '') ? a : b;
}
