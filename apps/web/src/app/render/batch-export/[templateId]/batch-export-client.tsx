'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IdCardDesigner } from '@/components/designer/IdCardDesigner';
import api from '@/lib/api';
import { BATCH_DOWNLOAD_PIXEL_RATIO, collectRenderImageUrls } from '@/lib/designer-utils';
import { normalizeFrontConfig } from '@/lib/template-utils';

type RenderTemplate = {
  name: string;
  frontBgUrl?: string | null;
  frontConfig: unknown;
  orientation?: string;
};

declare global {
  interface Window {
    __vbBatchRender?: {
      ready: boolean;
      renderStudent: (studentId: string) => Promise<void>;
    };
  }
}

export function BatchExportClient({ templateId }: { templateId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const exportRatioParam = searchParams.get('exportRatio');
  const studentIdsParam = searchParams.get('studentIds');
  const studentIds = useMemo(
    () => (studentIdsParam ? studentIdsParam.split(',').filter(Boolean) : []),
    [studentIdsParam],
  );
  const renderExportRatio = useMemo(() => {
    const parsed = exportRatioParam ? Number(exportRatioParam) : BATCH_DOWNLOAD_PIXEL_RATIO;
    return Number.isFinite(parsed) && parsed >= 4 ? parsed : BATCH_DOWNLOAD_PIXEL_RATIO;
  }, [exportRatioParam]);

  const [template, setTemplate] = useState<RenderTemplate | null>(null);
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [prefetchDone, setPrefetchDone] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const studentCacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const pendingRef = useRef<{
    resolve: () => void;
    reject: (err: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!token || !templateId) {
      setError('Missing render token');
      setLoadingTemplate(false);
      setPrefetchDone(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const requests: Promise<unknown>[] = [
          api.get<RenderTemplate>(`/templates/${templateId}`, { headers }).then(({ data }) => {
            if (!cancelled) setTemplate(data);
          }),
        ];

        if (studentIds.length) {
          requests.push(
            api
              .post<Record<string, unknown>[]>('/students/by-ids', { ids: studentIds }, { headers })
              .then(({ data }) => {
                const map = new Map<string, Record<string, unknown>>();
                for (const row of data) {
                  const id = typeof row.id === 'string' ? row.id : null;
                  if (id) map.set(id, row);
                }
                studentCacheRef.current = map;
              }),
          );
        }

        await Promise.all(requests);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          setError(message || 'Failed to load batch render data');
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplate(false);
          setPrefetchDone(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, token, studentIds]);

  const loadStudent = useCallback(
    async (studentId: string) => {
      if (!token) throw new Error('Missing render token');
      setError(null);
      setActiveStudentId(studentId);
      setCanvasReady(false);

      const cached = studentCacheRef.current.get(studentId);
      if (cached) {
        setStudent(cached);
        return;
      }

      setLoadingStudent(true);
      setStudent(null);
      try {
        const { data } = await api.get<Record<string, unknown>>(`/students/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        studentCacheRef.current.set(studentId, data);
        setStudent(data);
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        throw new Error(message || `Failed to load student ${studentId}`);
      } finally {
        setLoadingStudent(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!template || !prefetchDone || studentCacheRef.current.size === 0) return;

    const elements = normalizeFrontConfig(template.frontConfig);
    const urls = new Set<string>();
    for (const row of studentCacheRef.current.values()) {
      for (const url of collectRenderImageUrls(template.frontBgUrl || '', elements, row, {
        absolute: true,
      })) {
        urls.add(url);
      }
    }

    void Promise.all(
      [...urls].map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            if (url.startsWith('http')) img.crossOrigin = 'anonymous';
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          }),
      ),
    );
  }, [template, prefetchDone]);

  useEffect(() => {
    if (loadingTemplate || !template || !token || !prefetchDone) return;

    window.__vbBatchRender = {
      ready: true,
      renderStudent: (studentId: string) =>
        new Promise<void>((resolve, reject) => {
          pendingRef.current = { resolve, reject };
          void loadStudent(studentId).catch((err) => {
            pendingRef.current?.reject(err instanceof Error ? err : new Error(String(err)));
            pendingRef.current = null;
          });
        }),
    };

    return () => {
      delete window.__vbBatchRender;
    };
  }, [loadingTemplate, template, token, prefetchDone, loadStudent]);

  useEffect(() => {
    if (!canvasReady || !pendingRef.current) return;
    const pending = pendingRef.current;
    requestAnimationFrame(() => {
      pending.resolve();
      if (pendingRef.current === pending) pendingRef.current = null;
    });
  }, [canvasReady]);

  const renderStatus = error
    ? 'error'
    : loadingTemplate || !prefetchDone || loadingStudent || !canvasReady
      ? 'loading'
      : 'ready';

  if (loadingTemplate || !prefetchDone) {
    return <div className="bg-white" data-render-status="loading" data-batch-export-host="loading" />;
  }

  if (error && !student) {
    return (
      <div
        className="bg-white flex items-center justify-center text-red-600 text-sm p-4"
        data-render-status="error"
        data-batch-export-host="error"
      >
        {error}
      </div>
    );
  }

  if (!template) {
    return (
      <div className="bg-white" data-render-status="error" data-batch-export-host="error">
        Template not found
      </div>
    );
  }

  return (
    <div
      data-render-status={renderStatus}
      data-batch-export-host="ready"
      data-batch-student-id={activeStudentId ?? ''}
    >
      {student ? (
        <IdCardDesigner
          bgUrl={template.frontBgUrl || ''}
          elements={normalizeFrontConfig(template.frontConfig)}
          templateName={template.name}
          orientation={template.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
          student={student}
          onClose={() => {}}
          isRenderMode
          batchExportMode
          renderExportRatio={renderExportRatio}
          onRenderReady={() => setCanvasReady(true)}
        />
      ) : (
        <div className="bg-white" data-render-status="loading" />
      )}
    </div>
  );
}

export function BatchExportClientShell({ templateId }: { templateId: string }) {
  return (
    <Suspense fallback={<div className="bg-white" data-render-status="loading" />}>
      <BatchExportClient templateId={templateId} />
    </Suspense>
  );
}
