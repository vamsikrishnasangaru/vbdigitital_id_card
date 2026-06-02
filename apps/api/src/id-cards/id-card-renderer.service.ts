import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { getPuppeteerLaunchOptions, resolveChromeExecutable } from './puppeteer-launch';

/** CR80 card size at 300 DPI (matches IdCardDesigner render mode). */
const CARD_PPI = 300;
const CARD_SIZES = {
  HORIZONTAL: { width: Math.round(3.375 * CARD_PPI), height: Math.round(2.125 * CARD_PPI) },
  VERTICAL: { width: Math.round(2.125 * CARD_PPI), height: Math.round(3.375 * CARD_PPI) },
} as const;

const MAX_RENDER_ATTEMPTS = 4;
const GOTO_WAIT_UNTIL: puppeteer.PuppeteerLifeCycleEvent = 'load';

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

@Injectable()
export class IdCardRendererService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdCardRendererService.name);
  private browser: Browser | null = null;
  private readonly frontendUrl: string;
  private readonly renderSemaphore = new Semaphore(1);

  constructor(private configService: ConfigService) {
    const configured = this.configService.get<string>('FRONTEND_URL')?.trim();
    this.frontendUrl = configured || 'http://127.0.0.1:3000';
  }

  private isTransientBrowserError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return (
      msg.includes('Connection closed') ||
      msg.includes('Target closed') ||
      msg.includes('Session closed') ||
      msg.includes('Browser has disconnected') ||
      msg.includes('Navigation failed because browser has disconnected') ||
      msg.includes('Protocol error') ||
      msg.includes('Navigating frame was detached') ||
      msg.includes('Execution context was destroyed')
    );
  }

  private async safeClosePage(page: Page | null | undefined) {
    if (!page || page.isClosed()) return;
    try {
      await page.close();
    } catch {
      // Browser may already be gone.
    }
  }

  private async restartBrowser(reason: string) {
    this.logger.warn(`Restarting Puppeteer browser: ${reason}`);
    try {
      if (this.browser) await this.browser.close();
    } catch {
      // ignore close errors
    } finally {
      this.browser = null;
    }
    await this.ensureBrowser();
  }

  async onModuleInit() {
    await this.ensureBrowser();
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.connected) return;
    if (this.browser) {
      this.browser = null;
    }

    const launchOptions = getPuppeteerLaunchOptions();
    const chromePath = launchOptions.executablePath ?? resolveChromeExecutable();
    this.logger.log(
      chromePath
        ? `Launching Puppeteer with ${chromePath}`
        : 'Launching Puppeteer with bundled Chrome (run: pnpm exec puppeteer browsers install chrome)',
    );

    try {
      this.browser = await puppeteer.launch(launchOptions);
      this.browser.on('disconnected', () => {
        this.logger.warn('Puppeteer browser disconnected; will re-launch on next render.');
        this.browser = null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Puppeteer failed: ${message}. On VPS: apt install chromium-browser, set PUPPETEER_EXECUTABLE_PATH, FRONTEND_URL=http://127.0.0.1:3000, or run "cd apps/api && pnpm exec puppeteer browsers install chrome".`,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.browser) await this.browser.close();
    } catch {
      // ignore
    } finally {
      this.browser = null;
    }
  }

  private async withRenderRetries<T>(label: string, run: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
      try {
        return await run();
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const canRetry = this.isTransientBrowserError(err) && attempt < MAX_RENDER_ATTEMPTS;
        if (!canRetry) throw err;
        this.logger.warn(`${label}: attempt ${attempt}/${MAX_RENDER_ATTEMPTS} failed (${message}); retrying…`);
        await this.restartBrowser(message);
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    throw lastError;
  }

  private async newPage(): Promise<Page> {
    if (!this.browser?.connected) await this.ensureBrowser();
    return this.browser!.newPage();
  }

  async renderCardPdf(
    templateId: string,
    studentId: string,
    token: string,
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
  ): Promise<Buffer> {
    const url = `${this.frontendUrl}/render/${templateId}/${studentId}?token=${encodeURIComponent(token)}`;
    const pdfSize =
      orientation === 'VERTICAL'
        ? { width: '2.125in', height: '3.375in' }
        : { width: '3.375in', height: '2.125in' };
    return this.capturePdf(url, pdfSize);
  }

  async renderBatchPdf(orderId: string): Promise<Buffer> {
    const url = `${this.frontendUrl}/render/batch/${orderId}`;
    return this.capturePdf(url, { format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
  }

  private async waitForRenderReady(page: Page): Promise<void> {
    await page.waitForFunction(
      () => {
        const status = document.querySelector('[data-render-status]')?.getAttribute('data-render-status');
        return status === 'ready' || status === 'error';
      },
      { timeout: 90000 },
    );

    const renderError = await page.evaluate(() => {
      const root = document.querySelector('[data-render-status="error"]');
      return root?.textContent?.trim() || null;
    });
    if (renderError) {
      throw new Error(renderError);
    }

    await page.waitForSelector('#id-card-canvas[data-render-images-ready="true"]', { timeout: 90000 });
    await page.waitForSelector('#id-card-canvas canvas', { timeout: 30000 });

    await page.evaluate(async () => {
      const root = document.querySelector('#id-card-canvas');
      if (!root) return;
      const imgs = Array.from(root.querySelectorAll('img, canvas'));
      await Promise.all(
        imgs.map(
          (el) =>
            new Promise<void>((resolve) => {
              if (el instanceof HTMLImageElement) {
                if (el.complete) resolve();
                else {
                  el.onload = () => resolve();
                  el.onerror = () => resolve();
                }
              } else {
                resolve();
              }
            }),
        ),
      );
      await document.fonts?.ready;
    });

    await new Promise((r) => setTimeout(r, 800));
  }

  private async capturePdf(url: string, options: Record<string, unknown>): Promise<Buffer> {
    const release = await this.renderSemaphore.acquire();
    try {
      return await this.withRenderRetries(`PDF ${url}`, async () => {
        const page = await this.newPage();
        try {
          page.setDefaultNavigationTimeout(90000);
          page.setDefaultTimeout(90000);
          await page.goto(url, { waitUntil: GOTO_WAIT_UNTIL, timeout: 90000 });
          await this.waitForRenderReady(page);
          const pdfBuffer = await page.pdf({
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
            preferCSSPageSize: true,
            ...options,
          });
          return Buffer.from(pdfBuffer);
        } finally {
          await this.safeClosePage(page);
        }
      });
    } finally {
      release();
    }
  }

  async renderCard(
    templateId: string,
    studentId: string,
    token?: string,
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
  ): Promise<Buffer> {
    const release = await this.renderSemaphore.acquire();
    try {
      const size = CARD_SIZES[orientation];
      const url = `${this.frontendUrl}/render/${templateId}/${studentId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      return await this.withRenderRetries(`PNG ${studentId}`, async () => {
        const page = await this.newPage();
        try {
          page.setDefaultNavigationTimeout(90000);
          page.setDefaultTimeout(90000);
          await page.setViewport({
            width: size.width + 80,
            height: size.height + 80,
            deviceScaleFactor: 1,
          });
          await page.goto(url, { waitUntil: GOTO_WAIT_UNTIL, timeout: 90000 });
          await this.waitForRenderReady(page);

          const dataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('#id-card-canvas canvas') as HTMLCanvasElement | null;
            if (!canvas?.width || !canvas?.height) {
              throw new Error('Konva canvas not found');
            }
            return canvas.toDataURL('image/png');
          });

          const base64 = dataUrl.split(',')[1];
          if (!base64) throw new Error('Failed to export card PNG');
          return Buffer.from(base64, 'base64');
        } finally {
          await this.safeClosePage(page);
        }
      });
    } finally {
      release();
    }
  }
}
