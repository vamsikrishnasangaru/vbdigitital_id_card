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
      // Do not use PM2 env_file — it can mis-parse .env and override DATABASE_URL.
      // apps/api/src/main.ts loads /var/www/id-app/apps/api/.env via dotenv on boot.
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
        ID_CARD_BATCH_CONCURRENCY: '6',
      },
    },
  ],
};
