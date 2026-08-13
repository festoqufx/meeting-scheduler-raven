/**
 * CalendarUI — FullCalendar wrapper for displaying available time slots.
 * Fetches slots from the backend and renders them as clickable events.
 * Dynamically adjusts visible time range based on available slots.
 */

var CalendarUI = (function () {
  var _calendar = null;
  var _durationMinutes = 15;
  var _onSlotSelected = null;
  var _containerEl = null;
  var _currentMinTime = '09:00:00';
  var _currentMaxTime = '17:00:00';
  var _prefetchedEvents = null;
  var _seekingSlots = false;
  var _didAutoSeek = false;
  var DEFAULT_MIN_TIME = '09:00:00';
  var DEFAULT_MAX_TIME = '17:00:00';

  function init(durationMinutes, onSlotSelected) {
    _durationMinutes = durationMinutes;
    _onSlotSelected = onSlotSelected;
    _currentMinTime = DEFAULT_MIN_TIME;
    _currentMaxTime = DEFAULT_MAX_TIME;
    _prefetchedEvents = null;
    _seekingSlots = false;
    _didAutoSeek = false;

    _containerEl = document.getElementById('calendar-container');
    if (!_containerEl) {
      console.error('CalendarUI: #calendar-container not found');
      return;
    }
    _containerEl.textContent = '';

    if (typeof FullCalendar === 'undefined') {
      showFatal('Calendar library failed to load. Please refresh the page.');
      return;
    }

    buildCalendar(_currentMinTime, _currentMaxTime);
  }

  function showFatal(message) {
    if (!_containerEl) return;
    _containerEl.textContent = '';
    var msg = document.createElement('div');
    msg.className = 'no-slots-message';
    msg.textContent = message;
    _containerEl.appendChild(msg);
    if (typeof App !== 'undefined' && App.showError) {
      App.showError(message, 8000);
    }
  }

  function getPlugins() {
    var plugins = [];
    if (typeof FullCalendarIntlTimezonePlugin !== 'undefined') {
      plugins.push(FullCalendarIntlTimezonePlugin);
    }
    return plugins;
  }

  function resolveTimeZone() {
    var tz = (typeof TimezoneUtil !== 'undefined' && TimezoneUtil.getTimezone()) || 'local';
    // Without a named-timezone plugin, FullCalendar only supports local/UTC.
    if (tz !== 'local' && tz !== 'UTC' && typeof FullCalendarIntlTimezonePlugin === 'undefined') {
      return 'local';
    }
    return tz;
  }

  function makeCalendarOptions(minTime, maxTime, initialView, initialDate) {
    var currentTimezone = resolveTimeZone();
    var opts = {
      plugins: getPlugins(),
      initialView: initialView || 'timeGridWeek',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,timeGridDay',
      },
      allDaySlot: false,
      slotMinTime: minTime,
      slotMaxTime: maxTime,
      slotDuration: minutesToSlotDuration(_durationMinutes),
      timeZone: currentTimezone,
      contentHeight: 500,
      expandRows: true,
      nowIndicator: true,
      selectable: false,
      editable: false,
      events: fetchSlots,
      eventClick: function (info) {
        info.jsEvent.preventDefault();
        var start = info.event.extendedProps.utcStart || (info.event.start && info.event.start.toISOString());
        var end = info.event.extendedProps.utcEnd || (info.event.end && info.event.end.toISOString());
        if (!start || !end) {
          if (typeof App !== 'undefined') {
            App.showError('Could not read the selected time. Please try another slot.', 5000);
          }
          return;
        }
        if (_onSlotSelected) {
          _onSlotSelected({ start: start, end: end });
        }
      },
      eventClassNames: function () {
        return ['available-slot'];
      },
      loading: function (isLoading) {
        if (typeof App === 'undefined') return;
        if (isLoading) {
          App.showLoading();
        } else {
          App.hideLoading();
          equalizeSlotRows();
        }
      },
      validRange: function () {
        var config = ConfigLoader.getConfig();
        var maxDays = (config && config.settings && config.settings.max_advance_days) || 90;
        var minHours = (config && config.settings && config.settings.min_notice_hours) || 12;
        // Start of today (local) so the current week remains navigable; actual
        // slot eligibility is still enforced by the backend min-notice window.
        var start = new Date();
        start.setHours(0, 0, 0, 0);
        return {
          start: start,
          end: new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000),
        };
      },
    };
    if (initialDate) {
      opts.initialDate = initialDate;
    }
    return opts;
  }

  function buildCalendar(minTime, maxTime, initialView, initialDate) {
    if (_calendar) {
      _calendar.destroy();
      _calendar = null;
    }
    _currentMinTime = minTime;
    _currentMaxTime = maxTime;
    try {
      _calendar = new FullCalendar.Calendar(
        _containerEl,
        makeCalendarOptions(minTime, maxTime, initialView, initialDate)
      );
      _calendar.render();
    } catch (err) {
      console.error('CalendarUI: failed to render', err);
      showFatal('Could not open the calendar: ' + (err && err.message ? err.message : 'unknown error'));
      return;
    }
    setTimeout(equalizeSlotRows, 100);
  }

  function fetchSlots(info, successCallback, failureCallback) {
    var tz = resolveTimeZone();
    if (_prefetchedEvents !== null) {
      var cached = _prefetchedEvents;
      _prefetchedEvents = null;
      if (typeof AvailabilitySettings !== 'undefined') {
        cached = cached.filter(function (evt) {
          return AvailabilitySettings.isSlotAvailable({ start: evt.start, end: evt.end }, tz);
        });
      }
      displayEvents(cached);
      successCallback(cached);
      maybeSeekWeekWithSlots(cached);
      return;
    }

    ApiClient.getAvailableSlots(
      info.startStr,
      info.endStr,
      _durationMinutes
    )
      .then(function (result) {
        var rawSlots = result.slots || [];
        var filteredSlots = typeof AvailabilitySettings !== 'undefined'
          ? AvailabilitySettings.filterSlots(rawSlots, tz)
          : rawSlots;

        var events = filteredSlots.map(function (slot) {
          return {
            title: 'Available',
            start: slot.start,
            end: slot.end,
            display: 'block',
            classNames: ['available-slot'],
            extendedProps: {
              utcStart: slot.start,
              utcEnd: slot.end,
            },
          };
        });

        var newMin;
        var newMax;
        if (events.length === 0) {
          newMin = DEFAULT_MIN_TIME;
          newMax = DEFAULT_MAX_TIME;
        } else {
          var range = getTimeRange(events);
          newMin = range.minTime;
          newMax = range.maxTime;
        }

        if (newMin !== _currentMinTime || newMax !== _currentMaxTime) {
          var currentDate = _calendar ? _calendar.getDate() : null;
          var currentView = _calendar ? _calendar.view.type : 'timeGridWeek';
          _prefetchedEvents = events;
          successCallback([]);
          setTimeout(function () {
            buildCalendar(newMin, newMax, currentView, currentDate);
          }, 0);
          return;
        }

        displayEvents(events);
        successCallback(events);
        maybeSeekWeekWithSlots(events);
      })
      .catch(function (err) {
        if (typeof App !== 'undefined') {
          App.showError('Failed to load available times: ' + err.message, 5000);
        }
        showNoSlotsMessage('Could not load available times. Please try again.');
        failureCallback(err);
      });
  }

  /**
   * If the current week is empty, jump to the earliest available slot in the
   * booking window so users are not stuck on a blank calendar.
   */
  function maybeSeekWeekWithSlots(events) {
    if (!_calendar || (events && events.length > 0)) {
      _seekingSlots = false;
      return;
    }
    if (_seekingSlots || _didAutoSeek) return;
    _seekingSlots = true;
    _didAutoSeek = true;

    var config = ConfigLoader.getConfig();
    var maxDays = (config && config.settings && config.settings.max_advance_days) || 90;
    var minHours = (config && config.settings && config.settings.min_notice_hours) || 12;
    var rangeStart = new Date(Date.now() + minHours * 60 * 60 * 1000).toISOString();
    var rangeEnd = new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000).toISOString();

    ApiClient.getAvailableSlots(rangeStart, rangeEnd, _durationMinutes)
      .then(function (result) {
        var slots = (result && result.slots) || [];
        if (!_calendar) {
          _seekingSlots = false;
          return;
        }
        if (slots.length === 0) {
          _seekingSlots = false;
          showNoSlotsMessage('No available times in the booking window. Please try another duration or check back later.');
          return;
        }
        var firstStart = slots[0].start;
        for (var i = 1; i < slots.length; i++) {
          if (new Date(slots[i].start) < new Date(firstStart)) {
            firstStart = slots[i].start;
          }
        }
        _calendar.gotoDate(firstStart);
        // gotoDate triggers a fresh fetch; allow that fetch to render normally
        setTimeout(function () { _seekingSlots = false; }, 0);
      })
      .catch(function () {
        _seekingSlots = false;
        showNoSlotsMessage();
      });
  }

  function displayEvents(events) {
    if (events.length === 0) {
      showNoSlotsMessage();
    } else {
      hideNoSlotsMessage();
    }
  }

  /**
   * Visible time range from slot boundaries, in the calendar timezone
   * (NOT the browser's local timezone — that mismatch hides all slots).
   */
  function getTimeRange(events) {
    var tz = resolveTimeZone();
    var minMinutes = 24 * 60;
    var maxMinutes = 0;

    events.forEach(function (evt) {
      var startParts = getZoneHoursMinutes(evt.start, tz);
      var endParts = getZoneHoursMinutes(evt.end, tz);
      var startTotal = startParts.h * 60 + startParts.m;
      var endTotal = endParts.h * 60 + endParts.m;
      // If end is exactly midnight, treat as 24:00 for range purposes
      if (endTotal === 0 && startTotal > 0) endTotal = 24 * 60;

      if (startTotal < minMinutes) minMinutes = startTotal;
      if (endTotal > maxMinutes) maxMinutes = endTotal;
    });

    if (minMinutes >= maxMinutes) {
      return { minTime: DEFAULT_MIN_TIME, maxTime: DEFAULT_MAX_TIME };
    }

    // Pad by 30 minutes when possible for readability
    minMinutes = Math.max(0, minMinutes - 30);
    maxMinutes = Math.min(24 * 60, maxMinutes + 30);

    return {
      minTime: minutesToSlotDuration(minMinutes),
      maxTime: minutesToSlotDuration(maxMinutes),
    };
  }

  function getZoneHoursMinutes(dateInput, timeZone) {
    if (timeZone === 'local') {
      var local = new Date(dateInput);
      return { h: local.getHours(), m: local.getMinutes() };
    }
    if (typeof FullCalendarIntlTimezone !== 'undefined') {
      var arr = FullCalendarIntlTimezone.timestampToArray(
        timeZone === 'UTC' ? 'UTC' : timeZone,
        new Date(dateInput).getTime()
      );
      return { h: arr[3], m: arr[4] };
    }
    try {
      var map = {};
      new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      }).formatToParts(new Date(dateInput)).forEach(function (p) {
        if (p.type !== 'literal') map[p.type] = p.value;
      });
      var h = parseInt(map.hour, 10);
      if (h === 24) h = 0;
      return { h: h, m: parseInt(map.minute, 10) };
    } catch (e) {
      var d = new Date(dateInput);
      return { h: d.getHours(), m: d.getMinutes() };
    }
  }

  function equalizeSlotRows() {
    if (!_containerEl) return;
    var scroller = _containerEl.querySelector('.fc-scroller-liquid-absolute');
    var slotsTable = _containerEl.querySelector('.fc-timegrid-slots table');
    if (scroller && slotsTable) {
      slotsTable.style.height = scroller.offsetHeight + 'px';
    }
  }

  function padTime(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function showNoSlotsMessage(customText) {
    var existing = _containerEl.querySelector('.no-slots-message');
    var text = customText || 'No available times this week. Try navigating to another week.';
    if (!existing) {
      var msg = document.createElement('div');
      msg.className = 'no-slots-message';
      msg.textContent = text;
      _containerEl.appendChild(msg);
    } else {
      existing.textContent = text;
    }
  }

  function hideNoSlotsMessage() {
    var existing = _containerEl.querySelector('.no-slots-message');
    if (existing) {
      existing.remove();
    }
  }

  function minutesToSlotDuration(minutes) {
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return padTime(h) + ':' + padTime(m) + ':00';
  }

  function refresh() {
    _seekingSlots = false;
    if (_calendar) {
      _calendar.refetchEvents();
    }
  }

  function setTimezone(timezone) {
    if (!timezone) return;
    TimezoneUtil.setTimezone(timezone);
    _seekingSlots = false;
    _didAutoSeek = false;
    if (_calendar) {
      var currentDate = _calendar.getDate();
      var currentView = _calendar.view.type;
      buildCalendar(_currentMinTime, _currentMaxTime, currentView, currentDate);
    }
  }

  function destroy() {
    _seekingSlots = false;
    if (_calendar) {
      _calendar.destroy();
      _calendar = null;
    }
  }

  return {
    init: init,
    refresh: refresh,
    setTimezone: setTimezone,
    destroy: destroy,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CalendarUI;
}
