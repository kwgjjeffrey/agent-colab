// jsdom has no layout observer; production uses the browser's native observer.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  TestResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.getAnimations = () => [];
