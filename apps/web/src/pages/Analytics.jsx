import { useEffect, useState } from 'react';
import { defineChart, barY, lineY } from '@tanstack/charts';
import { pie, polar, radialArc } from '@tanstack/charts/polar';
import { tooltip } from '@tanstack/charts/tooltip';
import { d3Curve } from '@tanstack/charts/d3/shape';
import { curveMonotoneX } from 'd3-shape';
import { scaleBand } from '@tanstack/charts-scales/band';
import { scaleLinear } from '@tanstack/charts-scales/linear';
import { scalePoint } from '@tanstack/charts-scales/point';
import { Chart } from '@tanstack/react-charts';
import { ThinkingOrb } from 'thinking-orbs';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import { fetchLoads } from '../lib/loads.js';
import {
  computeStatusCounts,
  computeWeeklyVolume,
  computeOnTimeRate,
  computeVolumeByCustomer,
  filterLoadsByRange,
} from '../lib/analytics.js';

const RANGE_OPTIONS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

const WEEKLY_SERIES = [
  { key: 'dispatched', label: 'Dispatched', color: '#0f172a', dashed: false },
  { key: 'delivered', label: 'Delivered', color: '#2563eb', dashed: true },
];

const STATUS_LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  dropped: 'Dropped',
};

const STATUS_COLORS = {
  pending: '#64748b',
  assigned: '#64748b',
  picked_up: '#002147',
  in_transit: '#2563eb',
  delivered: '#16a34a',
  dropped: '#dc2626',
};

function ChartCard({ title, children, className = '' }) {
  return (
    <section className={`rounded border border-border bg-white p-6 ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text/60">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusLegend({ rows }) {
  return (
    <ul className="mt-4 space-y-1.5 text-sm">
      {rows.map((row) => (
        <li key={row.status} className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[row.status] ?? '#64748b' }}
              aria-hidden="true"
            />
            {row.label}
          </span>
          <span className="text-text/60">
            {row.count} ({row.percent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

function buildStatusDonut(rows) {
  if (rows.length === 0) return null;

  const slices = pie(rows, { value: 'count' });
  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.82,
        marks: [
          radialArc(slices, {
            innerRadius: ({ radius }) => radius * 0.58,
            cornerRadius: 4,
            color: 'status',
            key: 'status',
          }),
        ],
      }),
    ],
    color: {
      domain: rows.map((row) => row.status),
      range: rows.map((row) => STATUS_COLORS[row.status] ?? '#64748b'),
    },
    tooltip: {
      use: tooltip,
      format: (point) => `${point.datum.label}: ${point.datum.count} (${point.datum.percent}%)`,
    },
  });
}

function buildCustomerBar(loads) {
  const rows = computeVolumeByCustomer(loads);
  if (rows.length === 0) return null;

  return defineChart({
    marks: [barY(rows, { x: 'customer', y: 'count', fill: '#002147', radius: 6, maxThickness: 72 })],
    x: { scale: scaleBand },
    y: { scale: scaleLinear },
  });
}

function WeeklyLegend() {
  return (
    <div className="mb-2 flex items-center justify-end gap-4 text-xs text-text/70">
      {WEEKLY_SERIES.map((series) => (
        <span key={series.key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2"
            style={{ borderColor: series.color }}
            aria-hidden="true"
          />
          {series.label}
        </span>
      ))}
    </div>
  );
}

function buildWeeklyLine(loads) {
  const buckets = computeWeeklyVolume(loads);
  const rowsBySeries = {
    dispatched: buckets.map((bucket) => ({ label: bucket.label, value: bucket.dispatched })),
    delivered: buckets.map((bucket) => ({ label: bucket.label, value: bucket.delivered })),
  };

  return defineChart({
    marks: WEEKLY_SERIES.map((series) =>
      lineY(rowsBySeries[series.key], {
        x: 'label',
        y: 'value',
        stroke: series.color,
        strokeWidth: series.dashed ? 2 : 2.5,
        strokeDasharray: series.dashed ? '5 4' : undefined,
        curve: d3Curve(curveMonotoneX),
        points: true,
      })
    ),
    x: { scale: scalePoint },
    y: { scale: scaleLinear },
  });
}

function buildOnTimeGauge(rate) {
  const parts = [
    { id: 'onTime', value: rate },
    { id: 'remaining', value: 100 - rate },
  ];
  const slices = pie(parts, { value: 'value', startAngle: -Math.PI * 0.75, endAngle: Math.PI * 0.75 });

  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.84,
        marks: [
          radialArc(slices, {
            innerRadius: ({ radius }) => radius * 0.72,
            cornerRadius: 999,
            color: 'id',
            key: 'id',
          }),
        ],
      }),
    ],
    color: { domain: ['onTime', 'remaining'], range: ['#16a34a', '#e2e8f0'] },
  });
}

export default function Analytics() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'dispatcher';
  const [loads, setLoads] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('month');

  useEffect(() => {
    let cancelled = false;
    fetchLoads(supabase)
      .then((data) => {
        if (!cancelled) setLoads(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rangedLoads = loads ? filterLoadsByRange(loads, range) : null;
  const totalLoads = rangedLoads?.length ?? 0;
  const statusRows = rangedLoads
    ? computeStatusCounts(rangedLoads).map((row) => ({
        ...row,
        label: STATUS_LABELS[row.status] ?? row.status,
        percent: Math.round((row.count / totalLoads) * 100),
      }))
    : [];
  const statusChart = rangedLoads ? buildStatusDonut(statusRows) : null;
  const customerChart = isStaff && rangedLoads ? buildCustomerBar(rangedLoads) : null;
  const weeklyChart = rangedLoads ? buildWeeklyLine(rangedLoads) : null;
  const onTimeRate = rangedLoads ? computeOnTimeRate(rangedLoads) : null;
  const gaugeChart = onTimeRate !== null ? buildOnTimeGauge(onTimeRate) : null;

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text/70">Shipment volume, status mix, and delivery performance.</p>
        </div>
        <select
          value={range}
          onChange={(event) => setRange(event.target.value)}
          aria-label="Time range"
          className="rounded border border-border bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mt-4 rounded border border-status-dropped/30 bg-status-dropped/5 p-3 text-sm text-status-dropped">
          Couldn&apos;t load analytics: {error}
        </p>
      )}

      {!error && loads === null && (
        <p className="mt-6 flex items-center gap-2 text-sm text-text/60">
          <ThinkingOrb size={20} />
          Loading…
        </p>
      )}

      {!error && loads?.length === 0 && <p className="mt-6 text-sm text-text/60">No loads yet.</p>}

      {!error && loads && loads.length > 0 && rangedLoads.length === 0 && (
        <p className="mt-6 text-sm text-text/60">No loads in this time range.</p>
      )}

      {!error && rangedLoads && rangedLoads.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="Loads by Status">
            {statusChart && (
              <>
                <Chart definition={statusChart} aspectRatio={1} initialWidth={320} ariaLabel="Loads by status" />
                <StatusLegend rows={statusRows} />
              </>
            )}
          </ChartCard>

          {isStaff && (
            <ChartCard title="Volume by Customer">
              {customerChart && (
                <Chart
                  definition={customerChart}
                  aspectRatio={4 / 3}
                  initialWidth={320}
                  ariaLabel="Load volume by customer"
                />
              )}
            </ChartCard>
          )}

          <ChartCard title="On-Time Delivery Rate">
            {gaugeChart ? (
              <div className="relative">
                <Chart
                  definition={gaugeChart}
                  aspectRatio={1}
                  initialWidth={320}
                  ariaLabel={`On-time delivery rate: ${onTimeRate}%`}
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-primary">{onTimeRate}%</span>
                  <span className="text-xs text-text/60">on time</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text/60">No delivered loads with an appointment yet.</p>
            )}
          </ChartCard>

          <ChartCard title="Weekly Volume — Dispatched vs. Delivered" className="md:col-span-2">
            {weeklyChart && (
              <>
                <WeeklyLegend />
                <Chart
                  definition={weeklyChart}
                  aspectRatio={2.4}
                  initialWidth={640}
                  ariaLabel="Weekly dispatched and delivered load volume"
                />
              </>
            )}
          </ChartCard>
        </div>
      )}
    </AppShell>
  );
}
