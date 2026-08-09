import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia -- boneyard-js's <Skeleton> uses it
// internally for dark-mode/breakpoint detection.
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement canvas 2D contexts -- thinking-orbs draws its
// loading animation on a <canvas> every frame. It null-checks getContext()
// itself, but jsdom logs a noisy "not implemented" error on every call, so
// stub a no-op context to keep test output clean.
const noopContext = new Proxy({}, { get: (target, prop) => (prop in target ? target[prop] : () => {}) });
HTMLCanvasElement.prototype.getContext = () => noopContext;
