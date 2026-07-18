if (process.env.SLOPSIFT_MODEL && !process.env.WRITINGLINT_MODEL_SOURCE) {
  process.env.WRITINGLINT_MODEL_SOURCE = process.env.SLOPSIFT_MODEL;
}

await import('../../scripts/setup-model.mjs');
