import { describe, it, expect } from 'vitest';
import {
  computeStatusCounts,
  computeWeeklyVolume,
  computeOnTimeRate,
  computeVolumeByCustomer,
  filterLoadsByRange,
} from './analytics.js';

describe('computeStatusCounts', () => {
  it('counts loads per status in a fixed display order', () => {
    const loads = [
      { status: 'delivered' },
      { status: 'in_transit' },
      { status: 'delivered' },
      { status: 'pending' },
    ];

    expect(computeStatusCounts(loads)).toEqual([
      { status: 'pending', count: 1 },
      { status: 'in_transit', count: 1 },
      { status: 'delivered', count: 2 },
    ]);
  });

  it('returns an empty array for no loads', () => {
    expect(computeStatusCounts([])).toEqual([]);
  });
});

describe('computeWeeklyVolume', () => {
  const now = new Date('2026-08-08T12:00:00Z'); // a Saturday

  it('buckets dispatched loads by the week of created_at', () => {
    const loads = [
      { created_at: '2026-08-08T00:00:00Z', status: 'in_transit' }, // this week (Mon 8/3)
      { created_at: '2026-08-01T00:00:00Z', status: 'in_transit' }, // prior week (Mon 7/27)
    ];

    const buckets = computeWeeklyVolume(loads, { weeks: 2, now });
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ dispatched: 1, delivered: 0 });
    expect(buckets[1]).toMatchObject({ dispatched: 1, delivered: 0 });
  });

  it('buckets delivered loads by the week of updated_at, only when status is delivered', () => {
    const loads = [
      { created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-08T00:00:00Z', status: 'delivered' },
      { created_at: '2026-08-05T00:00:00Z', updated_at: '2026-08-08T00:00:00Z', status: 'in_transit' },
    ];

    const buckets = computeWeeklyVolume(loads, { weeks: 1, now });
    expect(buckets[0].dispatched).toBe(2);
    expect(buckets[0].delivered).toBe(1);
  });

  it('drops loads that fall outside the requested window', () => {
    const loads = [{ created_at: '2020-01-01T00:00:00Z', status: 'pending' }];
    const buckets = computeWeeklyVolume(loads, { weeks: 4, now });
    expect(buckets.reduce((sum, b) => sum + b.dispatched, 0)).toBe(0);
  });
});

describe('computeOnTimeRate', () => {
  it('returns null when there is no delivered-with-appointment data', () => {
    expect(computeOnTimeRate([])).toBeNull();
    expect(computeOnTimeRate([{ status: 'in_transit', delivery_appointment_at: '2026-08-01T00:00:00Z' }])).toBeNull();
    expect(computeOnTimeRate([{ status: 'delivered', delivery_appointment_at: null }])).toBeNull();
  });

  it('computes the % delivered at or before the appointment', () => {
    const loads = [
      { status: 'delivered', delivery_appointment_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T11:00:00Z' },
      { status: 'delivered', delivery_appointment_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T12:00:00Z' },
      { status: 'delivered', delivery_appointment_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T13:00:00Z' },
      { status: 'delivered', delivery_appointment_at: '2026-08-01T12:00:00Z', updated_at: '2026-08-01T14:00:00Z' },
    ];

    expect(computeOnTimeRate(loads)).toBe(50);
  });
});

describe('computeVolumeByCustomer', () => {
  it('groups and sorts by count descending', () => {
    const loads = [
      { customer_company: 'International Paper' },
      { customer_company: 'International Paper' },
      { customer_company: 'Acme Co' },
    ];

    expect(computeVolumeByCustomer(loads)).toEqual([
      { customer: 'International Paper', count: 2 },
      { customer: 'Acme Co', count: 1 },
    ]);
  });

  it('falls back to Unknown when customer_company is missing', () => {
    expect(computeVolumeByCustomer([{ customer_company: null }])).toEqual([{ customer: 'Unknown', count: 1 }]);
  });
});

describe('filterLoadsByRange', () => {
  const now = new Date('2026-08-08T12:00:00Z');

  it('passes every load through for "all"', () => {
    const loads = [{ created_at: '2000-01-01T00:00:00Z' }];
    expect(filterLoadsByRange(loads, 'all', { now })).toBe(loads);
  });

  it('keeps loads inside the day/week/month windows and drops loads outside them', () => {
    const loads = [
      { id: 'in-day', created_at: '2026-08-08T06:00:00Z' }, // 6h ago
      { id: 'in-week-not-day', created_at: '2026-08-05T12:00:00Z' }, // 3d ago
      { id: 'in-month-not-week', created_at: '2026-07-20T12:00:00Z' }, // ~19d ago
      { id: 'outside-month', created_at: '2026-06-01T12:00:00Z' }, // ~68d ago
    ];

    expect(filterLoadsByRange(loads, 'day', { now }).map((l) => l.id)).toEqual(['in-day']);
    expect(filterLoadsByRange(loads, 'week', { now }).map((l) => l.id)).toEqual(['in-day', 'in-week-not-day']);
    expect(filterLoadsByRange(loads, 'month', { now }).map((l) => l.id)).toEqual([
      'in-day',
      'in-week-not-day',
      'in-month-not-week',
    ]);
  });

  it('includes a load if either created_at or updated_at falls in the window', () => {
    const loads = [{ id: 'old-dispatch-recent-delivery', created_at: '2000-01-01T00:00:00Z', updated_at: '2026-08-08T06:00:00Z' }];
    expect(filterLoadsByRange(loads, 'day', { now }).map((l) => l.id)).toEqual(['old-dispatch-recent-delivery']);
  });

  it('excludes a load with no dates in range at all', () => {
    const loads = [{ id: 'stale', created_at: '2000-01-01T00:00:00Z', updated_at: '2000-01-02T00:00:00Z' }];
    expect(filterLoadsByRange(loads, 'day', { now })).toEqual([]);
  });
});
