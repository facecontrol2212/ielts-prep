import '@testing-library/jest-dom/vitest'

// jsdom implements neither of these; the exam runner uses both.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (!window.HTMLMediaElement.prototype.play) {
  window.HTMLMediaElement.prototype.play = async () => {}
}
