/** PM2 config for VPS — run: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'vb-web',
      /** Use full .next output — standalone tracing misses client reference manifests on pnpm monorepos. */
      cwd: '/var/www/id-app/apps/web',
      script: 'pnpm',
      args: 'exec next start --port 3000 --hostname 0.0.0.0',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
      },
    },
    {
      name: 'vb-api',
      cwd: '/var/www/id-app/apps/api',
      script: 'dist/main.js',
      interpreter: 'node',
      max_memory_restart: '1536M',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
        ID_CARD_BATCH_CONCURRENCY: '1',
        ID_CARD_BATCH_PAGE_SIZE: '10',
        ID_CARD_BATCH_PIXEL_RATIO: '5',
        ID_CARD_BATCH_RETRY_CONCURRENCY: '1',
        ID_CARD_BATCH_PAGE_PREPARE_TIMEOUT_MS: '90000',
        ID_CARD_CARD_TIMEOUT_MS: '40000',
        ID_CARD_JOB_STALE_AFTER_PROGRESS_MS: '900000',
        GOOGLE_DRIVE_UPLOAD_CONCURRENCY: '8',
      },
    },
  ],
};
