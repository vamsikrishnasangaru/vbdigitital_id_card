import { existsSync } from 'fs';
import type { LaunchOptions } from 'puppeteer';

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

/** Resolve Chrome/Chromium for headless PDF rendering (VPS uses system Chromium). */
export function resolveChromeExecutable(): string | undefined {
  const fromEnv =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    process.env.CHROME_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  return candidates.find((p) => existsSync(p));
}

export function getPuppeteerLaunchOptions(): LaunchOptions {
  const executablePath = resolveChromeExecutable();
  return {
    headless: true,
    args: PUPPETEER_ARGS,
    ...(executablePath ? { executablePath } : {}),
  };
}
