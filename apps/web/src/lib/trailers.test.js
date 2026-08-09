import { describe, it, expect } from 'vitest';
import { deriveTrailerLocation, computeTrailerLocationCounts, formatRelativeTime } from './trailers.js';

describe('deriveTrailerLocation', () => {
  it('maps idle trailer statuses to their own yard-side location', () => {
    expect(deriveTrailerLocation({ status: 'available' }, undefined)).toBe('At Yard');
    expect(deriveTrailerLocation({ status: 'dropped' }, undefined)).toBe('Dropped at Yard');
    expect(deriveTrailerLocation({ status: 'maintenance' }, undefined)).toBe('Maintenance');
  });

  it('derives location from the active load status when the trailer is in use', () => {
    expect(deriveTrailerLocation({ status: 'in_use' }, { status: 'assigned' })).toBe('At Plant');
    expect(deriveTrailerLocation({ status: 'in_use' }, { status: 'picked_up' })).toBe('At Plant');
    expect(deriveTrailerLocation({ status: 'in_use' }, { status: 'in_transit' })).toBe('In Transit');
    expect(deriveTrailerLocation({ status: 'in_use' }, { status: 'delivered' })).toBe('At Customer');
  });

  it('falls back to In Transit for an in_use trailer with no matching active load', () => {
    expect(deriveTrailerLocation({ status: 'in_use' }, undefined)).toBe('In Transit');
  });
});

describe('computeTrailerLocationCounts', () => {
  it('counts trailers per derived location', () => {
    const trailers = [
      { id: '1', status: 'available' },
      { id: '2', status: 'dropped' },
      { id: '3', status: 'in_use' },
      { id: '4', status: 'in_use' },
    ];
    const activeLoadByTrailerId = new Map([
      ['3', { status: 'in_transit' }],
      ['4', { status: 'delivered' }],
    ]);

    expect(computeTrailerLocationCounts(trailers, activeLoadByTrailerId)).toEqual({
      'At Plant': 0,
      'In Transit': 1,
      'At Customer': 1,
      'Dropped at Yard': 1,
    });
  });

  it('returns all-zero counts for no trailers', () => {
    expect(computeTrailerLocationCounts([], new Map())).toEqual({
      'At Plant': 0,
      'In Transit': 0,
      'At Customer': 0,
      'Dropped at Yard': 0,
    });
  });
});

describe('formatRelativeTime', () => {
  it('returns an em dash for a missing timestamp', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });

  it('formats minutes, hours, and days ago', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5m ago');
    expect(formatRelativeTime(new Date(Date.now() - 3 * 60 * 60000).toISOString())).toBe('3h ago');
    expect(formatRelativeTime(new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString())).toBe('2d ago');
  });
});
