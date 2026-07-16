'use strict';

import { l } from './translations.js';

// Bluetooth-address (OUI) based authenticity check.
//
// Genuine DualShock 4 / DualSense controllers get their Bluetooth radio from
// one of Sony's two contract manufacturers, so their MAC OUIs belong to
// Weifang Goertek or Hon Hai / Foxconn. The core of this list is the set of
// OUIs observed across a 100,000-controller sample (getbdaddr telemetry),
// covering 98.9% of that sample, split ~55% Goertek / ~44% Foxconn; a few
// were added later from genuine controllers flagged in the field, after
// confirming in the IEEE registry that the OUI belongs to one of the two
// manufacturers.
// Everything else in the sample (~1.1%) was an unregistered OUI, an all-zero
// address, or a locally-administered address - i.e. clones or spoofed radios.
//
// This is a heuristic, not proof: a genuine controller could ship with a
// newer OUI block not in the sample, so callers should treat a negative as
// "possible clone" (a warning), never as grounds to disable functionality.
const GENUINE_CONTROLLER_OUIS = new Set([
  // Weifang Goertek Electronics
  "D0:BC:C1", "4C:B9:9B", "48:18:8D", "88:03:4C", "24:A6:FA", "A0:AB:51",
  "10:18:49", "90:89:5F", "DC:AF:68", "DC:0C:2D", "A4:53:85", "40:1B:5F",
  "AC:FD:93", "1C:96:5A", "84:17:66", "A4:15:66", "90:B6:85",
  // Hon Hai / Foxconn
  "E8:47:3A", "7C:66:EF", "BC:C7:46", "58:10:31", "AC:36:1B", "84:30:95",
  "A4:AE:11", "1C:A0:B8", "F4:93:9F", "A4:AE:12", "28:C1:3C", "00:1F:E2",
  "70:20:84", "1C:66:6D", "D0:27:88", "00:01:6C", "00:22:68", "90:FB:A6",
  "30:0E:D5", "0C:EE:E6", "14:3A:9A",
]);

/**
 * Extract the OUI (first three octets, uppercase "XX:XX:XX") from a MAC
 * address string, or null if it doesn't look like a MAC.
 */
export function ouiOf(mac) {
  if (typeof mac !== 'string') return null;
  const parts = mac.trim().toUpperCase().split(':');
  if (parts.length < 3 || !parts.slice(0, 3).every(p => /^[0-9A-F]{2}$/.test(p))) {
    return null;
  }
  return parts.slice(0, 3).join(':');
}

/**
 * Check a controller's Bluetooth address for authenticity by its OUI.
 * @param {string} mac - MAC address string, e.g. "f4:93:9f:4d:4b:4a"
 * @returns {{genuine: boolean, reason: string|null}} reason is a localized,
 *   user-facing explanation when not genuine (null when genuine or unknown).
 */
export function checkBdaddrAuthenticity(mac) {
  const oui = ouiOf(mac);
  if (!oui) {
    return { genuine: false, reason: null }; // can't tell; no address to judge
  }

  if (oui === "00:00:00") {
    return { genuine: false, reason: l("the Bluetooth address is unset (all zeros)") };
  }

  const firstOctet = parseInt(oui.slice(0, 2), 16);
  if (firstOctet & 0x01) {
    return { genuine: false, reason: l("the Bluetooth address is a multicast address, not a real device address") };
  }
  if (firstOctet & 0x02) {
    return { genuine: false, reason: l("the Bluetooth address is locally administered, not a factory address") };
  }

  if (GENUINE_CONTROLLER_OUIS.has(oui)) {
    return { genuine: true, reason: null };
  }

  // reportable: a genuine controller could carry an OUI block we haven't
  // seen yet, so this case (unlike the structural failures above) is worth
  // reporting for whitelisting
  return {
    genuine: false,
    reason: l("the Bluetooth address is not from a known Sony controller manufacturer"),
    reportable: true,
  };
}

