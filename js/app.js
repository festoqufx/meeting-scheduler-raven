/**
 * App — main application orchestrator.
 * Manages 5-step navigation, loading states, error display, and wires up the booking flow.
 * Steps: 1. Meeting Type → 2. Duration → 3. Date & Time → 4. Your Details → 5. Confirmation
 */

var App = (function () {
  var _currentStep = 1;
  var _selectedType = null;
  var _selectedDuration = null;
  var _selectedSlot = null;
  var _errorTimeout = null;
  var _submitting = false;
  var _maxReachedStep = 1;
  var TZ_STORAGE_KEY = 'scheduler-timezone';

  var DURATION_OPTIONS = [
    { minutes: 15, label: '15', unit: 'min' },
    { minutes: 30, label: '30', unit: 'min' },
    { minutes: 45, label: '45', unit: 'min' },
    { minutes: 60, label: '1', unit: 'hr' },
  ];

  function init() {
    setupStepIndicatorNav();
    setupGlobalShortcuts();

    ConfigLoader.loadAll()
      .then(function (config) {
        var defaultTz = config.settings.default_timezone || 'America/New_York';
        var storedTz = null;
        try { storedTz = localStorage.getItem(TZ_STORAGE_KEY); } catch (e) { /* ignore */ }
        TimezoneUtil.detect(storedTz || defaultTz);
        if (storedTz) TimezoneUtil.setTimezone(storedTz);
        populateTimezoneSelector();

        ApiClient.init(config.settings.apps_script_url);

        // Prefetch slots for the full booking window so data is ready when user
        // reaches Step 3. One API call covers all navigable weeks.
        var minHours = config.settings.min_notice_hours || 12;
        var maxDays = config.settings.max_advance_days || 90;
        var prefetchStart = new Date();
        prefetchStart.setHours(0, 0, 0, 0);
        var prefetchEnd = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000);
        ApiClient.prefetchSlots(prefetchStart.toISOString(), prefetchEnd.toISOString());

        renderMeetingTypes(config.meetingTypes);

        document.getElementById('back-to-step-1').addEventListener('click', function () {
          _selectedType = null;
          _selectedDuration = null;
          _selectedSlot = null;
          _maxReachedStep = 1;
          if (typeof BookingForm !== 'undefined' && BookingForm.reset) {
            BookingForm.reset();
          }
          goToStep(1);
        });
        document.getElementById('back-to-step-2').addEventListener('click', function () {
          _selectedDuration = null;
          _selectedSlot = null;
          _maxReachedStep = 2;
          goToStep(2);
        });
        document.getElementById('back-to-step-3').addEventListener('click', function () {
          _selectedSlot = null;
          _maxReachedStep = 3;
          goToStep(3);
        });

        if (typeof AvailabilitySettings !== 'undefined') {
          AvailabilitySettings.initUI(function () {
            if (_currentStep === 3) {
              CalendarUI.refresh();
            }
          });
        }

        BookingForm.init(config.locations);
      })
      .catch(function (err) {
        showError('Failed to load configuration: ' + err.message);
      });
  }

  function isStepNavigable(step) {
    if (step === 1) return true;
    if (step === 2) return Boolean(_selectedType);
    if (step === 3) return Boolean(_selectedType && _selectedDuration);
    if (step === 4) return Boolean(_selectedType && _selectedDuration && _selectedSlot);
    return false;
  }

  function setupStepIndicatorNav() {
    var indicators = document.querySelectorAll('.step-indicator .step');
    indicators.forEach(function (el) {
      el.addEventListener('click', function () {
        var step = parseInt(el.dataset.step, 10);
        // Confirmation is terminal; use "Book Another" to start over.
        if (_currentStep === 5 || step === 5) return;
        if (!step || step > _maxReachedStep || step === _currentStep) return;
        if (!isStepNavigable(step)) return;

        // Going back clears later selections so state stays consistent
        if (step <= 3) {
          _selectedSlot = null;
        }
        if (step <= 2) {
          _selectedDuration = null;
          _maxReachedStep = Math.min(_maxReachedStep, 2);
        }
        if (step <= 1) {
          _selectedType = null;
          _maxReachedStep = 1;
          if (typeof BookingForm !== 'undefined' && BookingForm.reset) {
            BookingForm.reset();
          }
        }

        if (step === 2 && !_selectedType) return;
        if (step === 3 && !_selectedDuration) return;

        goToStep(step);
        if (step === 3 && _selectedDuration) {
          CalendarUI.init(_selectedDuration, onSlotSelected);
        }
      });
    });
  }

  function setupGlobalShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideError();
    });
  }

  function populateTimezoneSelector() {
    var select = document.getElementById('timezone-select');
    var timezones = TimezoneUtil.getCommonTimezones();
    var currentTz = TimezoneUtil.getTimezone();

    timezones.forEach(function (tz) {
      var option = document.createElement('option');
      option.value = tz.value;
      option.textContent = tz.label;
      if (tz.value === currentTz) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener('change', function () {
      TimezoneUtil.setTimezone(select.value);
      try { localStorage.setItem(TZ_STORAGE_KEY, select.value); } catch (e) { /* ignore */ }
      if (_currentStep === 3 && _selectedDuration) {
        if (typeof CalendarUI.setTimezone === 'function') {
          CalendarUI.setTimezone(select.value);
        } else {
          CalendarUI.refresh();
        }
      }
    });
  }

  function renderMeetingTypes(meetingTypes) {
    var container = document.getElementById('meeting-types');
    container.textContent = '';

    meetingTypes.forEach(function (type) {
      var card = document.createElement('div');
      card.className = 'meeting-type-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', type.name);

      var h3 = document.createElement('h3');
      h3.textContent = type.name;
      card.appendChild(h3);

      var desc = document.createElement('div');
      desc.className = 'description';
      desc.textContent = type.description;
      card.appendChild(desc);

      if (type.instructions) {
        var instr = document.createElement('div');
        instr.className = 'instructions';
        instr.textContent = type.instructions;
        card.appendChild(instr);
      }

      var meta = document.createElement('div');
      meta.className = 'card-meta';
      var allowed = type.allowed_durations;
      if (allowed && allowed.length) {
        meta.textContent = allowed.map(function (m) {
          return m === 60 ? '1 hr' : m + ' min';
        }).join(' · ');
      } else {
        meta.textContent = '15–60 min';
      }
      card.appendChild(meta);

      card.addEventListener('click', function () {
        selectMeetingType(type);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMeetingType(type);
        }
      });

      container.appendChild(card);
    });
  }

  function selectMeetingType(type) {
    _selectedType = type;
    _selectedDuration = null;
    _selectedSlot = null;
    document.getElementById('selected-type-info').textContent = type.name;
    renderDurationOptions();
    goToStep(2);
  }

  function renderDurationOptions() {
    var container = document.getElementById('duration-options');
    container.textContent = '';

    var allowed = _selectedType && _selectedType.allowed_durations;
    var options = DURATION_OPTIONS.filter(function (opt) {
      return !allowed || allowed.indexOf(opt.minutes) !== -1;
    });

    options.forEach(function (opt) {
      var card = document.createElement('div');
      card.className = 'duration-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', opt.label + ' ' + opt.unit);

      var value = document.createElement('div');
      value.className = 'duration-value';
      value.textContent = opt.label;
      card.appendChild(value);

      var label = document.createElement('div');
      label.className = 'duration-label';
      label.textContent = opt.unit;
      card.appendChild(label);

      card.addEventListener('click', function () {
        selectDuration(opt.minutes);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectDuration(opt.minutes);
        }
      });

      container.appendChild(card);
    });
  }

  function selectDuration(minutes) {
    _selectedDuration = minutes;
    _selectedSlot = null;
    var durationLabel = minutes === 60 ? '1 hr' : minutes + ' min';
    document.getElementById('selected-duration-info').textContent =
      _selectedType.name + ' \u2014 ' + durationLabel;
    goToStep(3);
    CalendarUI.init(minutes, onSlotSelected);
  }

  function onSlotSelected(slot) {
    _selectedSlot = slot;
    var durationLabel = _selectedDuration === 60 ? '1 hr' : _selectedDuration + ' min';
    document.getElementById('selected-slot-info').textContent =
      _selectedType.name + ' (' + durationLabel + ') \u2014 ' +
      TimezoneUtil.formatDateTime(slot.start) + ' (' +
      TimezoneUtil.getTimezoneAbbreviation() + ')';

    BookingForm.updateLocations(_selectedType.allowed_locations || null);

    var banner = document.getElementById('instruction-banner');
    if (_selectedType.instructions) {
      banner.textContent = '';
      var icon = document.createElement('span');
      icon.className = 'instruction-icon';
      icon.textContent = '\u2139';
      banner.appendChild(icon);
      banner.appendChild(document.createTextNode(' ' + _selectedType.instructions));
      banner.classList.add('visible');
    } else {
      banner.textContent = '';
      banner.classList.remove('visible');
    }

    goToStep(4);
  }

  function goToStep(step) {
    for (var i = 1; i <= 5; i++) {
      var section = document.getElementById('step-' + i);
      section.classList.remove('active');
    }

    document.getElementById('step-' + step).classList.add('active');

    if (step > _maxReachedStep) _maxReachedStep = step;

    var indicators = document.querySelectorAll('.step-indicator .step');
    indicators.forEach(function (el) {
      var s = parseInt(el.dataset.step, 10);
      el.classList.remove('active', 'completed');
      el.removeAttribute('aria-current');
      if (s === step) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'step');
        el.disabled = true;
      } else if (s < step) {
        el.classList.add('completed');
        el.disabled = false;
      } else {
        var navigable = isStepNavigable(s) && s <= _maxReachedStep && s !== 5;
        el.disabled = !navigable;
      }
    });

    var progress = document.getElementById('step-progress-bar');
    if (progress) {
      progress.style.width = (step / 5 * 100) + '%';
    }

    _currentStep = step;
    hideError();

    // Keep active step in view on smaller screens
    var activeSection = document.getElementById('step-' + step);
    if (activeSection && typeof activeSection.scrollIntoView === 'function') {
      try {
        activeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        activeSection.scrollIntoView(true);
      }
    }
  }

  function showLoading() {
    var el = document.getElementById('loading');
    el.classList.add('visible');
    el.setAttribute('aria-hidden', 'false');
  }

  function hideLoading() {
    var el = document.getElementById('loading');
    el.classList.remove('visible');
    el.setAttribute('aria-hidden', 'true');
  }

  function showError(message, autoHideMs) {
    var banner = document.getElementById('error-banner');
    banner.textContent = message;
    banner.classList.add('visible');

    if (_errorTimeout) {
      clearTimeout(_errorTimeout);
      _errorTimeout = null;
    }

    if (autoHideMs) {
      _errorTimeout = setTimeout(function () {
        hideError();
      }, autoHideMs);
    }
  }

  function hideError() {
    var banner = document.getElementById('error-banner');
    banner.classList.remove('visible');
    banner.textContent = '';
    if (_errorTimeout) {
      clearTimeout(_errorTimeout);
      _errorTimeout = null;
    }
  }

  function resolveFormatLabel(formatId) {
    var config = ConfigLoader.getConfig();
    if (!config || !config.locations) return formatId;
    var location = config.locations.find(function (loc) {
      return loc.id === formatId;
    });
    return location ? location.label : formatId;
  }

  function submitBooking(formData) {
    if (_submitting) return;

    if (!_selectedType || !_selectedDuration || !_selectedSlot) {
      showError('Please select a meeting type, duration, and time slot first.');
      return;
    }

    var config = ConfigLoader.getConfig();
    var location = config.locations.find(function (loc) {
      return loc.id === formData.format;
    });

    var locationValue = location ? location.value : formData.format;
    if (_selectedType.location_override) {
      locationValue = _selectedType.location_override;
    }

    var bookingData = {
      meetingTypeId: _selectedType.id,
      meetingTypeName: _selectedType.name,
      eventLabel: _selectedType.event_label || '',
      duration: _selectedDuration,
      start: _selectedSlot.start,
      end: _selectedSlot.end,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      format: formData.format,
      formatLabel: resolveFormatLabel(formData.format),
      location: locationValue,
      purpose: formData.purpose || '',
      notes: formData.notes || '',
    };

    _submitting = true;
    var submitBtn = document.getElementById('submit-booking');
    if (submitBtn) submitBtn.disabled = true;
    showLoading();

    ApiClient.createBooking(bookingData)
      .then(function (result) {
        hideLoading();
        _submitting = false;
        ApiClient.invalidatePrefetch();
        showConfirmation(result.booking, bookingData);
        goToStep(5);
      })
      .catch(function (err) {
        hideLoading();
        _submitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (err.code === 'SLOT_TAKEN') {
          showError('This time slot was just taken. Please select another time.', 5000);
          ApiClient.invalidatePrefetch();
          goToStep(3);
          CalendarUI.refresh();
        } else {
          showError(err.message || 'Failed to create booking. Please try again.', 8000);
        }
      });
  }

  function showToast(message) {
    var toast = document.getElementById('toast-copied');
    if (!toast) return;
    toast.textContent = message || 'Copied to clipboard';
    toast.classList.add('visible');
    setTimeout(function () {
      toast.classList.remove('visible');
    }, 1800);
  }

  function showConfirmation(booking, formData) {
    var container = document.getElementById('confirmation-content');
    container.textContent = '';

    var box = document.createElement('div');
    box.className = 'confirmation-box';

    var checkmark = document.createElement('div');
    checkmark.className = 'checkmark';
    checkmark.setAttribute('aria-hidden', 'true');
    checkmark.textContent = '\u2713';
    box.appendChild(checkmark);

    var h2 = document.createElement('h2');
    h2.textContent = 'Booking Confirmed';
    box.appendChild(h2);

    var lead = document.createElement('p');
    lead.textContent = 'You\'re all set. A confirmation email is on the way.';
    box.appendChild(lead);

    var details = document.createElement('dl');
    details.className = 'confirmation-details';
    details.id = 'confirmation-details';

    var durationLabel = _selectedDuration === 60 ? '1 hr' : _selectedDuration + ' min';
    var whenLabel = TimezoneUtil.formatDateTime(booking.start) + ' (' + TimezoneUtil.getTimezoneAbbreviation() + ')';

    var fields = [
      { label: 'Meeting Type', value: _selectedType.name },
      { label: 'Duration', value: durationLabel },
      { label: 'Date & Time', value: whenLabel },
      { label: 'Format', value: formData.formatLabel || resolveFormatLabel(formData.format) },
      { label: 'Location', value: formData.location },
      { label: 'Name', value: formData.firstName + ' ' + formData.lastName },
      { label: 'Email', value: formData.email },
    ];

    if (formData.purpose) {
      fields.push({ label: 'Purpose', value: formData.purpose });
    }

    fields.forEach(function (field) {
      var dt = document.createElement('dt');
      dt.textContent = field.label;
      details.appendChild(dt);
      var dd = document.createElement('dd');
      dd.textContent = field.value;
      details.appendChild(dd);
    });

    box.appendChild(details);

    var links = document.createElement('div');
    links.className = 'confirmation-links';

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy Details';
    copyBtn.addEventListener('click', function () {
      var text = fields.map(function (f) {
        return f.label + ': ' + f.value;
      }).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast('Details copied');
        }).catch(function () {
          showToast('Could not copy');
        });
      } else {
        showToast('Clipboard unavailable');
      }
    });
    links.appendChild(copyBtn);

    if (booking.cancelUrl) {
      var cancelLink = document.createElement('a');
      cancelLink.href = booking.cancelUrl;
      cancelLink.textContent = 'Cancel Booking';
      links.appendChild(cancelLink);
    }

    if (booking.rescheduleUrl) {
      var rescheduleLink = document.createElement('a');
      rescheduleLink.href = booking.rescheduleUrl;
      rescheduleLink.textContent = 'Reschedule';
      links.appendChild(rescheduleLink);
    }

    var bookAnother = document.createElement('a');
    bookAnother.href = './';
    bookAnother.textContent = 'Book Another';
    links.appendChild(bookAnother);

    box.appendChild(links);

    var note = document.createElement('p');
    note.className = 'confirmation-note';
    note.textContent = 'A calendar invite and confirmation email have been sent to ' + formData.email + '.';
    box.appendChild(note);

    container.appendChild(box);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else if (document.getElementById('meeting-types')) {
      init();
    }
  }

  return {
    goToStep: goToStep,
    showLoading: showLoading,
    hideLoading: hideLoading,
    showError: showError,
    hideError: hideError,
    submitBooking: submitBooking,
    getSelectedType: function () { return _selectedType; },
    getSelectedDuration: function () { return _selectedDuration; },
    getSelectedSlot: function () { return _selectedSlot; },
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}
