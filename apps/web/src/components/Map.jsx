import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { MapLibreMap, Marker, Popup, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl v6 parses tiles in a real ES module worker. Vite's default
// bundling rewrites module paths and breaks that worker's own import of its
// sibling maplibre-gl-shared.mjs -- the map then "hangs" with no tiles and
// no error (controls/markers still work since those run on the main
// thread). `?worker&url` routes it through Vite's worker pipeline so the
// emitted chunk is self-contained. See maplibre/maplibre-gl-js's v6 notes.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

// Free CARTO basemap -- no API key required. Voyager (vs. the flatter
// Positron) renders roads, parks, and water so the map reads at a glance.
const DEFAULT_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Shared with MapView.jsx so pin colors and the Active Units list dots never
// drift out of sync with each other.
export const MARKER_COLORS = {
  available: '#16a34a',
  in_use: '#2563eb',
  dropped: '#dc2626',
  maintenance: '#64748b',
  // Driver pins aren't trailer-status-keyed like the rest of this map --
  // fixed to the app's brand orange so they read as their own category at
  // a glance rather than looking like a stray trailer/truck status.
  driver: '#fd8b00',
};

// Same glyphs already used for these concepts in AppShell's nav (Loads,
// Trailers) -- reusing the app's existing icon language instead of adding
// new SVG assets.
const UNIT_ICONS = {
  truck: 'local_shipping',
  trailer: 'rv_hookup',
  driver: 'person_pin_circle',
};

// maplibre's default teardrop pin only supports a flat color, not an icon --
// a custom element replaces it with a colored circular badge instead.
// center-anchored, which is the correct anchor for a circular mark (unlike
// the teardrop, which anchors at its point).
function buildMarkerElement({ unitType, status }) {
  const el = document.createElement('div');
  el.className = 'material-symbols-outlined';
  el.textContent = UNIT_ICONS[unitType] ?? 'location_on';
  Object.assign(el.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    fontSize: '18px',
    color: '#ffffff',
    backgroundColor: MARKER_COLORS[status] ?? '#64748b',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
    cursor: 'pointer',
  });
  return el;
}

function buildPopupContent({ label, status, driverName }) {
  const container = document.createElement('div');
  container.className = 'text-sm';

  const title = document.createElement('p');
  title.className = 'font-semibold text-primary';
  title.textContent = label;
  container.appendChild(title);

  if (status) {
    const statusEl = document.createElement('p');
    statusEl.className = 'mt-0.5 text-xs uppercase tracking-wide text-text/60';
    statusEl.textContent = status.replace('_', ' ');
    container.appendChild(statusEl);
  }

  if (driverName) {
    const driverEl = document.createElement('p');
    driverEl.className = 'mt-0.5 text-xs text-text/60';
    driverEl.textContent = driverName;
    container.appendChild(driverEl);
  }

  return container;
}

// Plain maplibre-gl wrapper -- deliberately not mapcn/shadcn, styled with
// this app's existing Tailwind conventions instead of CSS-variable theming.
export const Map = forwardRef(function Map(
  { center = [-84.388, 33.749], zoom = 5, markers = [], className = '', style = DEFAULT_STYLE },
  ref
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjectsRef = useRef([]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo(lngLat, options = {}) {
        mapRef.current?.flyTo({ center: lngLat, zoom: 10, ...options });
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new MapLibreMap({
      container: containerRef.current,
      style,
      center,
      zoom,
    });
    map.addControl(new NavigationControl(), 'bottom-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only re-create the map instance on mount -- center/zoom/style changes
    // after that are intentionally not re-initializing the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    markerObjectsRef.current.forEach((marker) => marker.remove());

    markerObjectsRef.current = markers.map((markerData) => {
      const marker = new Marker({ element: buildMarkerElement(markerData) }).setLngLat([
        markerData.lng,
        markerData.lat,
      ]);
      marker.setPopup(new Popup({ offset: 20 }).setDOMContent(buildPopupContent(markerData)));
      marker.addTo(map);
      return marker;
    });

    return () => {
      markerObjectsRef.current.forEach((marker) => marker.remove());
    };
  }, [markers]);

  return <div ref={containerRef} className={className} />;
});
