'use strict';

import { ouiOf } from './oui-check.js';

// Prefilled GitHub issue links for field reports: things the app derives
// from lookup tables that a user's genuine controller may not be in yet
// (Bluetooth OUIs, serial-number color codes). Reports go to the upstream
// repo so additions benefit everyone using the tool.
const REPORT_REPO = 'https://github.com/dualshock-tools/dualshock-tools.github.io';

function issueUrl(template, title, fields) {
  const params = new URLSearchParams({ template, title, ...fields });
  return `${REPORT_REPO}/issues/new?${params}`;
}

/**
 * Report a genuine controller flagged by the OUI check. Only the OUI
 * (first three octets) is included - the rest of the address identifies
 * the specific device and isn't needed.
 */
export function buildOuiReportUrl(mac, model) {
  const oui = ouiOf(mac) ?? '';
  return issueUrl('oui-report.yml', `OUI whitelist request: ${oui || 'unknown'}`, {
    oui,
    model: model ?? '',
  });
}

/**
 * Report a serial-number color code the app doesn't know. Only the
 * two-character code is included, never the full serial number.
 */
export function buildColorReportUrl(colorCode, model) {
  return issueUrl('color-report.yml', `Unknown color code: ${colorCode}`, {
    colorcode: colorCode ?? '',
    model: model ?? '',
  });
}
