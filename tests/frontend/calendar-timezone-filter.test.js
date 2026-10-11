/**
 * Integration-style regression test for CalendarUI slot filtering timezone.
 *
 * Ensures Step 3 filtering uses scheduler default_timezone (from settings)
 * instead of viewer-selected timezone, which previously hid valid slots.
 */

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setupDOM() {
  document.body.textContent = '';

  const ids = ['calendar-container', 'calendar-status', 'jump-to-next-available', 'loading', 'error-banner'];
  ids.forEach((id) => {
    const el = document.createElement(id === 'jump-to-next-available' ? 'button' : 'div');
    el.id = id;
    document.body.appendChild(el);
  });
}

describe('CalendarUI timezone filtering', () => {
  let CalendarUI;

  beforeEach(() => {
    jest.resetModules();
    setupDOM();

    global.App = {
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      showError: jest.fn(),
    };

    global.ConfigLoader = {
      getConfig: () => ({
        settings: {
          default_timezone: 'America/New_York',
          min_notice_hours: 12,
          max_advance_days: 90,
        },
      }),
    };

    // Viewer timezone intentionally differs from scheduler default timezone.
    global.TimezoneUtil = {
      getTimezone: () => 'Asia/Manila',
      setTimezone: jest.fn(),
    };

    global.AvailabilitySettings = {
      filterSlots: jest.fn((slots) => slots),
      isSlotAvailable: jest.fn(() => true),
    };

    global.ApiClient = {
      getAvailableSlots: jest.fn(() => Promise.resolve({
        success: true,
        slots: [
          { start: '2026-10-14T14:30:00.000Z', end: '2026-10-14T14:45:00.000Z' },
        ],
      })),
    };

    class FakeCalendar {
      constructor(_el, options) {
        this.options = options;
        this.view = { type: options.initialView || 'timeGridWeek' };
      }
      render() {
        if (this.options.loading) this.options.loading(true);
        const info = {
          start: new Date('2026-10-12T00:00:00.000Z'),
          end: new Date('2026-10-19T00:00:00.000Z'),
          startStr: '2026-10-12T00:00:00.000Z',
          endStr: '2026-10-19T00:00:00.000Z',
        };
        this.options.events(
          info,
          () => { if (this.options.loading) this.options.loading(false); },
          () => { if (this.options.loading) this.options.loading(false); }
        );
      }
      destroy() {}
      getDate() { return new Date('2026-10-12T00:00:00.000Z'); }
      refetchEvents() {}
      today() {}
      next() {}
      gotoDate() {}
    }

    global.FullCalendar = { Calendar: FakeCalendar };
    CalendarUI = require('../../js/calendar');
  });

  test('filters slot availability using scheduler default timezone from settings', async () => {
    CalendarUI.init(15, jest.fn());
    await flush();
    await flush();

    expect(global.AvailabilitySettings.filterSlots).toHaveBeenCalled();
    const timezoneArg = global.AvailabilitySettings.filterSlots.mock.calls[0][1];
    expect(timezoneArg).toBe('America/New_York');
  });
});

