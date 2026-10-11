/**
 * BookingForm — form validation, data extraction, and submission.
 * Handles the Step 3 booking form with real-time validation.
 */

var BookingForm = (function () {
  var _locations = [];
  var DRAFT_STORAGE_KEY = 'scheduler-booking-draft';
  var DRAFT_FIELDS = ['first-name', 'last-name', 'email', 'format', 'purpose', 'notes'];

  function init(locations) {
    _locations = locations || [];
    populateFormatDropdown();
    restoreDraft();
    setupFormHandler();
  }

  function populateFormatDropdown() {
    var select = document.getElementById('format');
    // Keep the first "Select format..." option
    while (select.options.length > 1) {
      select.remove(1);
    }
    var fragment = document.createDocumentFragment();
    _locations.forEach(function (loc) {
      var option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.label;
      fragment.appendChild(option);
    });
    select.appendChild(fragment);
  }

  function setupFormHandler() {
    var form = document.getElementById('booking-form');
    if (!form) return;

    // Real-time validation on blur
    var fields = ['first-name', 'last-name', 'email', 'format'];
    fields.forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (el) {
        el.addEventListener('blur', function () {
          var name = fieldIdToName(fieldId);
          var error = validateField(name, el.value);
          showFieldError(fieldId, error);
        });
        el.addEventListener('input', function () {
          el.classList.remove('invalid');
          var errorEl = document.getElementById(fieldId + '-error');
          if (errorEl) errorEl.textContent = '';
          persistDraft();
        });
      }
    });

    var optionalFields = ['purpose', 'notes'];
    optionalFields.forEach(function (fieldId) {
      var field = document.getElementById(fieldId);
      if (!field) return;
      field.addEventListener('input', persistDraft);
    });

    var format = document.getElementById('format');
    if (format) {
      format.addEventListener('change', persistDraft);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = extractFormData();
      var errors = validateAll(data);

      // Show all errors
      clearAllErrors();
      var hasErrors = false;
      for (var field in errors) {
        var fieldId = nameToFieldId(field);
        showFieldError(fieldId, errors[field]);
        hasErrors = true;
      }

      if (!hasErrors) {
        App.submitBooking(data);
      }
    });
  }

  function getDraftFromStorage() {
    try {
      var raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function persistDraft() {
    var form = document.getElementById('booking-form');
    if (!form) return;
    var draft = {};
    DRAFT_FIELDS.forEach(function (fieldId) {
      var el = document.getElementById(fieldId);
      if (!el) return;
      draft[fieldId] = el.value || '';
    });
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      // Ignore quota/privacy-mode failures.
    }
  }

  function restoreDraft() {
    var draft = getDraftFromStorage();
    if (!draft) return;
    DRAFT_FIELDS.forEach(function (fieldId) {
      if (!Object.prototype.hasOwnProperty.call(draft, fieldId)) return;
      var el = document.getElementById(fieldId);
      if (!el) return;
      el.value = draft[fieldId];
    });
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (e) {
      // Ignore quota/privacy-mode failures.
    }
  }

  function validateField(name, value) {
    switch (name) {
      case 'firstName':
        if (!value || !value.trim()) return 'First name is required';
        return '';
      case 'lastName':
        if (!value || !value.trim()) return 'Last name is required';
        return '';
      case 'email':
        if (!value || !value.trim()) return 'Email is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
        return '';
      case 'format':
        if (!value || !value.trim()) return 'Please select a meeting format';
        return '';
      default:
        return '';
    }
  }

  function validateAll(data) {
    var errors = {};
    var fields = ['firstName', 'lastName', 'email', 'format'];
    fields.forEach(function (field) {
      var error = validateField(field, data[field]);
      if (error) {
        errors[field] = error;
      }
    });
    return errors;
  }

  function extractFormData() {
    return {
      firstName: (document.getElementById('first-name').value || '').trim(),
      lastName: (document.getElementById('last-name').value || '').trim(),
      email: (document.getElementById('email').value || '').trim(),
      format: (document.getElementById('format').value || '').trim(),
      purpose: (document.getElementById('purpose').value || '').trim(),
      notes: (document.getElementById('notes').value || '').trim(),
    };
  }

  function showFieldError(fieldId, message) {
    var input = document.getElementById(fieldId);
    var errorEl = document.getElementById(fieldId + '-error');
    if (message) {
      if (input) input.classList.add('invalid');
      if (errorEl) errorEl.textContent = message;
    } else {
      if (input) input.classList.remove('invalid');
      if (errorEl) errorEl.textContent = '';
    }
  }

  function clearAllErrors() {
    var fields = ['first-name', 'last-name', 'email', 'format'];
    fields.forEach(function (fieldId) {
      showFieldError(fieldId, '');
    });
  }

  function fieldIdToName(fieldId) {
    var map = {
      'first-name': 'firstName',
      'last-name': 'lastName',
      'email': 'email',
      'format': 'format',
    };
    return map[fieldId] || fieldId;
  }

  function nameToFieldId(name) {
    var map = {
      'firstName': 'first-name',
      'lastName': 'last-name',
      'email': 'email',
      'format': 'format',
    };
    return map[name] || name;
  }

  /**
   * Re-populate the format dropdown, optionally filtering to only allowed location IDs.
   * If allowedIds is null/undefined, shows all locations.
   */
  function updateLocations(allowedIds) {
    var filtered = _locations;
    if (allowedIds && allowedIds.length > 0) {
      filtered = _locations.filter(function (loc) {
        return allowedIds.indexOf(loc.id) !== -1;
      });
    }
    var select = document.getElementById('format');
    while (select.options.length > 1) {
      select.remove(1);
    }
    filtered.forEach(function (loc) {
      var option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.label;
      select.appendChild(option);
    });
    // Auto-select if only one option
    if (filtered.length === 1) {
      select.value = filtered[0].id;
    }
    persistDraft();
  }

  function reset() {
    var form = document.getElementById('booking-form');
    if (form) {
      form.reset();
    }
    clearAllErrors();
    clearDraft();
  }

  return {
    init: init,
    reset: reset,
    validateField: validateField,
    validateAll: validateAll,
    extractFormData: extractFormData,
    updateLocations: updateLocations,
    clearDraft: clearDraft,
    persistDraft: persistDraft,
    restoreDraft: restoreDraft,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookingForm;
}
