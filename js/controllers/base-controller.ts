"use strict";

import { ControllerInfo, NvResult, FlashResult, CalibrationResult, NvStatus } from "../../types/controllers.js";

/**
 * Base Controller class that provides common functionality for all controller types
 */
export class BaseController {
  device: any;
  model: string;
  finetuneMaxValue: number | undefined;
  l: (text: string) => string;

  constructor(device: any, uiDependencies: { l?: (text: string) => string } = {}) {
    this.device = device;
    this.model = "undefined"; // to be set by subclasses
    this.finetuneMaxValue = undefined; // to be set by subclasses

    // UI dependencies injected from core
    this.l = uiDependencies.l || ((text: string) => text);
  }

  getModel(): string {
    return this.model;
  }

  /**
   * Get the underlying HID device
   * @returns The HID device
   */
  getDevice(): any {
    return this.device;
  }

  getInputConfig(): any {
    throw new Error("getInputConfig() must be implemented by subclass");
  }

  /**
   * Get the maximum value for finetune data
   * @returns {number} Maximum value for finetune adjustments
   */
  getFinetuneMaxValue(): number {
    if (!this.finetuneMaxValue) throw new Error("getFinetuneMaxValue() must be implemented by subclass");
    return this.finetuneMaxValue;
  }

  /**
   * Set input report handler
   * @param {Function} handler Input report handler function
   */
  setInputReportHandler(handler: ((event: any) => void) | null): void {
    this.device.oninputreport = handler;
  }

  /**
   * Allocate request buffer with proper size based on device feature reports
   * @param {number} id Report ID
   * @param {Array} data Data array to include in the request
   * @returns {Uint8Array} Allocated request buffer
   */
  alloc_req(id: number, data: number[] = []): Uint8Array {
    const fr = this.device.collections[0].featureReports;
    const [report] = fr.find((e) => e.reportId === id)?.items || [];
    const maxLen = report?.reportCount || data.length;

    const len = Math.min(data.length, maxLen);
    const out = new Uint8Array(maxLen);
    out.set(data.slice(0, len));
    return out;
  }

  /**
   * Send feature report to device
   * @param {number} reportId Report ID
   * @param {ArrayBuffer|Array} data Data to send (if Array, will be processed through allocReq)
   */
  async sendFeatureReport(reportId: number, data: ArrayBuffer | number[]): Promise<void> {
    // If data is an array, use allocReq to create proper buffer
    if (Array.isArray(data)) {
      const uint8Array = this.alloc_req(reportId, data);
      // Create a proper ArrayBuffer from the Uint8Array
      const arrayBuffer = new ArrayBuffer(uint8Array.length);
      new Uint8Array(arrayBuffer).set(uint8Array);
      data = arrayBuffer;
    }

    try {
      return await this.device.sendFeatureReport(reportId, data);
    } catch (error) {
      // HID doesn't throw proper Errors with stack (stack is "name: message") so generate a new stack here
      throw new Error(error.stack);
    }
  }

  /**
   * Receive feature report from device
   * @param {number} reportId Report ID
   */
  async receiveFeatureReport(reportId: number): Promise<DataView> {
    return await this.device.receiveFeatureReport(reportId);
  }

  /**
   * Close the HID device connection
   */
  async close(): Promise<void> {
    if (this.device && this.device.opened) {
      await this.device.close();
    }
  }

  // Abstract methods that must be implemented by subclasses
  async getInfo(): Promise<ControllerInfo> {
    throw new Error("getInfo() must be implemented by subclass");
  }

  async getInMemoryModuleData(): Promise<Uint8Array> {
    throw new Error("getInMemoryModuleData() must be implemented by subclass");
  }

  async flash(progressCallback: ((progress: number) => void) | null = null): Promise<FlashResult> {
    throw new Error("flash() must be implemented by subclass");
  }

  async reset(): Promise<void> {
    throw new Error("reset() must be implemented by subclass");
  }

  async nvsLock(): Promise<NvResult> {
    throw new Error("nvsLock() must be implemented by subclass");
  }

  async nvsUnlock(): Promise<NvResult> {
    throw new Error("nvsUnlock() must be implemented by subclass");
  }

  async calibrateSticksBegin(): Promise<CalibrationResult> {
    throw new Error("calibrateSticksBegin() must be implemented by subclass");
  }

  async calibrateSticksEnd(): Promise<CalibrationResult> {
    throw new Error("calibrateSticksEnd() must be implemented by subclass");
  }

  async calibrateSticksSample(): Promise<CalibrationResult> {
    throw new Error("calibrateSticksSample() must be implemented by subclass");
  }

  async calibrateRangeBegin(): Promise<CalibrationResult> {
    throw new Error("calibrateRangeBegin() must be implemented by subclass");
  }

  async calibrateRangeEnd(): Promise<CalibrationResult> {
    throw new Error("calibrateRangeEnd() must be implemented by subclass");
  }

  // async calibrateRangeOnClose(): Promise<CalibrationResult> {
  //   throw new Error('calibrateRangeOnClose() must be implemented by subclass');
  // }

  parseBatteryStatus(data: DataView): { bat_capacity: number; cable_connected: boolean; is_charging: boolean; is_error: boolean } {
    throw new Error("parseBatteryStatus() must be implemented by subclass");
  }
}

export default BaseController;
