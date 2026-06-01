/** PM2 config for VPS — run: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'vb-web',
      cwd: '/var/www/id-app/apps/web/.next/standalone/apps/web',
      script: 'server.js',
      interpreter: 'node',
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
      },
    },
  ],
};
