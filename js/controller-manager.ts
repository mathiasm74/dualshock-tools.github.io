"use strict";

import { sleep, la } from "./utils.js";
import type { NvStatus, ControllerInfo, FlashResult, CalibrationResult } from "../types/controllers.js";

// Type definitions for ControllerManager
interface StickPosition {
  x: number;
  y: number;
}

interface StickStates {
  left: StickPosition;
  right: StickPosition;
}

// Define specific button names for better type safety
type DPadDirection = "up" | "down" | "left" | "right";
type AnalogTrigger = "l2_analog" | "r2_analog";
type ButtonName =
  | "square"
  | "cross"
  | "circle"
  | "triangle"
  | "l1"
  | "r1"
  | "l2"
  | "r2"
  | "l3"
  | "r3"
  | "share"
  | "options"
  | "ps"
  | "touchpad"
  | DPadDirection;

interface ButtonStates {
  sticks: StickStates;
  // D-pad buttons
  up?: boolean;
  down?: boolean;
  left?: boolean;
  right?: boolean;
  // Face buttons
  square?: boolean;
  cross?: boolean;
  circle?: boolean;
  triangle?: boolean;
  // Shoulder buttons
  l1?: boolean;
  r1?: boolean;
  l2?: boolean;
  r2?: boolean;
  l3?: boolean;
  r3?: boolean;
  // System buttons
  share?: boolean;
  options?: boolean;
  ps?: boolean;
  touchpad?: boolean;
  // Analog trigger values
  l2_analog?: number;
  r2_analog?: number;
  // Allow additional dynamic properties for extensibility
  [key: string]: boolean | number | StickStates | undefined;
}

interface TouchPoint {
  active: boolean;
  id: number;
  x: number;
  y: number;
}

interface BatteryStatus {
  bat_txt: string;
  changed: boolean;
  bat_capacity: number;
  cable_connected: boolean;
  is_charging: boolean;
  is_error: boolean;
}

interface BatteryInfo {
  bat_capacity: number;
  cable_connected: boolean;
  is_charging: boolean;
  is_error: boolean;
}

interface ButtonMapping {
  name: string;
  byte: number;
  mask: number;
}

interface InputConfig {
  buttonMap: ButtonMapping[];
  dpadByte: number;
  l2AnalogByte: number;
  r2AnalogByte: number;
  touchpadOffset?: number;
}

interface InputData {
  data: DataView;
}

// Type for input changes - more specific than Record<string, any>
type InputChanges = {
  sticks?: StickStates;
  [K in ButtonName]?: boolean;
} & {
  l2_analog?: number;
  r2_analog?: number;
} & {
  [key: string]: boolean | number | StickStates | undefined;
};

interface ProcessedInputResult {
  changes: InputChanges;
  inputConfig: { buttonMap: ButtonMapping[] };
  touchPoints: TouchPoint[];
  batteryStatus: BatteryStatus;
}

interface UIDependencies {
  l?: (text: string) => string;
  handleNvStatusUpdate?: (nv: NvStatus) => void;
}

interface ProgressCallback {
  (progress: number): void;
}

interface InputHandler {
  (result: ProcessedInputResult): void;
}

interface CalibrationResponse {
  success: boolean;
  message: string;
}

// Error codes for calibration operations
type CalibrationErrorCode = 3 | 4 | 5;

// Expected error codes that should be treated as successful completion
const EXPECTED_CALIBRATION_ERROR_CODES: CalibrationErrorCode[] = [3, 4, 5];

// Battery icon configuration
interface BatteryIconConfig {
  threshold: number;
  icon: string;
}

// FontAwesome battery icon names
type BatteryIconName = "fa-battery-empty" | "fa-battery-quarter" | "fa-battery-half" | "fa-battery-three-quarters" | "fa-battery-full";

// Constants for touchpad parsing
const TOUCHPAD_MAX_POINTS = 2;
const TOUCHPAD_BYTES_PER_POINT = 4;
const TOUCHPAD_ACTIVE_MASK = 0x80;
const TOUCHPAD_ID_MASK = 0x7f;
const TOUCHPAD_X_LOW_MASK = 0x0f;
const TOUCHPAD_Y_SHIFT = 4;

/**
 * Controller Manager - Manages the current controller instance and provides unified interface
 */
class ControllerManager {
  private currentController: BaseController | null;
  private l: ((text: string) => string) | undefined;
  private handleNvStatusUpdate: ((nv: NvStatus) => void) | undefined;
  private has_changes_to_write: boolean | null;
  private inputHandler: InputHandler | null;
  private button_states: ButtonStates;
  private touchPoints: TouchPoint[];
  private batteryStatus: BatteryStatus;
  private _lastBatteryText: string;

  constructor(uiDependencies: UIDependencies = {}) {
    this.currentController = null;
    this.l = uiDependencies.l;
    this.handleNvStatusUpdate = uiDependencies.handleNvStatusUpdate;
    this.has_changes_to_write = null;
    this.inputHandler = null; // Callback function for input processing

    // Button and stick states for UI updates
    this.button_states = {
      // e.g. 'square': false, 'cross': false, ...
      sticks: {
        left: {
          x: 0,
          y: 0,
        },
        right: {
          x: 0,
          y: 0,
        },
      },
    };

    // Touch points for touchpad input
    this.touchPoints = [];

    // Battery status tracking
    this.batteryStatus = {
      bat_txt: "",
      changed: false,
      bat_capacity: 0,
      cable_connected: false,
      is_charging: false,
      is_error: false,
    };
    this._lastBatteryText = "";
  }

  /**
   * Set the current controller instance
   */
  setControllerInstance(instance: BaseController): void {
    this.currentController = instance;
  }

  /**
   * Get the current device (for backward compatibility)
   * @returns Current device or null if none set
   */
  getDevice(): HIDDevice | null {
    return this.currentController?.getDevice() || null;
  }

  getInputConfig(): InputConfig {
    return this.currentController!.getInputConfig();
  }

  async getDeviceInfo(): Promise<ControllerInfo> {
    return await this.currentController!.getInfo();
  }

  getFinetuneMaxValue(): number {
    return this.currentController!.getFinetuneMaxValue();
  }

  /**
   * Set input report handler on the underlying device
   * @param handler Input report handler function or null to clear
   */
  setInputReportHandler(handler: ((event: HIDInputReportEvent) => void) | null): void {
    this.currentController!.device.oninputreport = handler;
  }

  /**
   * Query NVS (Non-Volatile Storage) status
   * @returns NVS status object
   */
  async queryNvStatus(): Promise<NvStatus> {
    const nv = await this.currentController!.queryNvStatus();
    this.handleNvStatusUpdate?.(nv);
    return nv;
  }

  /**
   * Get in-memory module data (finetune data)
   * @returns Module data array
   */
  async getInMemoryModuleData(): Promise<number[]> {
    return await this.currentController!.getInMemoryModuleData();
  }

  /**
   * Write finetune data to controller
   * @param data Finetune data array
   */
  async writeFinetuneData(data: number[]): Promise<void> {
    await this.currentController!.writeFinetuneData(data);
  }

  getModel(): string {
    return this.currentController!.getModel();
  }

  /**
   * Check if a controller is connected
   * @returns True if controller is connected
   */
  isConnected(): boolean {
    return this.currentController !== null;
  }

  /**
   * Set the input callback function
   * @param callback Function to call after processing input
   */
  setInputHandler(callback: InputHandler): void {
    this.inputHandler = callback;
  }

  /**
   * Disconnect the current controller
   */
  async disconnect(): Promise<void> {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  /**
   * Update NVS changes status and UI
   * @param hasChanges Changes status
   */
  setHasChangesToWrite(hasChanges: boolean): void {
    if (hasChanges === this.has_changes_to_write) return;

    const saveBtn = $("#savechanges");
    saveBtn.prop("disabled", !hasChanges).toggleClass("btn-success", hasChanges).toggleClass("btn-outline-secondary", !hasChanges);

    this.has_changes_to_write = hasChanges;
  }

  // Unified controller operations that delegate to the current controller

  /**
   * Flash/save changes to the controller
   */
  async flash(progressCallback: ProgressCallback | null = null): Promise<FlashResult> {
    const result = await this.currentController!.flash(progressCallback);
    this.setHasChangesToWrite(false);
    return result;
  }

  /**
   * Reset the controller
   */
  async reset(): Promise<void> {
    await this.currentController!.reset();
  }

  /**
   * Unlock NVS (Non-Volatile Storage)
   */
  async nvsUnlock(): Promise<void> {
    await this.currentController!.nvsUnlock();
    await this.queryNvStatus(); // Refresh NVS status
  }

  /**
   * Lock NVS (Non-Volatile Storage)
   */
  async nvsLock(): Promise<CalibrationResult> {
    const res = await this.currentController!.nvsLock();
    if (!res.ok) {
      throw new Error(this.l!("NVS Lock failed: ") + String(res.error));
    }

    await this.queryNvStatus(); // Refresh NVS status
    return res;
  }

  /**
   * Begin stick calibration
   */
  async calibrateSticksBegin(): Promise<void> {
    const res = await this.currentController!.calibrateSticksBegin();
    if (!res.ok) {
      const detail = res.code ? this.l!("Error ") + String(res.code) : String(res.error || "");
      throw new Error(this.l!("Stick calibration failed: ") + detail);
    }
  }

  /**
   * Sample stick position during calibration
   */
  async calibrateSticksSample(): Promise<void> {
    const res = await this.currentController!.calibrateSticksSample();
    if (!res.ok) {
      await sleep(500);
      const detail = res.code ? this.l!("Error ") + String(res.code) : String(res.error || "");
      throw new Error(this.l!("Stick calibration failed: ") + detail);
    }
  }

  /**
   * End stick calibration
   */
  async calibrateSticksEnd(): Promise<void> {
    const res = await this.currentController!.calibrateSticksEnd();
    if (!res.ok) {
      await sleep(500);
      const detail = res.code ? this.l!("Error ") + String(res.code) : String(res.error || "");
      throw new Error(this.l!("Stick calibration failed: ") + detail);
    }

    this.setHasChangesToWrite(true);
  }

  /**
   * Begin stick range calibration (for UI-driven calibration)
   */
  async calibrateRangeBegin(): Promise<void> {
    const ret = await this.currentController!.calibrateRangeBegin();
    if (!ret.ok) {
      const detail = ret.code ? this.l!("Error ") + String(ret.code) : String(ret.error || "");
      throw new Error(this.l!("Range calibration failed: ") + detail);
    }
  }

  /**
   * Handle range calibration on close
   */
  async calibrateRangeOnClose(): Promise<CalibrationResponse> {
    const res = await this.currentController!.calibrateRangeEnd();
    if (res?.ok) {
      this.setHasChangesToWrite(true);
      return { success: true, message: this.l!("Range calibration completed") };
    } else {
      // Check if the error is an expected code (DS4/DS5: 3, DS5 Edge: 4/5), which typically means
      // the calibration was already ended or the controller is not in range calibration mode
      if (res?.code && EXPECTED_CALIBRATION_ERROR_CODES.includes(res.code as CalibrationErrorCode)) {
        console.log("Range calibration end returned expected error code", res.code, "- treating as successful completion");
        // This is likely not an error - the calibration may have already been completed
        // or the user closed the window without starting calibration
        return { success: true, message: this.l!("Range calibration window closed") };
      }

      console.log("Range calibration end failed with unexpected error:", res);
      await sleep(500);
      const msg = res?.code
        ? this.l!("Range calibration failed: ") + this.l!("Error ") + String(res.code)
        : this.l!("Range calibration failed: ") + String(res?.error || "");
      return { success: false, message: msg };
    }
  }

  /**
   * Full stick calibration process ("OLD" fully automated calibration)
   * @param progressCallback Callback function to report progress (0-100)
   */
  async calibrateSticks(progressCallback: ProgressCallback): Promise<CalibrationResponse> {
    try {
      la("multi_calibrate_sticks");

      progressCallback(20);
      await this.calibrateSticksBegin();
      progressCallback(30);

      // Sample multiple times during the process
      const sampleCount = 5;
      for (let i = 0; i < sampleCount; i++) {
        await sleep(100);
        await this.calibrateSticksSample();

        // Progress from 30% to 80% during sampling
        const sampleProgress = 30 + ((i + 1) / sampleCount) * 50;
        progressCallback(Math.round(sampleProgress));
      }

      progressCallback(90);
      await this.calibrateSticksEnd();
      progressCallback(100);

      return { success: true, message: this.l!("Stick calibration completed") };
    } catch (e: unknown) {
      la("multi_calibrate_sticks_failed", { r: e });
      throw e;
    }
  }

  /**
   * Helper function to check if stick positions have changed
   */
  private _sticksChanged(current: StickStates, newValues: StickStates): boolean {
    return (
      current.left.x !== newValues.left.x ||
      current.left.y !== newValues.left.y ||
      current.right.x !== newValues.right.x ||
      current.right.y !== newValues.right.y
    );
  }

  /**
   * Generic button processing for DS4/DS5
   * Records button states and returns changes
   */
  private _recordButtonStates(data: DataView, BUTTON_MAP: ButtonMapping[], dpad_byte: number, l2_analog_byte: number, r2_analog_byte: number): InputChanges {
    const changes: InputChanges = {};

    // Stick positions (always at bytes 0-3)
    const [new_lx, new_ly, new_rx, new_ry] = [0, 1, 2, 3].map((i) => data.getUint8(i)).map((v) => Math.round(((v - 127.5) / 128) * 100) / 100);

    const newSticks: StickStates = {
      left: { x: new_lx, y: new_ly },
      right: { x: new_rx, y: new_ry },
    };

    if (this._sticksChanged(this.button_states.sticks, newSticks)) {
      this.button_states.sticks = newSticks;
      changes.sticks = newSticks;
    }

    // L2/R2 analog values
    const analogTriggers: Array<[AnalogTrigger, number]> = [
      ["l2_analog", l2_analog_byte],
      ["r2_analog", r2_analog_byte],
    ];

    analogTriggers.forEach(([triggerName, byte]) => {
      const val = data.getUint8(byte);
      if (val !== this.button_states[triggerName]) {
        this.button_states[triggerName] = val;
        changes[triggerName] = val;
      }
    });

    // Dpad is a 4-bit hat value
    const hat = data.getUint8(dpad_byte) & 0x0f;
    const dpad_map: Record<DPadDirection, boolean> = {
      up: hat === 0 || hat === 1 || hat === 7,
      right: hat === 1 || hat === 2 || hat === 3,
      down: hat === 3 || hat === 4 || hat === 5,
      left: hat === 5 || hat === 6 || hat === 7,
    };

    const dpadDirections: DPadDirection[] = ["up", "right", "down", "left"];
    for (const dir of dpadDirections) {
      const pressed = dpad_map[dir];
      if (this.button_states[dir] !== pressed) {
        this.button_states[dir] = pressed;
        changes[dir] = pressed;
      }
    }

    // Other buttons
    for (const btn of BUTTON_MAP) {
      if (dpadDirections.includes(btn.name as DPadDirection)) continue; // Dpad handled above
      const pressed = (data.getUint8(btn.byte) & btn.mask) !== 0;
      const buttonName = btn.name as keyof ButtonStates;
      if (this.button_states[buttonName] !== pressed) {
        this.button_states[buttonName] = pressed;
        changes[buttonName] = pressed;
      }
    }

    return changes;
  }

  /**
   * Process controller input data and call callback if set
   * This is the first part of the split process_controller_input function
   * @param inputData The input data from the controller
   * @returns Changes object containing processed input data
   */
  processControllerInput(inputData: InputData): void {
    const { data } = inputData;

    const inputConfig = this.currentController!.getInputConfig();
    const { buttonMap, dpadByte, l2AnalogByte, r2AnalogByte } = inputConfig;
    const { touchpadOffset } = inputConfig;

    // Process button states using the device-specific configuration
    const changes = this._recordButtonStates(data, buttonMap, dpadByte, l2AnalogByte, r2AnalogByte);

    // Parse and store touch points if touchpad data is available
    if (touchpadOffset) {
      this.touchPoints = this._parseTouchPoints(data, touchpadOffset);
    }

    // Parse and store battery status
    this.batteryStatus = this._parseBatteryStatus(data);

    const result: ProcessedInputResult = {
      changes,
      inputConfig: { buttonMap },
      touchPoints: this.touchPoints,
      batteryStatus: this.batteryStatus,
    };

    this.inputHandler?.(result);
  }

  /**
   * Parse touch points from input data
   * @param data Input data view
   * @param offset Offset to touchpad data
   * @returns Array of touch points with {active, id, x, y} properties
   */
  private _parseTouchPoints(data: DataView, offset: number): TouchPoint[] {
    // Returns array of up to 2 points: {active, id, x, y}
    const points: TouchPoint[] = [];
    for (let i = 0; i < TOUCHPAD_MAX_POINTS; i++) {
      const base = offset + i * TOUCHPAD_BYTES_PER_POINT;
      const b0 = data.getUint8(base);
      const active = (b0 & TOUCHPAD_ACTIVE_MASK) === 0; // 0 = finger down, 1 = up
      const id = b0 & TOUCHPAD_ID_MASK;
      const b1 = data.getUint8(base + 1);
      const b2 = data.getUint8(base + 2);
      const b3 = data.getUint8(base + 3);
      // x: 12 bits, y: 12 bits
      const x = ((b2 & TOUCHPAD_X_LOW_MASK) << 8) | b1;
      const y = (b3 << TOUCHPAD_Y_SHIFT) | (b2 >> TOUCHPAD_Y_SHIFT);
      points.push({ active, id, x, y });
    }
    return points;
  }

  /**
   * Parse battery status from input data
   */
  private _parseBatteryStatus(data: DataView): BatteryStatus {
    const batteryInfo = this.currentController!.parseBatteryStatus(data);
    const bat_txt = this._batteryPercentToText(batteryInfo);

    const changed = bat_txt !== this._lastBatteryText;
    this._lastBatteryText = bat_txt;

    return { bat_txt, changed, ...batteryInfo };
  }

  /**
   * Convert battery percentage to display text with icons
   */
  private _batteryPercentToText({ bat_capacity, is_charging, is_error }: BatteryInfo): string {
    if (is_error) {
      return '<font color="red">' + this.l!("error") + "</font>";
    }

    const batteryIcons: Array<{ threshold: number; icon: BatteryIconName }> = [
      { threshold: 20, icon: "fa-battery-empty" },
      { threshold: 40, icon: "fa-battery-quarter" },
      { threshold: 60, icon: "fa-battery-half" },
      { threshold: 80, icon: "fa-battery-three-quarters" },
    ];

    const icon_txt: BatteryIconName = batteryIcons.find((item) => bat_capacity < item.threshold)?.icon || "fa-battery-full";
    const icon_full = `<i class="fa-solid ${icon_txt}"></i>`;
    const bolt_txt = is_charging ? '<i class="fa-solid fa-bolt"></i>' : "";
    return [`${bat_capacity}%`, icon_full, bolt_txt].join(" ");
  }

  /**
   * Get a bound input handler function that can be assigned to device.oninputreport
   * @returns Bound input handler function
   */
  getInputHandler(): (inputData: InputData) => void {
    return this.processControllerInput.bind(this);
  }
}

// Export types for use in other modules
export type {
  StickPosition,
  StickStates,
  ButtonStates,
  TouchPoint,
  BatteryStatus,
  BatteryInfo,
  ButtonMapping,
  InputConfig,
  InputData,
  ProcessedInputResult,
  UIDependencies,
  ProgressCallback,
  InputHandler,
  CalibrationResponse,
  DPadDirection,
  AnalogTrigger,
  ButtonName,
  InputChanges,
  CalibrationErrorCode,
  BatteryIconName,
};

// Export the main class
export { ControllerManager };

// Function to initialize the controller manager with dependencies
export function initControllerManager(dependencies: UIDependencies = {}): ControllerManager {
  const self = new ControllerManager(dependencies);

  // This disables the save button until something actually changes
  self.setHasChangesToWrite(false);
  return self;
}
