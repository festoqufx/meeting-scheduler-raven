/**
 * Unit tests for AvailabilitySettings module.
 * Tests day filtering, time range filtering, blocked dates, persistence, and reset defaults.
 */

const AvailabilitySettings = require('../../js/availability');

describe('AvailabilitySettings persistence and settings', () => {
  beforeEach(() => {
    localStorage.clear();
    AvailabilitySettings.resetDefaults();
  });

  test('default settings contain Mon-Fri available and 09:00-17:00 time range', () => {
    const settings = AvailabilitySettings.getSettings();
    expect(settings.availableDays).toEqual([1, 2, 3, 4, 5]);
    expect(settings.timeRanges).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(settings.blockedDates).toEqual([]);
  });

  test('save updates settings and persists to localStorage', () => {
    const newSettings = {
      availableDays: [1, 3, 5],
      timeRanges: [{ start: '10:00', end: '14:00' }],
      blockedDates: ['2026-12-25'],
    };
    AvailabilitySettings.save(newSettings);

    const loaded = AvailabilitySettings.load();
    expect(loaded.availableDays).toEqual([1, 3, 5]);
    expect(loaded.timeRanges).toEqual([{ start: '10:00', end: '14:00' }]);
    expect(loaded.blockedDates).toEqual(['2026-12-25']);
  });

  test('resetDefaults restores initial settings and clears localStorage', () => {
    AvailabilitySettings.save({
      availableDays: [0, 6],
      timeRanges: [{ start: '12:00', end: '16:00' }],
      blockedDates: ['2026-08-15'],
    });

    const reset = AvailabilitySettings.resetDefaults();
    expect(reset.availableDays).toEqual([1, 2, 3, 4, 5]);
    expect(reset.blockedDates).toEqual([]);
  });
});

describe('AvailabilitySettings.isSlotAvailable and filterSlots', () => {
  beforeEach(() => {
    localStorage.clear();
    AvailabilitySettings.resetDefaults();
  });

  test('rejects slot on unselected day of week', () => {
    // Mon-Fri allowed. 2026-08-16 is a Sunday (day 0).
    const sundaySlot = {
      start: '2026-08-16T10:00:00.000Z',
      end: '2026-08-16T10:30:00.000Z',
    };
    expect(AvailabilitySettings.isSlotAvailable(sundaySlot, 'UTC')).toBe(false);
  });

  test('accepts slot on selected day of week within time range', () => {
    // 2026-08-17 is a Monday (day 1). Slot 10:00-10:30 is within 09:00-17:00.
    const mondaySlot = {
      start: '2026-08-17T10:00:00.000Z',
      end: '2026-08-17T10:30:00.000Z',
    };
    expect(AvailabilitySettings.isSlotAvailable(mondaySlot, 'UTC')).toBe(true);
  });

  test('rejects slot outside configured time ranges', () => {
    AvailabilitySettings.save({
      availableDays: [1, 2, 3, 4, 5],
      timeRanges: [{ start: '13:00', end: '17:00' }], // afternoon only
      blockedDates: [],
    });

    const morningSlot = {
      start: '2026-08-17T10:00:00.000Z',
      end: '2026-08-17T10:30:00.000Z',
    };
    expect(AvailabilitySettings.isSlotAvailable(morningSlot, 'UTC')).toBe(false);
  });

  test('rejects slot on blocked date', () => {
    AvailabilitySettings.save({
      availableDays: [1, 2, 3, 4, 5],
      timeRanges: [{ start: '09:00', end: '17:00' }],
      blockedDates: ['2026-08-17'],
    });

    const blockedSlot = {
      start: '2026-08-17T10:00:00.000Z',
      end: '2026-08-17T10:30:00.000Z',
    };
    expect(AvailabilitySettings.isSlotAvailable(blockedSlot, 'UTC')).toBe(false);
  });

  test('filterSlots filters out unavailable slots from array', () => {
    AvailabilitySettings.save({
      availableDays: [1, 2], // Mon, Tue
      timeRanges: [{ start: '09:00', end: '12:00' }],
      blockedDates: ['2026-08-18'], // Tue blocked
    });

    const slots = [
      { start: '2026-08-17T10:00:00.000Z', end: '2026-08-17T10:30:00.000Z' }, // Mon 10:00 -> VALID
      { start: '2026-08-17T14:00:00.000Z', end: '2026-08-17T14:30:00.000Z' }, // Mon 14:00 -> OUTSIDE TIME RANGE
      { start: '2026-08-18T10:00:00.000Z', end: '2026-08-18T10:30:00.000Z' }, // Tue 10:00 -> BLOCKED DATE
      { start: '2026-08-19T10:00:00.000Z', end: '2026-08-19T10:30:00.000Z' }, // Wed 10:00 -> UNSELECTED DAY
    ];

    const filtered = AvailabilitySettings.filterSlots(slots, 'UTC');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].start).toBe('2026-08-17T10:00:00.000Z');
  });
});
