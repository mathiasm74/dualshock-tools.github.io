'use strict';

import { Storage } from '../storage.js';
import { setOwner, setRepair, getController } from '../controller-registry.js';

let currentSerial = null;
let onSavedCallback = null;
let listenersInitialized = false;

const FIELD_HISTORY_MAX = 20;

// Move a value to the front of a remembered list (case-insensitive dedupe)
function rememberValue(list, value) {
  if (!value) return list || [];
  const filtered = (list || []).filter(v => v.toLowerCase() !== value.toLowerCase());
  return [value, ...filtered].slice(0, FIELD_HISTORY_MAX);
}

function populateDatalist(id, values) {
  const datalist = document.getElementById(id);
  if (!datalist) return;
  datalist.textContent = '';
  (values || []).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    datalist.appendChild(option);
  });
}

const DETAIL_FIELDS = '#owner-name, #owner-phone, #owner-address, #repair-channel, #repair-tech, #repair-fault, #repair-estimate, #repair-found, #repair-price, #repair-done';

// Store-owned overrides everything else: the other fields are disabled and
// the name requirement is waived
function updateStoreOwnedState() {
  const storeOwned = $('#owner-store-owned').is(':checked');
  $(DETAIL_FIELDS).prop('disabled', storeOwned);
  $('#owner-apply-last-btn').prop('disabled', storeOwned);
  $('#owner-save-btn').prop('disabled', !storeOwned && !$('#owner-name').val().trim());
}

function initListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Name is required (unless store-owned); the save button follows it
  $('#owner-name').on('input', () => {
    updateStoreOwnedState();
  });

  $('#owner-store-owned').on('change', updateStoreOwnedState);

  // Fill the customer/session fields with the last entered details.
  // Per-job fields (faults, prices, done) are never carried over.
  $('#owner-apply-last-btn').on('click', () => {
    const last = Storage.lastOwnerEntry.get();
    if (!last) return;
    $('#owner-name').val(last.name || '');
    $('#owner-phone').val(last.phone || '');
    $('#owner-address').val(last.address || '');
    $('#repair-channel').val(last.channel || '');
    $('#repair-tech').val(last.tech || '');
    $('#owner-name').trigger('input');
  });

  $('#owner-save-btn').on('click', () => {
    if (!currentSerial) return;

    // Store-owned: just mark the record; the other fields are not stored
    // (existing repair details are left untouched)
    if ($('#owner-store-owned').is(':checked')) {
      setOwner(currentSerial, { storeOwned: true });
      bootstrap.Modal.getOrCreateInstance('#ownerModal').hide();
      onSavedCallback?.();
      return;
    }

    const owner = {
      name: $('#owner-name').val().trim(),
      phone: $('#owner-phone').val().trim(),
      address: $('#owner-address').val().trim(),
    };
    if (!owner.name) return;

    const repair = {
      channel: $('#repair-channel').val().trim(),
      tech: $('#repair-tech').val().trim(),
      faultDescription: $('#repair-fault').val().trim(),
      priceEstimate: $('#repair-estimate').val().trim(),
      foundFaults: $('#repair-found').val().trim(),
      actualPrice: $('#repair-price').val().trim(),
      done: $('#repair-done').is(':checked'),
    };

    setOwner(currentSerial, owner);
    setRepair(currentSerial, repair);

    // Remember channel/tech for the combo box dropdowns
    const history = Storage.repairFieldHistory.get();
    history.channels = rememberValue(history.channels, repair.channel);
    history.techs = rememberValue(history.techs, repair.tech);
    Storage.repairFieldHistory.set(history);

    Storage.lastOwnerEntry.set({
      name: owner.name,
      phone: owner.phone,
      address: owner.address,
      channel: repair.channel,
      tech: repair.tech,
    });

    bootstrap.Modal.getOrCreateInstance('#ownerModal').hide();
    onSavedCallback?.();
  });
}

/**
 * Show the owner/repair details modal for a controller identified by serial
 * number. Fields are prefilled when the controller already has stored
 * details (editing). Skipping (or dismissing) stores nothing; the modal
 * will be offered again on the next connection.
 * @param {string} serial - Controller serial number
 * @param {Function|null} onSaved - Called after the details have been stored
 */
export function show_owner_modal(serial, onSaved = null) {
  if (!serial) return;
  currentSerial = serial;
  onSavedCallback = onSaved;
  initListeners();

  // Describe the controller in the title, e.g. "White BDM-040 Sony DualSense"
  const record = getController(serial);
  const description = [record?.color, record?.boardModel, record?.deviceName].filter(Boolean).join(' ');
  $('#owner-modal-controller').text(description ? `— ${description}` : '');

  // Offer previously entered channels/techs in the combo box dropdowns
  const history = Storage.repairFieldHistory.get();
  populateDatalist('repair-channel-options', history.channels);
  populateDatalist('repair-tech-options', history.techs);

  // Prefill with the stored details when editing, otherwise start fresh.
  // The tech field defaults to the most recently used tech; the channel
  // deliberately does not.
  const owner = record?.owner;
  const repair = record?.repair;
  $('#owner-name').val(owner?.name || '');
  $('#owner-phone').val(owner?.phone || '');
  $('#owner-address').val(owner?.address || '');
  $('#repair-channel').val(repair?.channel || '');
  $('#repair-tech').val(repair?.tech || history.techs[0] || '');
  $('#repair-fault').val(repair?.faultDescription || '');
  $('#repair-estimate').val(repair?.priceEstimate || '');
  $('#repair-found').val(repair?.foundFaults || '');
  $('#repair-price').val(repair?.actualPrice || '');
  $('#repair-done').prop('checked', !!repair?.done);
  $('#owner-store-owned').prop('checked', !!owner?.storeOwned);
  $('#owner-modal-desc').toggleClass('d-none', !!owner?.name || !!owner?.storeOwned);
  updateStoreOwnedState();

  // Offer the last entered details, when there are any
  const last = Storage.lastOwnerEntry.get();
  const parts = last ? [last.name, last.phone, last.address, last.tech, last.channel].filter(Boolean) : [];
  $('#owner-last-entry').toggleClass('d-none', parts.length === 0);
  $('#owner-last-entry-text').text(parts.join(' · '));

  bootstrap.Modal.getOrCreateInstance('#ownerModal').show();
}
