'use strict';

import { Storage } from '../storage.js';
import { setOwner, getController } from '../controller-registry.js';

let currentSerial = null;
let onSavedCallback = null;
let listenersInitialized = false;

function initListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Name is required; the save button follows it
  $('#owner-name').on('input', () => {
    $('#owner-save-btn').prop('disabled', !$('#owner-name').val().trim());
  });

  // Fill the fields with the last entered details
  $('#owner-apply-last-btn').on('click', () => {
    const last = Storage.lastOwnerEntry.get();
    if (!last) return;
    $('#owner-name').val(last.name || '');
    $('#owner-phone').val(last.phone || '');
    $('#owner-address').val(last.address || '');
    $('#owner-name').trigger('input');
  });

  $('#owner-save-btn').on('click', () => {
    const owner = {
      name: $('#owner-name').val().trim(),
      phone: $('#owner-phone').val().trim(),
      address: $('#owner-address').val().trim(),
    };
    if (!owner.name || !currentSerial) return;

    setOwner(currentSerial, owner);
    Storage.lastOwnerEntry.set(owner);

    bootstrap.Modal.getOrCreateInstance('#ownerModal').hide();
    onSavedCallback?.();
  });
}

/**
 * Show the owner entry modal for a controller identified by serial number.
 * Fields are prefilled when the controller already has an owner (editing).
 * Skipping (or dismissing) stores nothing; the modal will be offered again
 * on the next connection.
 * @param {string} serial - Controller serial number
 * @param {Function|null} onSaved - Called after the owner has been stored
 */
export function show_owner_modal(serial, onSaved = null) {
  if (!serial) return;
  currentSerial = serial;
  onSavedCallback = onSaved;
  initListeners();

  // Prefill with the stored owner when editing, otherwise start fresh
  const existing = getController(serial)?.owner;
  $('#owner-name').val(existing?.name || '');
  $('#owner-phone').val(existing?.phone || '');
  $('#owner-address').val(existing?.address || '');
  $('#owner-save-btn').prop('disabled', !existing?.name);
  $('#owner-modal-desc').toggleClass('d-none', !!existing?.name);

  // Offer the last entered details, when there are any
  const last = Storage.lastOwnerEntry.get();
  const parts = last ? [last.name, last.phone, last.address].filter(Boolean) : [];
  $('#owner-last-entry').toggleClass('d-none', parts.length === 0);
  $('#owner-last-entry-text').text(parts.join(' · '));

  bootstrap.Modal.getOrCreateInstance('#ownerModal').show();
}
