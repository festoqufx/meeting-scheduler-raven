/**
 * AvailabilitySettings — manages user availability preferences.
 * Configures available days (Mon-Sun), time ranges, and blocked dates with localStorage persistence.
 */

var AvailabilitySettings = (function () {
  var STORAGE_KEY = 'scheduler-availability-settings';

  var DEFAULT_SETTINGS = {
    availableDays: [1, 2, 3, 4, 5], // Mon(1) - Fri(5)
    timeRanges: [
      { start: '09:00', end: '17:00' }
    ],
    blockedDates: [],
  };

  var _settings = null;
  var _onChangeCallbacks = [];

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function parseMinutes(timeStr) {
    if (!timeStr) return 0;
    var parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        var parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.availableDays) && Array.isArray(parsed.timeRanges)) {
          _settings = {
            availableDays: parsed.availableDays,
            timeRanges: parsed.timeRanges,
            blockedDates: Array.isArray(parsed.blockedDates) ? parsed.blockedDates : [],
          };
          return _settings;
        }
      }
    } catch (e) {
      /* ignore */
    }
    _settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    return _settings;
  }

  function save(settings) {
    _settings = settings || _settings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    } catch (e) {
      /* ignore */
    }
    notifyChange();
  }

  function resetDefaults() {
    _settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    notifyChange();
    return _settings;
  }

  function getSettings() {
    if (!_settings) {
      load();
    }
    return _settings;
  }

  function onChange(cb) {
    if (typeof cb === 'function') {
      _onChangeCallbacks.push(cb);
    }
  }

  function notifyChange() {
    _onChangeCallbacks.forEach(function (cb) {
      try {
        cb(_settings);
      } catch (e) {
        console.error('AvailabilitySettings callback error:', e);
      }
    });
  }

  function getZoneDateParts(dateInput, timeZone) {
    var date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;

    if (!timeZone || timeZone === 'local') {
      return {
        dayOfWeek: date.getDay(),
        dateStr: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
        minutes: date.getHours() * 60 + date.getMinutes(),
      };
    }

    try {
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone === 'UTC' ? 'UTC' : timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      });
      var parts = dtf.formatToParts(date);
      var map = {};
      parts.forEach(function (p) {
        if (p.type !== 'literal') map[p.type] = p.value;
      });
      var y = parseInt(map.year, 10);
      var m = parseInt(map.month, 10);
      var d = parseInt(map.day, 10);
      var h = parseInt(map.hour, 10);
      if (h === 24) h = 0;
      var min = parseInt(map.minute, 10);

      var zoneDate = new Date(Date.UTC(y, m - 1, d));
      var dayOfWeek = zoneDate.getUTCDay();

      return {
        dayOfWeek: dayOfWeek,
        dateStr: y + '-' + pad(m) + '-' + pad(d),
        minutes: h * 60 + min,
      };
    } catch (e) {
      return {
        dayOfWeek: date.getDay(),
        dateStr: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
        minutes: date.getHours() * 60 + date.getMinutes(),
      };
    }
  }

  function isSlotAvailable(slot, timeZone) {
    var settings = getSettings();
    var startParts = getZoneDateParts(slot.start, timeZone);
    var endParts = getZoneDateParts(slot.end, timeZone);

    if (!startParts || !endParts) return false;

    // 1. Check available days
    if (settings.availableDays.indexOf(startParts.dayOfWeek) === -1) {
      return false;
    }

    // 2. Check blocked dates
    if (settings.blockedDates.indexOf(startParts.dateStr) !== -1) {
      return false;
    }

    // 3. Check time ranges
    var slotStart = startParts.minutes;
    var slotEnd = endParts.minutes;
    if (slotEnd === 0 && slotStart > 0) {
      slotEnd = 24 * 60;
    }

    if (settings.timeRanges.length === 0) return true;

    var fitsRange = settings.timeRanges.some(function (range) {
      var rStart = parseMinutes(range.start);
      var rEnd = parseMinutes(range.end);
      if (rEnd === 0 && rStart > 0) rEnd = 24 * 60;
      return slotStart >= rStart && slotEnd <= rEnd;
    });

    return fitsRange;
  }

  function filterSlots(slots, timeZone) {
    if (!slots || !Array.isArray(slots)) return [];
    return slots.filter(function (slot) {
      return isSlotAvailable(slot, timeZone);
    });
  }

  function syncUIFromSettings() {
    if (typeof document === 'undefined') return;
    var settings = getSettings();
    // 1. Days
    var pills = document.querySelectorAll('#days-picker .day-pill');
    pills.forEach(function (pill) {
      var dayNum = parseInt(pill.dataset.day, 10);
      if (settings.availableDays.indexOf(dayNum) !== -1) {
        pill.classList.add('selected');
      } else {
        pill.classList.remove('selected');
      }
    });

    // 2. Time Ranges
    var container = document.getElementById('time-ranges-container');
    if (container) {
      container.textContent = '';
      settings.timeRanges.forEach(function (range) {
        addTimeRangeRow(container, range.start, range.end);
      });
      if (settings.timeRanges.length === 0) {
        addTimeRangeRow(container, '09:00', '17:00');
      }
    }

    // 3. Blocked Dates
    var blockedList = document.getElementById('blocked-dates-list');
    if (blockedList) {
      blockedList.textContent = '';
      settings.blockedDates.forEach(function (dateStr) {
        addBlockedDateTag(blockedList, dateStr);
      });
    }
  }

  function addTimeRangeRow(container, startVal, endVal) {
    var row = document.createElement('div');
    row.className = 'time-range-row';

    var startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.className = 'time-input start';
    startInput.value = startVal || '09:00';
    row.appendChild(startInput);

    var span = document.createElement('span');
    span.className = 'range-separator';
    span.textContent = 'to';
    row.appendChild(span);

    var endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.className = 'time-input end';
    endInput.value = endVal || '17:00';
    row.appendChild(endInput);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-range';
    removeBtn.textContent = '\u00d7';
    removeBtn.title = 'Remove time range';
    removeBtn.addEventListener('click', function () {
      row.remove();
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  }

  function addBlockedDateTag(container, dateStr) {
    var tag = document.createElement('span');
    tag.className = 'blocked-date-tag';
    tag.dataset.date = dateStr;
    tag.textContent = dateStr;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-tag';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', function () {
      tag.remove();
    });
    tag.appendChild(removeBtn);

    container.appendChild(tag);
  }

  function initUI(onChangedCallback) {
    if (typeof document === 'undefined') return;
    var toggleBtn = document.getElementById('toggle-availability-settings');
    var panel = document.getElementById('availability-panel');
    var closeBtn = document.getElementById('close-availability-panel');
    var saveBtn = document.getElementById('save-availability');
    var resetBtn = document.getElementById('reset-availability');
    var addRangeBtn = document.getElementById('add-time-range');
    var addBlockedBtn = document.getElementById('add-blocked-date');
    var blockedDateInput = document.getElementById('blocked-date-input');

    if (!panel) return;

    syncUIFromSettings();

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var isHidden = panel.classList.contains('hidden');
        if (isHidden) {
          syncUIFromSettings();
          panel.classList.remove('hidden');
          toggleBtn.setAttribute('aria-expanded', 'true');
        } else {
          panel.classList.add('hidden');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        panel.classList.add('hidden');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      });
    }

    var pills = document.querySelectorAll('#days-picker .day-pill');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pill.classList.toggle('selected');
      });
    });

    if (addRangeBtn) {
      addRangeBtn.addEventListener('click', function () {
        var container = document.getElementById('time-ranges-container');
        if (container) addTimeRangeRow(container, '09:00', '17:00');
      });
    }

    if (addBlockedBtn && blockedDateInput) {
      addBlockedBtn.addEventListener('click', function () {
        var val = blockedDateInput.value;
        if (!val) return;
        var container = document.getElementById('blocked-dates-list');
        if (container) {
          var existing = container.querySelector('[data-date="' + val + '"]');
          if (!existing) {
            addBlockedDateTag(container, val);
          }
        }
        blockedDateInput.value = '';
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var activeDays = [];
        var selectedPills = document.querySelectorAll('#days-picker .day-pill.selected');
        selectedPills.forEach(function (pill) {
          activeDays.push(parseInt(pill.dataset.day, 10));
        });

        var ranges = [];
        var rows = document.querySelectorAll('#time-ranges-container .time-range-row');
        rows.forEach(function (row) {
          var s = row.querySelector('.start');
          var e = row.querySelector('.end');
          if (s && e && s.value && e.value) {
            ranges.push({ start: s.value, end: e.value });
          }
        });

        var blocked = [];
        var tags = document.querySelectorAll('#blocked-dates-list .blocked-date-tag');
        tags.forEach(function (tag) {
          if (tag.dataset.date) blocked.push(tag.dataset.date);
        });

        var newSettings = {
          availableDays: activeDays,
          timeRanges: ranges,
          blockedDates: blocked,
        };

        save(newSettings);
        panel.classList.add('hidden');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        if (typeof onChangedCallback === 'function') onChangedCallback(newSettings);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        resetDefaults();
        syncUIFromSettings();
        panel.classList.add('hidden');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        if (typeof onChangedCallback === 'function') onChangedCallback(getSettings());
      });
    }
  }

  return {
    load: load,
    save: save,
    getSettings: getSettings,
    resetDefaults: resetDefaults,
    onChange: onChange,
    isSlotAvailable: isSlotAvailable,
    filterSlots: filterSlots,
    initUI: initUI,
    syncUIFromSettings: syncUIFromSettings,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AvailabilitySettings;
}
