import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import { getPuppeteerLaunchOptions, resolveChromeExecutable } from './puppeteer-launch';

/** CR80 card size at 300 DPI (matches IdCardDesigner render mode). */
const CARD_PPI = 300;
const CARD_SIZES = {
  HORIZONTAL: { width: Math.round(3.375 * CARD_PPI), height: Math.round(2.125 * CARD_PPI) },
  VERTICAL: { width: Math.round(2.125 * CARD_PPI), height: Math.round(3.375 * CARD_PPI) },
} as const;

@Injectable()
export class IdCardRendererService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdCardRendererService.name);
  private browser: puppeteer.Browser | null = null;
  private readonly frontendUrl: string;

  constructor(private configService: ConfigService) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  private isTransientBrowserError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return (
      msg.includes('Connection closed') ||
      msg.includes('Target closed') ||
      msg.includes('Session closed') ||
      msg.includes('Browser has disconnected') ||
      msg.includes('Navigation failed because browser has disconnected') ||
      msg.includes('Protocol error')
    );
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
    if (this.browser) return;

    const launchOptions = getPuppeteerLaunchOptions();
    const chromePath = launchOptions.executablePath ?? resolveChromeExecutable();
    this.logger.log(
      chromePath
        ? `Launching Puppeteer with ${chromePath}`
        : 'Launching Puppeteer with bundled Chrome (run: pnpm exec puppeteer browsers install chrome)',
    );

    try {
      this.browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Puppeteer failed: ${message}. On VPS: apt install chromium-browser, or set PUPPETEER_EXECUTABLE_PATH in .env, or run "cd apps/api && pnpm exec puppeteer browsers install chrome".`,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
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
    const attemptOnce = async (): Promise<Buffer> => {
      if (!this.browser) await this.ensureBrowser();
      const page = await this.browser!.newPage();
      try {
        this.logger.log(`Navigating to ${url}...`);
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
        await this.waitForRenderReady(page);

        const pdfBuffer = await page.pdf({
          printBackground: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          preferCSSPageSize: true,
          ...options,
        });

        return Buffer.from(pdfBuffer);
      } finally {
        await page.close();
      }
    };

    try {
      return await attemptOnce();
    } catch (err) {
      if (!this.isTransientBrowserError(err)) throw err;
      await this.restartBrowser(err instanceof Error ? err.message : 'transient browser error');
      return await attemptOnce();
    }
  }

  async renderCard(
    templateId: string,
    studentId: string,
    token?: string,
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
  ): Promise<Buffer> {
    const attemptOnce = async (): Promise<Buffer> => {
      if (!this.browser) await this.ensureBrowser();

      const size = CARD_SIZES[orientation];
      const page = await this.browser!.newPage();
      try {
        const url = `${this.frontendUrl}/render/${templateId}/${studentId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);
        await page.setViewport({
          width: size.width + 80,
          height: size.height + 80,
          deviceScaleFactor: 1,
        });

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
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
        await page.close();
      }
    };

    try {
      return await attemptOnce();
    } catch (err) {
      if (!this.isTransientBrowserError(err)) throw err;
      await this.restartBrowser(err instanceof Error ? err.message : 'transient browser error');
      return await attemptOnce();
    }
  }
}
