# DS4 Trigger Calibration — findings (not implemented)

The DualShock 4 exposes an L2/R2 trigger calibration over feature report
`0x90`, the same command family used for stick calibration. It was prototyped
and **deliberately not shipped**: the protocol works, but the results are
unreliable and can leave a trigger worse than before, with no in-tool undo.
This matches the upstream author's decision to include trigger calibration in
the standalone `ds4-tools` CLI but **omit it from this web tool**.

## Protocol (verified on a genuine JDM-001)

Commands are `0x90` writes; status is read back from `0x91`/`0x92`, exactly
like stick calibration. Trigger uses `deviceId = 3` (sticks use `1`).

- Begin: `0x90 = [1, 3, 0, 3]`
- Sample: `0x90 = [3, 3, position, trigger]` — `position` 1=released, 2=mid,
  3=full; `trigger` 1=L2, 2=R2. The CLI samples each position twice.
- Store: `0x90 = [2, 3, 0, 3]`

The controller acknowledges every step. `0x91` returns
`[0x91, deviceId, targetId, status]`:

| Step   | 0x91         | 0x92         |
|--------|--------------|--------------|
| begin  | `91 03 00 01`| `92 03 00 FF`|
| sample | `91 03 00 01`| `92 03 00 FF`|
| store  | `91 03 00 02`| `92 03 00 01`|

This is the same state machine as sticks (`01` calibrating → `02` stored,
`0x92` `FF` → `01` committed), just with `deviceId 03`. So the protocol is
genuinely accepted and applied — it is **not** a no-op.

## Why it was not shipped

1. **It can degrade a good trigger.** A deliberate miscalibration (sampling
   "released" while fully pressed, etc.) reduced L2's usable range to
   ~62–65% of travel.
2. **Not cleanly reversible in-tool.** After degrading the trigger, repeated
   correct recalibration did not restore full range (it stayed capped around
   65%). There is no factory-reset command for trigger calibration here;
   recovery appears to require an actual PS4 re-running its own calibration.
3. **Sampling is imprecise / fragile.** The "mid" point is inherently vague,
   and the sampled value depends on holding the trigger perfectly steady at
   the instant of sampling — easy to get wrong, with permanent effect.
4. **The obvious UI guide is misleading.** A live trigger bar shows the value
   *after* the current (possibly bad) calibration, so it cannot be trusted to
   position the trigger while calibrating — exactly when you need a reference.

## Conclusion

Unlike the stick calibration — where the firmware validates the result and
the change is safe and reversible — trigger calibration can permanently worsen
a controller with no recovery path inside this tool. Not worth the risk.
Prototype reverted.
