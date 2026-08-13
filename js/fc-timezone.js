/**
 * FullCalendar named-timezone plugin using the browser Intl API.
 * The standard FullCalendar bundle only supports 'local' and 'UTC' unless a
 * named-timezone implementation is registered — without it, setting
 * timeZone to e.g. 'America/New_York' breaks calendar rendering/slot clicks.
 */
(function (global) {
  if (!global.FullCalendar || typeof global.FullCalendar.createPlugin !== 'function') {
    return;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function partsToObject(parts) {
    var map = {};
    parts.forEach(function (p) {
      if (p.type !== 'literal') map[p.type] = p.value;
    });
    return map;
  }

  function getFormatter(timeZone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function timestampToArray(timeZone, ms) {
    var map = partsToObject(getFormatter(timeZone).formatToParts(new Date(ms)));
    var hour = parseInt(map.hour, 10);
    // Some engines emit hour '24' for midnight
    if (hour === 24) hour = 0;
    return [
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      hour,
      parseInt(map.minute, 10),
      parseInt(map.second, 10),
      0,
    ];
  }

  function offsetMinutesForInstant(timeZone, ms) {
    var arr = timestampToArray(timeZone, ms);
    var asIfUtc = Date.UTC(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5] || 0, arr[6] || 0);
    return (asIfUtc - ms) / 60000;
  }

  function NamedTimeZone(timeZoneName) {
    this.timeZoneName = timeZoneName;
  }

  NamedTimeZone.prototype.offsetForArray = function (a) {
    // Build a UTC guess then refine using the zone conversion
    var guess = Date.UTC(a[0], a[1], a[2], a[3], a[4], a[5] || 0, a[6] || 0);
    // Invert: find UTC ms whose zone wall-clock equals `a`
    var offset = offsetMinutesForInstant(this.timeZoneName, guess);
    var utcMs = guess - offset * 60000;
    // One refinement pass for DST edges
    offset = offsetMinutesForInstant(this.timeZoneName, utcMs);
    utcMs = guess - offset * 60000;
    return offsetMinutesForInstant(this.timeZoneName, utcMs);
  };

  NamedTimeZone.prototype.timestampToArray = function (ms) {
    return timestampToArray(this.timeZoneName, ms);
  };

  var plugin = global.FullCalendar.createPlugin({
    name: 'intl-named-timezone',
    namedTimeZonedImpl: NamedTimeZone,
  });

  // Expose for CalendarUI registration
  global.FullCalendarIntlTimezonePlugin = plugin;

  // Also expose helpers used by CalendarUI for slot range math
  global.FullCalendarIntlTimezone = {
    timestampToArray: timestampToArray,
    formatSlotTime: function (timeZone, dateInput) {
      var ms = dateInput instanceof Date ? dateInput.getTime() : new Date(dateInput).getTime();
      var arr = timestampToArray(timeZone, ms);
      return pad(arr[3]) + ':' + pad(arr[4]) + ':' + pad(arr[5] || 0);
    },
  };
})(typeof window !== 'undefined' ? window : this);
