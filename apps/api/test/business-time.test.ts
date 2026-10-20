import { describe, expect, it } from 'vitest';
import { addBusinessMinutes, businessMinutesBetween, slaEventState, zonedToUtc, type BusinessCalendar } from '../src/lib/business-time.js';

const day: [string, string][] = [['08:00', '17:00']];
const brussels: BusinessCalendar = {
  timezone: 'Europe/Brussels',
  schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: [], sun: [] },
  holidays: ['2026-12-25'],
};

describe('business time', () => {
  it('converts wall-clock time in a zone to UTC across DST', () => {
    expect(zonedToUtc(2026, 1, 15, 8, 0, 'Europe/Brussels').toISOString()).toBe('2026-01-15T07:00:00.000Z'); // CET
    expect(zonedToUtc(2026, 7, 15, 8, 0, 'Europe/Brussels').toISOString()).toBe('2026-07-15T06:00:00.000Z'); // CEST
  });

  it('adds minutes within the same business day', () => {
    // Monday 2026-10-19 10:00 Brussels (CEST = UTC+2)
    const start = new Date('2026-10-19T08:00:00Z');
    expect(addBusinessMinutes(start, 60, brussels).toISOString()).toBe('2026-10-19T09:00:00.000Z');
  });

  it('rolls over evenings and weekends', () => {
    // Friday 2026-10-23 16:00 local, 2h target → Monday 09:00 local
    const start = new Date('2026-10-23T14:00:00Z');
    expect(addBusinessMinutes(start, 120, brussels).toISOString()).toBe('2026-10-26T08:00:00.000Z'); // CET after DST end
  });

  it('starts counting at opening time when created outside business hours', () => {
    // Saturday → Monday 08:00 + 30 min
    const start = new Date('2026-10-17T12:00:00Z');
    expect(addBusinessMinutes(start, 30, brussels).toISOString()).toBe('2026-10-19T06:30:00.000Z');
  });

  it('skips holidays', () => {
    // Thursday 24 Dec 16:30 local + 60 min → 30 min on 24th, 25th holiday, weekend → Monday 28th 08:30
    const start = new Date('2026-12-24T15:30:00Z');
    expect(addBusinessMinutes(start, 60, brussels).toISOString()).toBe('2026-12-28T07:30:00.000Z');
  });

  it('treats a missing calendar as 24x7', () => {
    const start = new Date('2026-10-17T12:00:00Z');
    expect(addBusinessMinutes(start, 90, null).toISOString()).toBe('2026-10-17T13:30:00.000Z');
  });

  it('measures business minutes between instants', () => {
    // Friday 16:00 local → Monday 09:00 local = 60 + 60
    expect(businessMinutesBetween(new Date('2026-10-23T14:00:00Z'), new Date('2026-10-26T08:00:00Z'), brussels)).toBe(120);
    expect(businessMinutesBetween(new Date('2026-10-26T08:00:00Z'), new Date('2026-10-23T14:00:00Z'), brussels)).toBe(0);
  });

  it('derives SLA event states', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    const due = new Date('2026-10-19T10:30:00Z');
    expect(slaEventState({ dueAt: null, doneAt: null, breached: false, paused: false, now, warningMinutes: 60 })).toBe('none');
    expect(slaEventState({ dueAt: due, doneAt: null, breached: false, paused: false, now, warningMinutes: 60 })).toBe('at_risk');
    expect(slaEventState({ dueAt: due, doneAt: null, breached: false, paused: false, now, warningMinutes: 10 })).toBe('pending');
    expect(slaEventState({ dueAt: due, doneAt: null, breached: false, paused: true, now, warningMinutes: 10 })).toBe('paused');
    expect(slaEventState({ dueAt: new Date('2026-10-19T09:00:00Z'), doneAt: null, breached: false, paused: false, now, warningMinutes: 10 })).toBe('breached');
    expect(slaEventState({ dueAt: due, doneAt: new Date('2026-10-19T10:10:00Z'), breached: false, paused: false, now, warningMinutes: 10 })).toBe('met');
    expect(slaEventState({ dueAt: due, doneAt: new Date('2026-10-19T11:00:00Z'), breached: false, paused: false, now, warningMinutes: 10 })).toBe('met_late');
  });
});
