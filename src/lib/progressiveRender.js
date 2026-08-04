function createProgressToken() {
  return { cancelled: false, generation: 0 };
}
function bumpProgressToken(token) {
  token.cancelled = true;
  token.generation += 1;
  const next = { cancelled: false, generation: token.generation };
  return next;
}
function runProgressiveBatches({
  items,
  batchSize,
  budgetMs,
  token,
  processBatch,
  onComplete,
  onCancel
}) {
  let index = 0;
  const generation = token.generation;
  let raf = 0;
  const step = (deadline) => {
    if (token.cancelled || token.generation !== generation) {
      onCancel?.();
      return;
    }
    const start = typeof deadline === "number" ? deadline : performance.now();
    while (index < items.length) {
      if (token.cancelled || token.generation !== generation) {
        onCancel?.();
        return;
      }
      const end = Math.min(items.length, index + batchSize);
      processBatch(items.slice(index, end), index);
      index = end;
      if (performance.now() - start >= budgetMs) break;
    }
    if (index >= items.length) {
      onComplete?.();
      return;
    }
    raf = requestAnimationFrame(() => step(performance.now()));
  };
  raf = requestAnimationFrame(() => step(performance.now()));
  return () => {
    token.cancelled = true;
    if (raf) cancelAnimationFrame(raf);
  };
}
function createFpsMonitor(alpha = 0.08) {
  let ema = 60;
  let last = 0;
  return {
    sample(now = performance.now()) {
      if (last > 0) {
        const dt = Math.max(1e-3, (now - last) / 1e3);
        const fps = 1 / dt;
        ema = ema * (1 - alpha) + fps * alpha;
      }
      last = now;
      return ema;
    },
    get fps() {
      return ema;
    },
    reset() {
      ema = 60;
      last = 0;
    }
  };
}
export {
  bumpProgressToken,
  createFpsMonitor,
  createProgressToken,
  runProgressiveBatches
};
