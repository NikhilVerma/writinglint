if (process.env.HUSKY === '0' || process.env.NODE_ENV === 'production') {
  process.exit(0);
}

try {
  const husky = (await import('husky')).default;
  const message = husky();
  if (message) console.log(message);
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.log('husky is not installed; skipping Git hook setup');
}
