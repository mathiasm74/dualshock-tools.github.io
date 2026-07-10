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
 * lastSeen = max, connectCount = sum, union of serials):
 * {
 *   serial: "G129007VN10806085",
 *   model: "DS5",
 *   deviceName: "DualSense Controller",
 *   firstSeen: "2026-07-11T09:14:00.000Z",
 *   lastSeen: "2026-07-11T09:14:00.000Z",
 *   connectCount: 3
 * }
 */

/**
 * Record a controller connection: insert a new record for an unseen serial,
 * or update lastSeen/connectCount (and refresh metadata) for a known one.
 * @param {Object} info - { serial, model, deviceName }
 * @returns {Object|null} The stored record, or null when there is no serial
 */
export function recordConnection({ serial, model, deviceName }) {
  if (!serial) return null;

  const records = Storage.connectedControllers.get();
  const now = new Date().toISOString();
  const existing = records[serial];

  const record = {
    serial,
    model: model || existing?.model || null,
    deviceName: deviceName || existing?.deviceName || null,
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
    connectCount: (existing?.connectCount || 0) + 1,
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
