import { describe, it, expect } from 'vitest';
import { extractDate, extractAbsoluteDate, extractRelativeDate } from '../src/orchestrator/dateExtraction';
import { resolveRelativeDate, addDays } from '../src/utils/dateResolver';
import { stripNullish } from '../src/utils/stripNullish';

const TODAY = '2026-10-08'; // Thursday
describe('date extraction inside sentences (Asia/Kolkata business date)', () => {
  it.each([
    ['Jaipur to Goa flight tomorrow', '2026-10-09'], ['kal ki flight dikhao', '2026-10-09'], ['aaj ki flight', '2026-10-08'],
    ['parso jaana hai', '2026-10-10'], ['day after tomorrow please', '2026-10-10'], ['in 5 days', '2026-10-13'], ['3 days later', '2026-10-11'],
    ['5 din baad Goa', '2026-10-13'], ['next friday', '2026-10-09'], ['this friday', '2026-10-09'], ['next thursday', '2026-10-15'], ['agle monday', '2026-10-12'],
    ['this weekend trip', '2026-10-10'], ['next weekend', '2026-10-10'], ['Dubai on 15 November', '2026-11-15'], ['Nov 15', '2026-11-15'],
    ['15/11', '2026-11-15'], ['15-11-2027', '2027-11-15'], ['2026-12-25', '2026-12-25'],
  ])('%s → %s', (t, d) => expect(extractDate(t, TODAY)).toBe(d));
  it('rolls past day/month to next year; rejects impossible dates', () => {
    expect(extractAbsoluteDate('5 march', TODAY)).toBe('2027-03-05');
    expect(extractAbsoluteDate('31 feb', TODAY)).toBeUndefined();
    expect(extractAbsoluteDate('32 november', TODAY)).toBeUndefined();
  });
  it('returns undefined when there is no date', () => { expect(extractDate('cheapest flight to Dubai', TODAY)).toBeUndefined(); expect(extractRelativeDate('hello', TODAY)).toBeUndefined(); });
  it('month boundaries / leap years', () => { expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); expect(resolveRelativeDate('in 30 days', '2026-01-31')?.date).toBe('2026-03-02'); });
});

describe('stripNullish (root-cause fix for STATE_CORRUPT)', () => {
  it('removes null/undefined keys recursively, keeps falsy values', () => {
    expect(stripNullish({ a: null, b: undefined, c: 0, d: '', e: false, f: { g: null, h: [1, { i: null, j: 2 }] } })).toEqual({ c: 0, d: '', e: false, f: { h: [1, { j: 2 }] } });
  });
});
