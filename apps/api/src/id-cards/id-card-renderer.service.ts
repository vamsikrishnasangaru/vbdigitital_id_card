import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import { getPuppeteerLaunchOptions, resolveChromeExecutable } from './puppeteer-launch';

@Injectable()
export class IdCardRendererService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdCardRendererService.name);
  private browser: puppeteer.Browser | null = null;
  private readonly frontendUrl: string;

  constructor(private configService: ConfigService) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
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

  private async capturePdf(url: string, options: Record<string, unknown>): Promise<Buffer> {
    if (!this.browser) await this.ensureBrowser();
    const page = await this.browser!.newPage();

    try {
      this.logger.log(`Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });

      await page.waitForSelector('[data-render-status="ready"]', { timeout: 90000 });
      await page.waitForSelector('#id-card-canvas', { timeout: 30000 });

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
      });

      await new Promise((r) => setTimeout(r, 500));

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
  }

  async renderCard(templateId: string, studentId: string, token?: string): Promise<Buffer> {
    if (!this.browser) throw new Error('Browser not initialized');

    const page = await this.browser.newPage();
    try {
      const url = `${this.frontendUrl}/render/${templateId}/${studentId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      await page.setViewport({
        width: 1200,
        height: 800,
        deviceScaleFactor: 1,
      });

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('[data-render-status="ready"]', { timeout: 60000 });
      const element = await page.waitForSelector('#id-card-canvas', { timeout: 15000 });

      if (!element) throw new Error('Card element not found on page');

      const buffer = await element.screenshot({
        type: 'png',
        omitBackground: false,
      });

      return buffer as Buffer;
    } finally {
      await page.close();
    }
  }
}
