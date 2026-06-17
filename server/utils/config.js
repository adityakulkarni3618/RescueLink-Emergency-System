if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET is missing or too short. Refusing to start in production.');
    process.exit(1);
  } else {
    console.warn('[WARN] JWT_SECRET not set — using an insecure dev-only default. DO NOT deploy like this.');
  }
}
module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h'
};
