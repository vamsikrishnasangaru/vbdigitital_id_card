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
/**
 * Parallel Chromium tabs. Default 1 — concurrent tabs + SW/controllerchange reloads
 * caused "Execution context was destroyed" and 45s batch-page timeouts.
 */
const BATCH_RENDER_CONCURRENCY = Math.max(
  1,
  Math.min(3, Number(process.env.ID_CARD_BATCH_CONCURRENCY) || 1),
);
/** Students per loaded template page (load once, render many = speed). */
const BATCH_PAGE_SIZE = Math.max(
  5,
  Math.min(20, Number(process.env.ID_CARD_BATCH_PAGE_SIZE) || 20),
);
const BATCH_RETRY_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.ID_CARD_BATCH_RETRY_CONCURRENCY) || 1),
);
const BATCH_WORKER_STAGGER_MS = Math.max(
  0,
  Math.min(2000, Number(process.env.ID_CARD_BATCH_WORKER_STAGGER_MS) || 300),
);
const CARD_RENDER_TIMEOUT_MS = Math.max(
  15_000,
  Math.min(90_000, Number(process.env.ID_CARD_CARD_TIMEOUT_MS) || 40_000),
);
const BATCH_PAGE_PREPARE_TIMEOUT_MS = Math.max(
  15_000,
  Math.min(120_000, Number(process.env.ID_CARD_BATCH_PAGE_PREPARE_TIMEOUT_MS) || 90_000),
);
const BROWSER_LAUNCH_TIMEOUT_MS = Math.max(
  15_000,
  Math.min(120_000, Number(process.env.ID_CARD_BROWSER_LAUNCH_TIMEOUT_MS) || 60_000),
);
/** Fail queued jobs instead of hanging forever behind a stuck batch. */
const RENDER_LOCK_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(30 * 60_000, Number(process.env.ID_CARD_RENDER_LOCK_TIMEOUT_MS) || 20 * 60_000),
);

export type BatchCardRenderResult = {
  studentId: string;
  buffer?: Buffer;
  error?: string;
};

export type RenderCardsBatchOptions = {
  onProgress?: (completed: number, total: number) => void;
  /** Fires after each card — use to pipeline Drive uploads while rendering continues. */
  onCardRendered?: (result: BatchCardRenderResult) => void | Promise<void>;
  /** Fires once the render lock is acquired, before Chrome/pages start. */
  onPreparing?: (message: string) => void;
};

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  get isBusy(): boolean {
    return this.active >= this.limit;
  }

  async acquire(options?: {
    onWaiting?: (waitSeconds: number) => void;
    timeoutMs?: number;
    timeoutMessage?: string;
  }): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return () => this.release();
    }

    const started = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (options?.onWaiting) {
      timer = setInterval(() => {
        options.onWaiting?.(Math.floor((Date.now() - started) / 1000));
      }, 5000);
    }

    try {
      await Promise.race([
        new Promise<void>((resolve) => this.queue.push(resolve)),
        new Promise<void>((_, reject) => {
          if (!options?.timeoutMs) return;
          setTimeout(
            () =>
              reject(
                new Error(
                  options.timeoutMessage ||
                    `Renderer busy for ${Math.round((options.timeoutMs ?? 0) / 1000)}s — try again in a minute`,
                ),
              ),
            options.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearInterval(timer);
    }

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
    const looksPublic =
      !!configured &&
      /vbdigital\.tech|https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(configured);
    // Puppeteer must hit local Next.js — public URL goes through nginx and breaks/slows batch render.
    if (!configured || looksPublic) {
      this.frontendUrl = 'http://127.0.0.1:3000';
      if (looksPublic) {
        this.logger.warn(
          `FRONTEND_URL=${configured} is a public host — forcing http://127.0.0.1:3000 for ID card rendering. Update apps/api/.env to FRONTEND_URL=http://127.0.0.1:3000`,
        );
      } else {
        this.logger.warn(
          'FRONTEND_URL is not set — using http://127.0.0.1:3000. Set FRONTEND_URL=http://127.0.0.1:3000 in apps/api/.env.',
        );
      }
    } else {
      this.frontendUrl = configured;
      this.logger.log(`ID card renderer FRONTEND_URL=${this.frontendUrl}`);
    }
  }

  /** Keep a small number of tabs — each tab reuses one loaded template for many students. */
  private batchWorkerCount(totalStudents: number): number {
    if (totalStudents <= 8) return 1;
    return Math.min(BATCH_RENDER_CONCURRENCY, Math.ceil(totalStudents / BATCH_PAGE_SIZE));
  }

  private batchPageSizeCap(totalStudents: number): number {
    if (totalStudents <= 8) return totalStudents;
    return BATCH_PAGE_SIZE;
  }

  private isTransientBrowserError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /target closed|session closed|browser.*closed|connection.*closed|Protocol error|Execution context was destroyed|Waiting failed|timed out|net::ERR_|Navigation failed|Navigating frame was detached/i.test(
      message,
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

  /** Reuse a healthy browser; only launch when disconnected (avoids OOM from restart + 5 tabs). */
  private async ensureBrowserForBatch(): Promise<void> {
    if (this.browser?.connected) return;
    await this.restartBrowser('batch render');
  }

  private async launchBrowserWithTimeout(): Promise<Browser> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const launchOptions = getPuppeteerLaunchOptions();
      const chromePath = launchOptions.executablePath ?? resolveChromeExecutable();
      this.logger.log(
        chromePath
          ? `Launching Puppeteer with ${chromePath}`
          : 'Launching Puppeteer with bundled Chrome (run: pnpm exec puppeteer browsers install chrome)',
      );
      const browser = await Promise.race([
        puppeteer.launch(launchOptions),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Chrome did not start within ${BROWSER_LAUNCH_TIMEOUT_MS / 1000}s`)),
            BROWSER_LAUNCH_TIMEOUT_MS,
          );
        }),
      ]);
      return browser;
    } finally {
      if (timer) clearTimeout(timer);
    }
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

    try {
      this.browser = await this.launchBrowserWithTimeout();
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

  private async prepareRenderPage(page: Page, batch = false): Promise<void> {
    await page.setCacheEnabled(true);
    page.setDefaultNavigationTimeout(batch ? 90_000 : 120_000);
    page.setDefaultTimeout(batch ? 90_000 : 120_000);

    if (batch) {
      // Bypass any SW already controlling this Chromium profile from a prior page.
      try {
        const cdp = await page.createCDPSession();
        await cdp.send('Network.enable');
        await cdp.send('Network.setBypassServiceWorker', { bypass: true });
      } catch (err: unknown) {
        this.logger.warn(
          `Could not bypass service worker for batch page: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Block SW registration before first navigation — Serwist otherwise registers and may reload the tab.
      await page.evaluateOnNewDocument(() => {
        try {
          const blocked = {
            controller: null,
            ready: Promise.reject(new Error('SW disabled for ID card render')),
            register: () => Promise.reject(new Error('SW disabled for ID card render')),
            getRegistration: () => Promise.resolve(undefined),
            getRegistrations: () => Promise.resolve([]),
            addEventListener() {},
            removeEventListener() {},
            startMessages() {},
          };
          Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            get: () => blocked,
          });
        } catch {
          /* ignore */
        }
      });
      // No request interception on batch — interception + SW races caused hung navigations.
      return;
    }

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (
        type === 'websocket' ||
        type === 'media' ||
        type === 'manifest' ||
        type === 'eventsource' ||
        type === 'ping'
      ) {
        req.abort();
        return;
      }
      req.continue();
    });
  }

  private async waitForRenderReady(page: Page, batch = false): Promise<void> {
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
      { timeout: batch ? 60000 : 90000 },
    );

    const renderError = await page.evaluate(() => {
      const root = document.querySelector('[data-render-status="error"]');
      return root?.textContent?.trim() || null;
    });
    if (renderError) {
      throw new Error(renderError);
    }

    await page.waitForSelector('#id-card-canvas[data-render-images-ready="true"]', {
      timeout: batch ? 60000 : 90000,
    });
    if (!batch) {
      await page.waitForSelector('#id-card-canvas canvas', { timeout: 30000 });
    }

    if (!batch) {
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private async diagnoseBatchExportPage(page: Page): Promise<string> {
    try {
      const info = await page.evaluate(() => {
        const host = document.querySelector('[data-batch-export-host]');
        return {
          href: location.href,
          title: document.title,
          host: host?.getAttribute('data-batch-export-host') ?? null,
          ready: !!(window as unknown as { __vbBatchRender?: { ready?: boolean } }).__vbBatchRender
            ?.ready,
          errText: document.querySelector('[data-batch-export-host="error"]')?.textContent?.trim() || null,
          bodySnippet: (document.body?.innerText || '').slice(0, 160),
        };
      });
      return JSON.stringify(info);
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private async waitForBatchExportHost(page: Page): Promise<void> {
    try {
      const state = await page.waitForFunction(
        () => {
          const host = document.querySelector('[data-batch-export-host]');
          const hostState = host?.getAttribute('data-batch-export-host');
          if (hostState === 'error') return 'error';
          // Host "ready" means React painted the template shell; API may lag slightly behind.
          if (hostState === 'ready') return 'ready';
          if (
            (window as unknown as { __vbBatchRender?: { ready?: boolean } }).__vbBatchRender
              ?.ready === true
          ) {
            return 'ready';
          }
          return false;
        },
        { timeout: BATCH_PAGE_PREPARE_TIMEOUT_MS },
      );
      const value = await state.jsonValue();
      if (value === 'error') {
        const message = await page.evaluate(() => {
          const root = document.querySelector('[data-batch-export-host="error"]');
          return root?.textContent?.trim() || 'Batch export page failed to load';
        });
        throw new Error(message);
      }
      // Ensure __vbBatchRender exists before calling renderStudent (host ready can precede effect).
      await page.waitForFunction(
        () =>
          !!(window as unknown as { __vbBatchRender?: { ready?: boolean } }).__vbBatchRender
            ?.ready,
        { timeout: 10_000 },
      );
    } catch (err: unknown) {
      const detail = await this.diagnoseBatchExportPage(page);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Batch export host wait failed: ${message} | ${detail}`);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
  }

  private async captureCanvasPngViaScreenshot(page: Page): Promise<Buffer | null> {
    const handle = await page.evaluateHandle(() => {
      const root = document.querySelector('#id-card-canvas');
      if (!root) return null;
      const canvases = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[];
      if (!canvases.length) return null;
      return canvases.reduce((best, canvas) =>
        canvas.width * canvas.height > best.width * best.height ? canvas : best,
      );
    });
    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      return null;
    }
    try {
      await page.evaluate(() =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        }),
      );
      const png = await element.screenshot({ type: 'png' });
      return Buffer.from(png);
    } catch {
      return null;
    } finally {
      await element.dispose();
      await handle.dispose();
    }
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
    await this.withTimeout(
      (async () => {
        await page.goto(this.buildBatchExportUrl(templateId, token, studentIds, BATCH_RENDER_PIXEL_RATIO), {
          waitUntil: BATCH_GOTO_WAIT_UNTIL,
          timeout: BATCH_PAGE_PREPARE_TIMEOUT_MS,
        });
        await this.waitForBatchExportHost(page);
      })(),
      BATCH_PAGE_PREPARE_TIMEOUT_MS + 5_000,
      `Batch page (${studentIds.length} students)`,
    );
  }

  /** Render one student on a fresh page (reliable path — no shared multi-student tabs). */
  private async renderSingleStudentCard(
    templateId: string,
    studentId: string,
    token: string,
    orientation: 'HORIZONTAL' | 'VERTICAL',
  ): Promise<BatchCardRenderResult> {
    const page = await this.newPage();
    try {
      await this.prepareRenderPage(page, true);
      await this.prepareBatchExportPage(page, templateId, token, [studentId], orientation);
      const buffer = await this.withTimeout(
        (async () => {
          await this.renderStudentOnBatchPage(page, studentId);
          return this.captureCanvasPng(page, orientation, BATCH_RENDER_PIXEL_RATIO, true);
        })(),
        CARD_RENDER_TIMEOUT_MS,
        `Card ${studentId.slice(0, 8)}`,
      );
      return { studentId, buffer };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { studentId, error: message };
    } finally {
      await this.safeClosePage(page);
    }
  }

  async renderCardsBatch(
    templateId: string,
    studentIds: string[],
    token: string,
    orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
    options?: RenderCardsBatchOptions,
  ): Promise<Array<{ studentId: string; buffer?: Buffer; error?: string }>> {
    if (!studentIds.length) return [];

    const onProgress = options?.onProgress;
    const onCardRendered = options?.onCardRendered;
    const onPreparing = options?.onPreparing;

    const workerCount = Math.min(this.batchWorkerCount(studentIds.length), studentIds.length);
    const pageSize = this.batchPageSizeCap(studentIds.length);
    const chunks: Array<{ ids: string[]; startIndex: number }> = [];
    for (let i = 0; i < studentIds.length; i += pageSize) {
      chunks.push({ ids: studentIds.slice(i, i + pageSize), startIndex: i });
    }

    let completed = 0;
    const reportProgress = () => {
      completed += 1;
      onProgress?.(completed, studentIds.length);
    };

    const release = await this.renderSemaphore.acquire({
      timeoutMs: RENDER_LOCK_TIMEOUT_MS,
      timeoutMessage:
        'Another ID card batch is still rendering (or the renderer is stuck). Wait a minute and try again, or ask your admin to restart vb-api.',
      onWaiting: (seconds) => {
        onPreparing?.(
          seconds <= 0
            ? 'Waiting for the ID card renderer…'
            : `Waiting for the ID card renderer (${seconds}s — another batch may still be running)…`,
        );
      },
    });
    try {
      onPreparing?.('Preparing Chrome renderer…');
      await this.ensureBrowserForBatch();
      onPreparing?.(
        `Rendering ${studentIds.length} ID cards (${chunks.length} page${chunks.length === 1 ? '' : 's'}, ${workerCount} worker${workerCount === 1 ? '' : 's'})…`,
      );

      return await this.withRenderRetries(`PNG batch ${templateId}`, async () => {
        const results: Array<{ studentId: string; buffer?: Buffer; error?: string }> =
          studentIds.map((studentId) => ({ studentId }));

        const emitCard = async (result: BatchCardRenderResult) => {
          if (onCardRendered) await onCardRendered(result);
        };

        let nextChunk = 0;
        let nextWorker = 0;

        const renderChunk = async (ids: string[], startIndex: number, chunkIndex: number) => {
          onPreparing?.(
            `Loading template (${ids.length} cards) — batch ${chunkIndex + 1}/${chunks.length}…`,
          );

          let page: Page | null = await this.newPage();
          try {
            try {
              await this.prepareRenderPage(page, true);
              await this.prepareBatchExportPage(page, templateId, token, ids, orientation);
            } catch (prepareErr: unknown) {
              const message =
                prepareErr instanceof Error ? prepareErr.message : String(prepareErr);
              this.logger.warn(
                `Batch page failed for chunk ${chunkIndex + 1}: ${message}. Using one-by-one.`,
              );
              await this.safeClosePage(page);
              page = null;
              for (let j = 0; j < ids.length; j += 1) {
                const index = startIndex + j;
                onPreparing?.(`Rendering card ${index + 1} of ${studentIds.length}…`);
                const result = await this.renderSingleStudentCard(
                  templateId,
                  ids[j],
                  token,
                  orientation,
                );
                results[index] = result;
                if (result.error) this.logger.warn(`Batch card failed ${ids[j]}: ${result.error}`);
                await emitCard(result);
                reportProgress();
              }
              return;
            }

            for (let j = 0; j < ids.length; j += 1) {
              const index = startIndex + j;
              const studentId = ids[j];
              onPreparing?.(`Rendering card ${index + 1} of ${studentIds.length}…`);
              try {
                const buffer = await this.withTimeout(
                  (async () => {
                    await this.renderStudentOnBatchPage(page!, studentId);
                    return this.captureCanvasPng(
                      page!,
                      orientation,
                      BATCH_RENDER_PIXEL_RATIO,
                      true,
                    );
                  })(),
                  CARD_RENDER_TIMEOUT_MS,
                  `Card ${studentId.slice(0, 8)}`,
                );
                results[index] = { studentId, buffer };
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.warn(`Batch card failed ${studentId}: ${message}`);
                // Prefer a fresh single-card page over recycling a broken multi-card tab.
                const single = await this.renderSingleStudentCard(
                  templateId,
                  studentId,
                  token,
                  orientation,
                );
                results[index] = single;
                if (single.error) {
                  // Rebuild multi-card page for remaining students if shared tab is dead.
                  if (j < ids.length - 1 && /context was destroyed|Target closed|Session closed/i.test(message)) {
                    await this.safeClosePage(page);
                    page = await this.newPage();
                    try {
                      await this.prepareRenderPage(page, true);
                      await this.prepareBatchExportPage(
                        page,
                        templateId,
                        token,
                        ids.slice(j + 1),
                        orientation,
                      );
                    } catch {
                      await this.safeClosePage(page);
                      page = null;
                      for (let k = j + 1; k < ids.length; k += 1) {
                        const idx = startIndex + k;
                        onPreparing?.(`Rendering card ${idx + 1} of ${studentIds.length}…`);
                        const result = await this.renderSingleStudentCard(
                          templateId,
                          ids[k],
                          token,
                          orientation,
                        );
                        results[idx] = result;
                        await emitCard(result);
                        reportProgress();
                      }
                      await emitCard(results[index]);
                      reportProgress();
                      return;
                    }
                  }
                }
              }
              await emitCard(results[index]);
              reportProgress();
            }
          } finally {
            if (page) await this.safeClosePage(page);
          }
        };

        const worker = async () => {
          const workerIndex = nextWorker++;
          if (workerIndex > 0 && BATCH_WORKER_STAGGER_MS > 0) {
            await new Promise((r) => setTimeout(r, workerIndex * BATCH_WORKER_STAGGER_MS));
          }
          while (true) {
            const chunkIndex = nextChunk++;
            if (chunkIndex >= chunks.length) break;
            const { ids, startIndex } = chunks[chunkIndex];
            await renderChunk(ids, startIndex, chunkIndex);
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(workerCount, chunks.length) }, () => worker()),
        );

        const failedIndices = results
          .map((result, index) => (result.error ? index : -1))
          .filter((index) => index >= 0);

        if (failedIndices.length) {
          const needsBrowserRestart = failedIndices.some((index) => {
            const err = results[index].error;
            return err ? this.isTransientBrowserError(new Error(err)) : false;
          });
          if (needsBrowserRestart) {
            await this.restartBrowser('retry failed batch cards');
          }
          let retrySlot = 0;
          onPreparing?.(
            `Retrying ${failedIndices.length} failed card${failedIndices.length === 1 ? '' : 's'}…`,
          );
          const retryWorker = async () => {
            while (true) {
              const slot = retrySlot++;
              if (slot >= failedIndices.length) break;
              const index = failedIndices[slot];
              const studentId = studentIds[index];
              onPreparing?.(
                `Retrying failed cards (${slot + 1} of ${failedIndices.length})…`,
              );
              const result = await this.renderSingleStudentCard(
                templateId,
                studentId,
                token,
                orientation,
              );
              results[index] = result;
              if (result.error) {
                this.logger.warn(`Batch retry failed for ${studentId}: ${result.error}`);
              }
              await emitCard(result);
            }
          };
          const retryWorkers = Math.min(BATCH_RETRY_CONCURRENCY, failedIndices.length);
          await Promise.all(Array.from({ length: retryWorkers }, () => retryWorker()));
        }

        return results;
      });
    } finally {
      release();
    }
  }

  private async captureCanvasPng(
    page: Page,
    _orientation: 'HORIZONTAL' | 'VERTICAL',
    pixelRatio: number = DOWNLOAD_RENDER_PIXEL_RATIO,
    fastBatch = false,
  ): Promise<Buffer> {
    const dataUrl = await page.evaluate(async (targetPixelRatio, skipWarmup) => {
      const ratio = Math.max(4, targetPixelRatio);

      if (!skipWarmup) {
        await document.fonts?.ready;
      }

      const root = document.querySelector('#id-card-canvas');
      const expectedWidth = Number(root?.getAttribute('data-export-width')) || 0;
      const expectedHeight = Number(root?.getAttribute('data-export-height')) || 0;

      const waitForImages = async (container: ParentNode) => {
        const imgs = Array.from(container.querySelectorAll('img'));
        await Promise.race([
          Promise.all(
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
          ),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);
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
        await Promise.race([
          Promise.all(
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
          ),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ]);

        await new Promise<void>((resolve) => {
          if (skipWarmup) {
            requestAnimationFrame(() => resolve());
            return;
          }
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
          if (skipWarmup) {
            requestAnimationFrame(() => resolve());
            return;
          }
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
    }, pixelRatio, fastBatch);

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
