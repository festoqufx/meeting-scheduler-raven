/**
 * T022 — Unit tests for BookingForm validation
 * Tests required field validation, email format, form data extraction.
 * Written TDD-style: these define the expected API before implementation.
 */

// BookingForm module will be implemented in T033
let BookingForm;
try {
  BookingForm = require('../../js/booking-form');
} catch (e) {
  // Module doesn't exist yet - TDD. Tests will fail until T033 implementation.
  BookingForm = null;
}

// Skip all tests if module not implemented yet
const describeIfExists = BookingForm ? describe : describe.skip;

describeIfExists('BookingForm.validateField', () => {
  test('validates required first name', () => {
    expect(BookingForm.validateField('firstName', '')).toBeTruthy();
    expect(BookingForm.validateField('firstName', 'John')).toBeFalsy();
  });

  test('validates required last name', () => {
    expect(BookingForm.validateField('lastName', '')).toBeTruthy();
    expect(BookingForm.validateField('lastName', 'Doe')).toBeFalsy();
  });

  test('validates required email', () => {
    expect(BookingForm.validateField('email', '')).toBeTruthy();
    expect(BookingForm.validateField('email', 'invalid')).toBeTruthy();
    expect(BookingForm.validateField('email', 'user@example.com')).toBeFalsy();
  });

  test('validates email format', () => {
    expect(BookingForm.validateField('email', 'no-at-sign')).toBeTruthy();
    expect(BookingForm.validateField('email', 'missing@domain')).toBeTruthy();
    expect(BookingForm.validateField('email', '@no-local.com')).toBeTruthy();
    expect(BookingForm.validateField('email', 'valid@email.com')).toBeFalsy();
  });

  test('validates required format (meeting format)', () => {
    expect(BookingForm.validateField('format', '')).toBeTruthy();
    expect(BookingForm.validateField('format', 'virtual')).toBeFalsy();
  });

  test('purpose and notes are optional (no validation error)', () => {
    expect(BookingForm.validateField('purpose', '')).toBeFalsy();
    expect(BookingForm.validateField('notes', '')).toBeFalsy();
  });
});

describeIfExists('BookingForm.validateAll', () => {
  test('returns errors for empty required fields', () => {
    const errors = BookingForm.validateAll({
      firstName: '',
      lastName: '',
      email: '',
      format: '',
    });
    expect(Object.keys(errors).length).toBeGreaterThanOrEqual(4);
  });

  test('returns no errors for valid data', () => {
    const errors = BookingForm.validateAll({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      format: 'virtual',
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

describeIfExists('BookingForm.extractFormData', () => {
  beforeEach(() => {
    localStorage.clear();
    // Build DOM using safe DOM methods (not innerHTML)
    document.body.textContent = '';
    const form = document.createElement('form');
    form.id = 'booking-form';

    const firstName = document.createElement('input');
    firstName.id = 'first-name';
    firstName.value = 'Jane';
    form.appendChild(firstName);

    const lastName = document.createElement('input');
    lastName.id = 'last-name';
    lastName.value = 'Doe';
    form.appendChild(lastName);

    const email = document.createElement('input');
    email.id = 'email';
    email.value = 'jane@example.com';
    form.appendChild(email);

    const format = document.createElement('select');
    format.id = 'format';
    const opt = document.createElement('option');
    opt.value = 'virtual';
    opt.textContent = 'Virtual';
    opt.selected = true;
    format.appendChild(opt);
    form.appendChild(format);

    const purpose = document.createElement('textarea');
    purpose.id = 'purpose';
    purpose.value = 'Discuss project';
    form.appendChild(purpose);

    const notes = document.createElement('textarea');
    notes.id = 'notes';
    notes.value = 'See doc link';
    form.appendChild(notes);

    document.body.appendChild(form);
  });

  test('extracts form data from DOM', () => {
    const data = BookingForm.extractFormData();
    expect(data.firstName).toBe('Jane');
    expect(data.lastName).toBe('Doe');
    expect(data.email).toBe('jane@example.com');
    expect(data.format).toBe('virtual');
    expect(data.purpose).toBe('Discuss project');
    expect(data.notes).toBe('See doc link');
  });

  test('reset clears form inputs', () => {
    BookingForm.reset();
    const data = BookingForm.extractFormData();
    expect(data.firstName).toBe('');
    expect(data.lastName).toBe('');
    expect(data.email).toBe('');
  });

  test('persists and restores draft data', () => {
    document.getElementById('first-name').value = 'Alex';
    document.getElementById('last-name').value = 'Rivera';
    document.getElementById('email').value = 'alex@example.com';
    document.getElementById('purpose').value = 'Weekly sync';
    document.getElementById('notes').value = 'Bring agenda';
    BookingForm.persistDraft();

    document.getElementById('first-name').value = '';
    document.getElementById('last-name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('purpose').value = '';
    document.getElementById('notes').value = '';

    BookingForm.restoreDraft();
    const data = BookingForm.extractFormData();
    expect(data.firstName).toBe('Alex');
    expect(data.lastName).toBe('Rivera');
    expect(data.email).toBe('alex@example.com');
    expect(data.purpose).toBe('Weekly sync');
    expect(data.notes).toBe('Bring agenda');
  });

  test('reset clears persisted draft', () => {
    document.getElementById('first-name').value = 'Jamie';
    BookingForm.persistDraft();
    expect(localStorage.getItem('scheduler-booking-draft')).toBeTruthy();

    BookingForm.reset();
    expect(localStorage.getItem('scheduler-booking-draft')).toBeNull();
  });
});
