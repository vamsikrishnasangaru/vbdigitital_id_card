'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IdCardDesigner } from '@/components/designer/IdCardDesigner';
import api from '@/lib/api';
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
  const [template, setTemplate] = useState<RenderTemplate | null>(null);
  const [student, setStudent] = useState<Record<string, unknown> | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<{
    resolve: () => void;
    reject: (err: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (!token || !templateId) {
      setError('Missing render token');
      setLoadingTemplate(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<RenderTemplate>(`/templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setTemplate(data);
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : undefined;
          setError(message || 'Failed to load template');
        }
      } finally {
        if (!cancelled) setLoadingTemplate(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, token]);

  const loadStudent = useCallback(
    async (studentId: string) => {
      if (!token) throw new Error('Missing render token');
      setLoadingStudent(true);
      setCanvasReady(false);
      setError(null);
      setStudent(null);
      setActiveStudentId(studentId);
      try {
        const { data } = await api.get<Record<string, unknown>>(`/students/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
    if (loadingTemplate || !template || !token) return;

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
  }, [loadingTemplate, template, token, loadStudent]);

  useEffect(() => {
    if (!canvasReady || !pendingRef.current) return;
    pendingRef.current.resolve();
    pendingRef.current = null;
  }, [canvasReady]);

  const renderStatus = error
    ? 'error'
    : loadingTemplate || loadingStudent || !canvasReady
      ? 'loading'
      : 'ready';

  if (loadingTemplate) {
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
          key={activeStudentId ?? 'pending'}
          bgUrl={template.frontBgUrl || ''}
          elements={normalizeFrontConfig(template.frontConfig)}
          templateName={template.name}
          orientation={template.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
          student={student}
          onClose={() => {}}
          isRenderMode
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
