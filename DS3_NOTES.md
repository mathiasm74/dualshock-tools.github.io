# DualShock 3 (SIXAXIS) Notes

Reference notes for the DualShock 3 support in this tool, and a plan for the
not-yet-implemented flash calibration.

## Connecting

The DS3 enumerates as HID but stays **silent until it is set operational**.
Over USB the tool:

1. Reads feature report **`0xF2`** on connect (a standard HID GET_REPORT that
   macOS passes through even though it is not in the report descriptor). This
   sets the controller operational.
2. Prompts the user to press the **PS button** to wake the controller (a USB
   DS3 sleeps when idle). Only then do input reports start flowing.

No WebUSB, driver swap, or native app is needed — plain WebHID works.

### Things that do NOT work on macOS (verified)

- **SET feature report** is rejected (macOS validates feature-report writes
  against the descriptor). Only GET feature reports pass through.
- Sending a report as an **output report** works, but trips a macOS
  screen-recording / Input Monitoring permission prompt.

This matters for flash access below.

## Input report layout (USB, WebHID strips the report ID)

Offsets are one less than the report-ID-counted docs. Verified against
hardware via the on-screen button display.

| Bytes | Meaning |
|-------|---------|
| 1     | select `0x01`, l3 `0x02`, r3 `0x04`, start `0x08`, up `0x10`, right `0x20`, down `0x40`, left `0x80` |
| 2     | l2 `0x01`, r2 `0x02`, l1 `0x04`, r1 `0x08`, triangle `0x10`, circle `0x20`, cross `0x40`, square `0x80` |
| 3     | ps `0x01` |
| 5–8   | LX, LY, RX, RY |
| 17–18 | L2, R2 analog pressure |

The dpad is four discrete bits (not a hat), parsed in
`parseDeviceSpecificInputs`. The DS3 reuses the DualShock 4 SVG artwork.

## Flash calibration (NOT implemented — plan)

The DS3 **does** store stick-center calibration in flash, read/written via
feature report **`0xF1`**. It is deferred because a bad write can brick the
controller, and because of the macOS blocker below.

### ⚠️ macOS blocker

The flash read requires a **SET feature report** (a page-select command)
before each GET. macOS WebHID rejects SET feature reports (see above), so
this feature is **likely Linux/Windows only** and probably will not work on
macOS via WebHID. **Phase 0 must confirm this before any build.**

### Protocol

From the [DS3 Input & Report Inspector](https://github.com/lewy20041/DS3_Input_And_Report_Inspector)
source. All transactions are on feature report `0xF1`.

**Read** (16 bytes per transaction; 16 transactions × 2 banks = 512 bytes):

1. `sendFeatureReport(0xF1, [0x00, 0x0B, 0xFF, 0xFF, bank, page, 0xFF, 0x10, 0xFF])`
   — `0x0B` = read command, `bank` 0/1, `page` steps of `0x10`.
2. `receiveFeatureReport(0xF1)` → 64 bytes. Valid if `raw[0] == 0x57`; the
   16 data bytes are at `raw[5 : 5+16]`.

**Write** (16-byte chunks, 50 ms apart):

- `sendFeatureReport(0xF1, [0x00, 0x0A, 0xFF, 0xFF, bank, address, 16, ...16 data bytes])`
  — `0x0A` = write command.

**Calibration location** — bank 0 (A), no unlock needed:

- 4-pin sticks: address `0x20`, 8 bytes = LX/LY/RX/RY as int16 little-endian
  center values.
- 3-pin sticks: address `0x46`, 16 bytes.

### Phased plan

- **Phase 0 — feasibility spike (do first, throwaway).** One flash read in the
  Debug tab; test on macOS *and* Linux/Windows. Decides whether the feature is
  viable at all, and on which OSes. Everything below is contingent on this.
- **Phase 1 — read-only dump/backup (low risk).** Full 512-byte read of both
  banks; display as hex + download as `.bin`. No writes. Immediately useful and
  the safety foundation for writes.
- **Phase 2 — parse & display (read-only).** Show current LX/LY/RX/RY centers
  next to the live stick position so a tech can see the drift.
- **Phase 3 — write calibration (high risk, gated).** Only after 1–2 are solid
  and hardware-tested.

### Safety design (Phase 3)

- **Mandatory auto-backup** immediately before any write.
- **Read-modify-write**: touch only the 8/16 calibration bytes, preserve the
  rest of the page (avoids corrupting adjacent flash).
- **Verify-after-write**: read back and compare; abort/alert on mismatch.
- **Pin-layout confirmation**: 4-pin and 3-pin use different offsets; a wrong
  guess corrupts flash, so this must be confirmed, not assumed.
- **Gated behind the Debug / experimental UI**, never the main calibration flow.
