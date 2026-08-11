import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import {
  BATCH_RENDER_PIXEL_RATIO,
  DOWNLOAD_RENDER_PIXEL_RATIO,
} from './id-card-export.constants';
import { getPuppeteerLaunchOptions, resolveChromeExecutable } from './puppeteer-launch';

/** CR80 card layout at design PPI (96) — export sharpness comes from Stage pixelRatio. */
const CARD_PPI = 96;
const CARD_SIZES = {
  HORIZONTAL: { width: Math.round(3.375 * CARD_PPI), height: Math.round(2.125 * CARD_PPI) },
  VERTICAL: { width: Math.round(2.125 * CARD_PPI), height: Math.round(3.375 * CARD_PPI) },
} as const;

const MAX_RENDER_ATTEMPTS = 4;
/** Faster navigation for batch PNG — assets continue loading while Konva renders. */
const BATCH_GOTO_WAIT_UNTIL: puppeteer.PuppeteerLifeCycleEvent = 'domcontentloaded';
const PDF_GOTO_WAIT_UNTIL: puppeteer.PuppeteerLifeCycleEvent = 'load';
/** Parallel Puppeteer tabs during multi-card batch (env override on VPS). Default 2 — safer on 8GB VPS. */
const BATCH_RENDER_CONCURRENCY = Math.max(
  1,
  Math.min(6, Number(process.env.ID_CARD_BATCH_CONCURRENCY) || 2),
);

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
      msg.includes('Execution context was destroyed') ||
      msg.includes('Waiting failed')
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
    try {
      await this.ensureBrowser();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Puppeteer not ready at startup (${message}). API will still run; card renders launch Chrome on demand.`,
      );
    }
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

  private async prepareRenderPage(page: Page): Promise<void> {
    await page.setCacheEnabled(true);
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'websocket' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  private async waitForRenderReady(page: Page): Promise<void> {
    await page.waitForFunction(
      () => {
        const nodes = Array.from(document.querySelectorAll('[data-render-status]'));
        if (!nodes.length) return false;
        // Prefer canvas/error nodes over a parent still stuck on "loading".
        const statuses = nodes.map((n) => n.getAttribute('data-render-status'));
        if (statuses.includes('error')) return true;
        if (statuses.includes('ready')) return true;
        return false;
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
      await document.fonts?.ready;
    });

    await new Promise((r) => setTimeout(r, 50));
  }

  private async waitForBatchExportHost(page: Page): Promise<void> {
    await page.waitForFunction(
      () => (window as unknown as { __vbBatchRender?: { ready?: boolean } }).__vbBatchRender?.ready === true,
      { timeout: 120000 },
    );
  }

  private async renderStudentOnBatchPage(page: Page, studentId: string): Promise<void> {
    const error = await page.evaluate(async (id) => {
      try {
        const api = (window as unknown as { __vbBatchRender?: { renderStudent?: (sid: string) => Promise<void> } })
          .__vbBatchRender;
        if (!api?.renderStudent) throw new Error('Batch render API not ready');
        await api.renderStudent(id);
        return null;
      } catch (err: unknown) {
        return err instanceof Error ? err.message : String(err);
      }
    }, studentId);
    if (error) throw new Error(error);
    await this.waitForRenderReady(page);
  }

  private buildBatchExportUrl(
    templateId: string,
    token: string,
    studentIds: string[],
    exportRatio: number = BATCH_RENDER_PIXEL_RATIO,
  ): string {
    const params = new URLSearchParams({
      token,
      exportRatio: String(exportRatio),
    });
    if (studentIds.length) {
      params.set('studentIds', studentIds.join(','));
    }
    return `${this.frontendUrl}/render/batch-export/${templateId}?${params.toString()}`;
  }

  private async prepareBatchExportPage(
    page: Page,
    templateId: string,
    token: string,
    studentIds: string[],
    orientation: 'HORIZONTAL' | 'VERTICAL',
  ): Promise<void> {
    const size = CARD_SIZES[orientation];
    await page.setViewport({
      width: size.width + 80,
      height: size.height + 80,
      deviceScaleFactor: 1,
    });
    await page.goto(this.buildBatchExportUrl(templateId, token, studentIds, BATCH_RENDER_PIXEL_RATIO), {
      waitUntil: BATCH_GOTO_WAIT_UNTIL,
      timeout: 120000,
    });
    await this.waitForBatchExportHost(page);
  }

  private async captureCanvasPng(
    page: Page,
    _orientation: 'HORIZONTAL' | 'VERTICAL',
    pixelRatio: number = DOWNLOAD_RENDER_PIXEL_RATIO,
  ): Promise<Buffer> {
    const dataUrl = await page.evaluate(async (targetPixelRatio) => {
      const ratio = Math.max(4, targetPixelRatio);

      await document.fonts?.ready;

      const root = document.querySelector('#id-card-canvas');
      const expectedWidth = Number(root?.getAttribute('data-export-width')) || 0;
      const expectedHeight = Number(root?.getAttribute('data-export-height')) || 0;

      const waitForImages = async (container: ParentNode) => {
        const imgs = Array.from(container.querySelectorAll('img'));
        await Promise.all(
          imgs.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) resolve();
                else {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                }
              }),
          ),
        );
      };

      const exportFromStage = async (
        stage: {
          scaleX: () => number;
          scaleY: () => number;
          width: (w?: number) => number;
          height: (h?: number) => number;
          scale: (s: { x: number; y: number }) => void;
          batchDraw: () => void;
          find: (selector: string) => { toArray?: () => Array<{ image: () => unknown }> } | Array<{ image: () => unknown }>;
          toCanvas?: (config: {
            pixelRatio?: number;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }) => HTMLCanvasElement;
          toDataURL: (config?: {
            pixelRatio?: number;
            mimeType?: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          }) => string;
        },
      ) => {
        const found = stage.find('Image');
        const imageNodes =
          found && typeof (found as { toArray?: () => unknown[] }).toArray === 'function'
            ? (found as { toArray: () => Array<{ image: () => unknown }> }).toArray()
            : Array.from(found as Array<{ image: () => unknown }>);
        await Promise.all(
          imageNodes.map(
            (node) =>
              new Promise<void>((resolve) => {
                const img = node.image();
                if (!(img instanceof HTMLImageElement) || img.complete) {
                  resolve();
                  return;
                }
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
          ),
        );

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const scaleX = stage.scaleX() || 1;
        const scaleY = stage.scaleY() || 1;
        const logicalWidth = stage.width() / scaleX;
        const logicalHeight = stage.height() / scaleY;

        const oldW = stage.width();
        const oldH = stage.height();
        const needReset = scaleX !== 1 || scaleY !== 1;
        if (needReset) {
          stage.width(logicalWidth);
          stage.height(logicalHeight);
          stage.scale({ x: 1, y: 1 });
        }
        stage.batchDraw();

        try {
          if (typeof stage.toCanvas === 'function') {
            const exportCanvas = stage.toCanvas({
              pixelRatio: ratio,
              x: 0,
              y: 0,
              width: logicalWidth,
              height: logicalHeight,
            });
            const png = exportCanvas.toDataURL('image/png');
            exportCanvas.width = 0;
            exportCanvas.height = 0;
            return png;
          }
          return stage.toDataURL({
            pixelRatio: ratio,
            mimeType: 'image/png',
            x: 0,
            y: 0,
            width: logicalWidth,
            height: logicalHeight,
          });
        } finally {
          if (needReset) {
            stage.width(oldW);
            stage.height(oldH);
            stage.scale({ x: scaleX, y: scaleY });
            stage.batchDraw();
          }
        }
      };

      type KonvaStage = Parameters<typeof exportFromStage>[0];
      const KonvaGlobal = (window as unknown as { Konva?: { stages?: KonvaStage[] } }).Konva;
      const stage = KonvaGlobal?.stages?.[0];

      const canvas = document.querySelector('#id-card-canvas canvas') as HTMLCanvasElement | null;
      const canvasIsPrintResolution =
        canvas &&
        canvas.width > 0 &&
        canvas.height > 0 &&
        (!expectedWidth || canvas.width >= expectedWidth * 0.95) &&
        (!expectedHeight || canvas.height >= expectedHeight * 0.95);

      if (canvasIsPrintResolution) {
        if (root) await waitForImages(root);
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        return canvas!.toDataURL('image/png');
      }

      if (stage) {
        return exportFromStage(stage);
      }

      if (canvas?.width && canvas?.height) {
        if (root) await waitForImages(root);
        return canvas.toDataURL('image/png');
      }

      throw new Error('Konva canvas not found');
    }, pixelRatio);

    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('Failed to export card PNG');
    return Buffer.from(base64, 'base64');
  }

  private async renderCardOnPage(
    page: Page,
    templateId: string,
    studentId: string,
    token: string | undefined,
    orientation: 'HORIZONTAL' | 'VERTICAL',
    options: {
      waitUntil?: puppeteer.PuppeteerLifeCycleEvent;
      pixelRatio?: number;
    } = {},
  ): Promise<Buffer> {
    const waitUntil = options.waitUntil ?? BATCH_GOTO_WAIT_UNTIL;
    const pixelRatio = options.pixelRatio ?? DOWNLOAD_RENDER_PIXEL_RATIO;
    const size = CARD_SIZES[orientation];
    await page.setViewport({
      width: size.width + 80,
      height: size.height + 80,
      deviceScaleFactor: 1,
    });
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (pixelRatio !== DOWNLOAD_RENDER_PIXEL_RATIO) {
      params.set('exportRatio', String(pixelRatio));
    }
    const query = params.toString();
    const url = `${this.frontendUrl}/render/${templateId}/${studentId}${query ? `?${query}` : ''}`;
    await page.goto(url, { waitUntil, timeout: 120000 });
    await this.waitForRenderReady(page);
    return this.captureCanvasPng(page, orientation, pixelRatio);
  }

  async renderCardsBatch(
    templateId: string,
    studentIds: string[],
    token: string,
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Array<{ studentId: string; buffer?: Buffer; error?: string }>> {
    if (!studentIds.length) return [];

    const concurrency = Math.min(BATCH_RENDER_CONCURRENCY, studentIds.length);
    let completed = 0;
    const reportProgress = () => {
      completed += 1;
      onProgress?.(completed, studentIds.length);
    };

    const release = await this.renderSemaphore.acquire();
    try {
      return await this.withRenderRetries(`PNG batch ${templateId}`, async () => {
        const results: Array<{ studentId: string; buffer?: Buffer; error?: string }> =
          studentIds.map((studentId) => ({ studentId }));
        let nextIndex = 0;

        const worker = async () => {
          const page = await this.newPage();
          try {
            await this.prepareRenderPage(page);
            let batchPageReady = false;
            while (true) {
              const index = nextIndex++;
              if (index >= studentIds.length) break;
              const studentId = studentIds[index];
              try {
                if (!batchPageReady) {
                  await this.prepareBatchExportPage(page, templateId, token, studentIds, orientation);
                  batchPageReady = true;
                }
                await this.renderStudentOnBatchPage(page, studentId);
                const buffer = await this.captureCanvasPng(
                  page,
                  orientation,
                  BATCH_RENDER_PIXEL_RATIO,
                );
                results[index] = { studentId, buffer };
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                results[index] = { studentId, error: message };
              } finally {
                reportProgress();
              }
            }
          } finally {
            await this.safeClosePage(page);
          }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        const failedIndices = results
          .map((result, index) => (result.error ? index : -1))
          .filter((index) => index >= 0);

        for (const index of failedIndices) {
          const studentId = studentIds[index];
          try {
            await this.restartBrowser(`retry ${studentId}`);
            const page = await this.newPage();
            try {
              await this.prepareRenderPage(page);
              await this.prepareBatchExportPage(page, templateId, token, studentIds, orientation);
              await this.renderStudentOnBatchPage(page, studentId);
              const buffer = await this.captureCanvasPng(
                page,
                orientation,
                BATCH_RENDER_PIXEL_RATIO,
              );
              results[index] = { studentId, buffer };
            } finally {
              await this.safeClosePage(page);
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Batch retry failed for ${studentId}: ${message}`);
            results[index] = { studentId, error: message };
          }
        }

        return results;
      });
    } finally {
      release();
    }
  }

  private async capturePdf(url: string, options: Record<string, unknown>): Promise<Buffer> {
    const release = await this.renderSemaphore.acquire();
    try {
      return await this.withRenderRetries(`PDF ${url}`, async () => {
        const page = await this.newPage();
        try {
          await this.prepareRenderPage(page);
          page.setDefaultNavigationTimeout(120000);
          page.setDefaultTimeout(120000);
          await page.goto(url, { waitUntil: PDF_GOTO_WAIT_UNTIL, timeout: 120000 });
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
      return await this.withRenderRetries(`PNG ${studentId}`, async () => {
        const page = await this.newPage();
        try {
          await this.prepareRenderPage(page);
          return await this.renderCardOnPage(page, templateId, studentId, token, orientation);
        } finally {
          await this.safeClosePage(page);
        }
      });
    } finally {
      release();
    }
  }
}
