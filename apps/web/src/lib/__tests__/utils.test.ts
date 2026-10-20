import { describe, expect, it } from 'vitest';
import { qs } from '../api';
import { fullName, hours, initials, pluralize } from '../utils';
import { formatMinutes, formatNumber } from '@taskora/shared';

describe('qs', () => {
  it('skips empty values and joins arrays', () => {
    expect(qs({ a: 1, b: '', c: null, d: undefined, e: [1, 2], f: [] })).toBe('?a=1&e=1%2C2');
    expect(qs()).toBe('');
  });
});

describe('formatting helpers', () => {
  it('formats names, initials and hours', () => {
    expect(fullName({ firstName: 'Emma', lastName: 'Smith' })).toBe('Emma Smith');
    expect(initials('Emma Smith')).toBe('ES');
    expect(hours(90)).toBe('1.50');
    expect(pluralize(1, 'ticket')).toBe('1 ticket');
    expect(pluralize(3, 'ticket')).toBe('3 tickets');
  });

  it('formats durations and record numbers', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(150)).toBe('2h 30m');
    expect(formatNumber('TKA-', 142)).toBe('TKA-000142');
  });
});
