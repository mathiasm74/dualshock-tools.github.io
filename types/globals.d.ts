// Global type definitions for DualShock Tools

// WebHID API types are now imported from @types/w3c-web-hid

// Global app state interface
interface AppState {
  disable_btn: number;
  last_disable_btn: number;
  lang_orig_text: Record<string, any>;
  lang_cur: Record<string, any>;
  lang_disabled: boolean;
  lang_cur_direction: string;
  gj: string;
  gu: string;
}

// Extend Window interface for global variables
declare global {
  interface Window {
    app: AppState;
    bootstrap: typeof import("bootstrap");

    // Global functions exposed to HTML
    connect: () => Promise<void>;
    disconnectSync: () => void;
    welcome_accepted: () => void;
    lang_set: (lang: string) => void;

    // Modal functions
    calibrate_range_on_close: () => Promise<void>;
    calibrate_stick_centers_on_close: () => Promise<void>;
    finetune_cancel: () => void;
    finetune_save: () => void;
    calib_next: () => void;

    // Controller functions
    calibrate_range: () => void;
    calibrate_stick_centers: () => void;
    auto_calibrate_stick_centers: () => void;
    ds5_finetune: () => void;
    flash_all_changes: () => void;
    reboot_controller: () => void;
    refresh_nvstatus: () => void;
    nvsunlock: () => void;
    nvslock: () => void;

    // UI functions
    show_donate_modal: () => void;
    board_model_info: () => void;
    edge_color_info: () => void;

    // Other globals
    gboot: () => void;
    disconnect: () => void;
    show_faq_modal: () => void;
    show_info_tab: () => void;
  }

  // Global constants
  const bootstrap: typeof import("bootstrap");
}

// Canvas context types
interface HTMLCanvasElement {
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
}

// jQuery modal extension
interface JQuery {
  modal(action: string): JQuery;
}

export {};
