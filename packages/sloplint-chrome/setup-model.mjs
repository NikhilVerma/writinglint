if (process.env.SLOPLINT_MODEL && !process.env.WRITINGLINT_MODEL_SOURCE) {
  process.env.WRITINGLINT_MODEL_SOURCE = process.env.SLOPLINT_MODEL;
}

await import('../../scripts/setup-model.mjs');
