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
  return _updateRecord(serial, record => { record.owner = owner; });
}

/**
 * Store the repair details for a known controller
 * @param {string} serial - Controller serial number
 * @param {Object} repair - { channel, tech, faultDescription, priceEstimate,
 *                            foundFaults, actualPrice, done }
 * @returns {Object|null} The updated record, or null for unknown serials
 */
export function setRepair(serial, repair) {
  return _updateRecord(serial, record => { record.repair = repair; });
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
