// Controller type definitions

interface InfoItem {
  key: any;
  value: any;
  cat: string;
  severity?: string;
  addInfoIcon?: string;
  isExtra?: boolean;
}

interface NvStatus {
  status: string;
  locked: boolean;
  mode?: string;
  device?: string;
  code?: number;
  raw?: number;
  error?: string;
}

interface ControllerInfo {
  ok: boolean;
  infoItems?: InfoItem[];
  nv?: NvStatus;
  disable_bits?: number;
  rare?: boolean;
  error?: any;
  pending_reboot?: boolean;
}

interface FlashResult {
  success: boolean;
  message: string;
}

interface NvResult {
  ok: boolean;
  error?: string;
}

interface CalibrationResult {
  ok: boolean;
  code?: number;
  d1?: any;
  d2?: any;
  error?: string;
  message?: string;
}

// Extend global types
declare global {
  // Add BaseController to global scope for JSDoc
  class BaseController {
    device: HIDDevice;
    model: string;
    finetuneMaxValue: number | undefined;
    l: (text: string) => string;

    constructor(
      device: HIDDevice,
      uiDependencies?: { l?: (text: string) => string }
    );

    getModel(): string;
    getDevice(): HIDDevice;
    getInputConfig(): any;
    getFinetuneMaxValue(): number;
    setInputReportHandler(
      handler: ((event: HIDInputReportEvent) => void) | null
    ): void;
    alloc_req(id: number, data?: number[]): Uint8Array;
    sendFeatureReport(
      reportId: number,
      data: ArrayBuffer | number[]
    ): Promise<void>;
    receiveFeatureReport(reportId: number): Promise<DataView>;
    close(): Promise<void>;

    // Abstract methods
    getInfo(): Promise<any>;
    flash(progressCallback?: any): Promise<any>;
    reset(): Promise<any>;
    nvsLock(): Promise<any>;
    nvsUnlock(): Promise<any>;
    calibrateSticksBegin(): Promise<any>;
    calibrateSticksEnd(): Promise<any>;
    calibrateSticksSample(): Promise<any>;
    calibrateRangeBegin(): Promise<any>;
    calibrateRangeEnd(): Promise<any>;
    calibrateRangeOnClose(): Promise<any>;
    parseBatteryStatus(data: any): any;
  }
}

export {};
