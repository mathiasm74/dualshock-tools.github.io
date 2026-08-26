'use strict';

import { draw_stick_dial } from './stick-renderer.js';
import { float_to_str, lerp_color } from './utils.js';
import { Storage } from './storage.js';
import ControllerFactory from './controllers/controller-factory.js';

/**
 * Gamepad API based input preview for the Connect screen.
 *
 * The Gamepad API (navigator.getGamepads) exposes button and stick state without
 * a pairing prompt, but it cannot send feature reports, so it is only useful for
 * testing inputs before the controller is opened with WebHID.
 *
 * Browsers only list a gamepad after the user has pressed a button on it, so the
 * preview stays hidden until the first press.
 */

// W3C "standard" gamepad mapping button indices → app button names
const STANDARD_BUTTONS = [
  'cross', 'circle', 'square', 'triangle',
  'l1', 'r1', 'l2', 'r2',
  'create', 'options', 'l3', 'r3',
  'up', 'down', 'left', 'right',
  'ps', 'touchpad',
];

const BUTTON_INFILL = {
  'cross': 'Cross_infill',
  'circle': 'Circle_infill',
  'square': 'Square_infill',
  'triangle': 'Triangle_infill',
  'l1': 'L1_infill',
  'r1': 'R1_infill',
  'l2': 'L2_infill',
  'r2': 'R2_infill',
  'create': 'Create_infill',
  'options': 'Options_infill',
  'l3': 'L3_infill',
  'r3': 'R3_infill',
  'up': 'Up_infill',
  'down': 'Down_infill',
  'left': 'Left_infill',
  'right': 'Right_infill',
  'ps': 'PS_infill',
  'touchpad': 'Trackpad_infill',
};

// All SVG ids are prefixed so they never collide with the main page or Quick Test SVGs
const ID_PREFIX = 'gp-';

const MODELS = {
  DS4: {
    svg: 'dualshock-controller.svg',
    maxOffset: 25,
    L3: { cx: 295.63, cy: 461.03 },
    R3: { cx: 662.06, cy: 419.78 },
  },
  DS5: {
    svg: 'dualsense-controller.svg',
    maxOffset: 25,
    L3: { cx: 295.63, cy: 461.03 },
    R3: { cx: 662.06, cy: 419.78 },
    scale: 0.70,
  },
  DS5_Edge: {
    svg: 'ds-edge-controller.svg',
    maxOffset: 25,
    L3: { cx: 223, cy: 299.51 },
    R3: { cx: 417, cy: 299.51 },
  },
};

const PRODUCT_TO_MODEL = {
  0x05c4: 'DS4',
  0x09cc: 'DS4',
  0x0ce6: 'DS5',
  0x0df2: 'DS5_Edge',
};

const STICK_EPSILON = 0.001;

const state = {
  running: false,
  rafId: null,
  gamepadKey: null,
  model: null,
  svgLoading: null,
  svgReady: false,
  theme: null,
  buttons: {},
  triggers: { l2: -1, r2: -1 },
  sticks: { lx: NaN, ly: NaN, rx: NaN, ry: NaN },
};

function el(id) {
  return document.getElementById(id);
}

function svgEl(id) {
  return el(ID_PREFIX + id);
}

function currentTheme() {
  return Storage.preferredTheme.get() === 'dark' ? 'dark' : 'light';
}

function themeColors() {
  const dark = currentTheme() === 'dark';
  return {
    pressed: dark ? '#00FF00' : '#1a237e',
    infill: dark ? '#2b3035' : '#ffffff',
  };
}

function setSvgGroupColor(group, color) {
  if (!group) return;
  group.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon').forEach(node => {
    if (!node.style.transition) {
      node.style.transition = 'fill 0.10s, stroke 0.10s';
    }
    node.setAttribute('fill', color);
    node.setAttribute('stroke', color);
  });
}

/**
 * Parse vendor/product ids out of a Gamepad.id string.
 * Chrome:  "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
 * Firefox: "054c-0ce6-DualSense Wireless Controller"
 */
function parseGamepadId(id) {
  let m = /vendor:\s*([0-9a-f]{4})\s*product:\s*([0-9a-f]{4})/i.exec(id);
  if (!m) m = /^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(id);
  if (!m) return { vendorId: null, productId: null };
  return { vendorId: parseInt(m[1], 16), productId: parseInt(m[2], 16) };
}

function modelForGamepad(gamepad) {
  const { productId } = parseGamepadId(gamepad.id);
  return PRODUCT_TO_MODEL[productId] || 'DS5';
}

function displayNameForGamepad(gamepad) {
  const { vendorId, productId } = parseGamepadId(gamepad.id);
  if (vendorId === 0x054c && PRODUCT_TO_MODEL[productId]) {
    return ControllerFactory.getDeviceName(productId);
  }
  // Strip Chrome's "(STANDARD GAMEPAD Vendor: .... Product: ....)" suffix
  return gamepad.id.replace(/\s*\(.*\)\s*$/, '') || gamepad.id;
}

function getGamepads() {
  try {
    return Array.from(navigator.getGamepads?.() || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

// Prefer the gamepad that was most recently used
function pickGamepad() {
  const pads = getGamepads();
  if (pads.length === 0) return null;
  return pads.reduce((best, gp) => (!best || gp.timestamp > best.timestamp ? gp : best), null);
}

async function fetchSvg(fileName) {
  if (window.BUNDLED_ASSETS?.svg?.[fileName]) {
    return window.BUNDLED_ASSETS.svg[fileName];
  }
  const response = await fetch(`assets/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to load controller SVG: ${fileName}`);
  }
  return await response.text();
}

async function loadSvg(model) {
  const container = el('gamepad-tester-svg');
  if (!container) return;

  state.svgReady = false;
  const loading = fetchSvg(MODELS[model].svg);
  state.svgLoading = loading;
  let content = await loading;
  if (state.svgLoading !== loading) return; // superseded by a newer load

  content = content.replace(/id="([^"]+)"/g, `id="${ID_PREFIX}$1"`);
  container.innerHTML = content;

  const svg = container.querySelector('svg');
  if (svg) {
    svg.style.width = '100%';
    svg.style.maxWidth = '420px';
    svg.style.height = 'auto';
  }

  applyBaseColors();
  resetRenderState();
  state.svgReady = true;
}

function applyBaseColors() {
  const { infill } = themeColors();
  const lightBlue = '#7ecbff';
  const midBlue = '#3399cc';

  setSvgGroupColor(svgEl('Controller'), lightBlue);
  ['Button_outlines', 'Button_outlines_behind', 'L3_outline', 'R3_outline', 'Trackpad_outline'].forEach(id => {
    setSvgGroupColor(svgEl(id), midBlue);
  });
  ['Controller_infills', 'Button_infills', 'Button_infills_behind', 'L3_infill', 'R3_infill', 'Trackpad_infill'].forEach(id => {
    setSvgGroupColor(svgEl(id), infill);
  });
}

function resetRenderState() {
  state.buttons = {};
  state.triggers = { l2: -1, r2: -1 };
  state.sticks = { lx: NaN, ly: NaN, rx: NaN, ry: NaN };
}

function renderButtons(gamepad) {
  const { pressed, infill } = themeColors();

  STANDARD_BUTTONS.forEach((name, idx) => {
    const button = gamepad.buttons[idx];
    if (!button) return;

    if (name === 'l2' || name === 'r2') {
      const value = Math.round((button.value ?? (button.pressed ? 1 : 0)) * 100);
      if (state.triggers[name] === value) return;
      state.triggers[name] = value;

      const key = name.toUpperCase();
      setSvgGroupColor(svgEl(key + '_infill'), lerp_color(infill, pressed, value / 100));
      const text = svgEl(key + '_percentage');
      if (text) {
        text.textContent = `${value} %`;
        text.setAttribute('opacity', value > 0 ? '1' : '0');
        text.setAttribute('fill', value < 35 ? pressed : 'white');
      }
      return;
    }

    const isPressed = !!button.pressed;
    if (state.buttons[name] === isPressed) return;
    state.buttons[name] = isPressed;
    setSvgGroupColor(svgEl(BUTTON_INFILL[name]), isPressed ? pressed : infill);
  });
}

function clamp(v) {
  return Math.max(-1, Math.min(1, v));
}

function renderSticks(gamepad) {
  const axes = gamepad.axes || [];
  const lx = clamp(axes[0] ?? 0);
  const ly = clamp(axes[1] ?? 0);
  const rx = clamp(axes[2] ?? 0);
  const ry = clamp(axes[3] ?? 0);

  const prev = state.sticks;
  const changed = [lx - prev.lx, ly - prev.ly, rx - prev.rx, ry - prev.ry]
    .some(d => Number.isNaN(d) || Math.abs(d) > STICK_EPSILON);
  if (!changed) return;
  state.sticks = { lx, ly, rx, ry };

  const canvas = el('gamepad-tester-stick-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const sz = 60;
    const yb = 15 + sz;
    const hb = 20 + sz;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw_stick_dial(ctx, hb, yb, sz, lx, ly);
    draw_stick_dial(ctx, canvas.width - hb, yb, sz, rx, ry);
  }

  $('#gamepad-tester-lx').text(float_to_str(lx));
  $('#gamepad-tester-ly').text(float_to_str(ly));
  $('#gamepad-tester-rx').text(float_to_str(rx));
  $('#gamepad-tester-ry').text(float_to_str(ry));

  // Nudge the L3/R3 groups in the controller drawing
  const cfg = MODELS[state.model];
  if (!cfg || !state.svgReady) return;
  const scaleStr = cfg.scale ? ` scale(${cfg.scale})` : '';
  svgEl('L3')?.setAttribute('transform', `translate(${lx * cfg.maxOffset},${ly * cfg.maxOffset})${scaleStr}`);
  svgEl('R3')?.setAttribute('transform', `translate(${rx * cfg.maxOffset},${ry * cfg.maxOffset})${scaleStr}`);
}

function showCard(show) {
  $('#gamepad-tester-card').toggle(show);
  $('#gamepad-tester-hint').toggle(!show);
  // The "about drift" box is fixed at the bottom of the viewport; let it flow
  // below the preview instead of covering it while the preview is visible.
  document.body.classList.toggle('gamepad-tester-active', show);
}

function gamepadKey(gamepad) {
  return `${gamepad.index}:${gamepad.id}`;
}

function attach(gamepad) {
  state.gamepadKey = gamepadKey(gamepad);
  $('#gamepad-tester-name').text(displayNameForGamepad(gamepad));
  $('#gamepad-tester-mapping-warning').toggle(gamepad.mapping !== 'standard');

  const model = modelForGamepad(gamepad);
  if (model !== state.model || !state.svgReady) {
    state.model = model;
    loadSvg(model).catch(error => console.warn('Gamepad tester: failed to load SVG', error));
  }
  resetRenderState();
  showCard(true);
}

function detach() {
  state.gamepadKey = null;
  showCard(false);
}

function poll() {
  if (!state.running) return;

  const gamepad = pickGamepad();
  if (!gamepad) {
    if (state.gamepadKey !== null) detach();
  } else {
    if (gamepadKey(gamepad) !== state.gamepadKey) attach(gamepad);

    const theme = currentTheme();
    if (theme !== state.theme) {
      state.theme = theme;
      if (state.svgReady) applyBaseColors();
      resetRenderState();
    }

    if (state.svgReady) renderButtons(gamepad);
    renderSticks(gamepad);
  }

  state.rafId = requestAnimationFrame(poll);
}

/**
 * Start polling the Gamepad API and showing the preview on the Connect screen.
 */
export function startGamepadTester() {
  if (state.running) return;
  if (typeof navigator.getGamepads !== 'function') return;
  state.running = true;
  state.theme = currentTheme();
  $('#gamepad-tester').show();
  showCard(false);
  state.rafId = requestAnimationFrame(poll);
}

/**
 * Stop polling and hide the preview (e.g. once the controller is opened with WebHID).
 */
export function stopGamepadTester() {
  if (!state.running) return;
  state.running = false;
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  detach();
  $('#gamepad-tester').hide();
}
