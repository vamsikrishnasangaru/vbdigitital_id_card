'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IdCardDesigner } from '@/components/designer/IdCardDesigner';
import api from '@/lib/api';
import { normalizeFrontConfig } from '@/lib/template-utils';

export function RenderStudentCard({
  templateId,
  studentId,
}: {
  templateId: string;
  studentId: string;
}) {
  const searchParams = useSearchParams();
  const [template, setTemplate] = useState<any>(null);
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = searchParams.get('token');
        if (!token) {
          setError('Missing render token');
          return;
        }
        const headers = { Authorization: `Bearer ${token}` };

        const [tRes, sRes] = await Promise.all([
          api.get(`/templates/${templateId}`, { headers }),
          api.get(`/students/${studentId}`, { headers }),
        ]);

        setTemplate(tRes.data);
        setStudent(sRes.data);
      } catch (err: any) {
        console.error('Render error:', err);
        setError(err.response?.data?.message || 'Failed to load card data');
      } finally {
        setLoading(false);
      }
    };

    if (templateId && studentId) fetchData();
  }, [templateId, studentId, searchParams]);

  const renderStatus = error ? 'error' : loading || !canvasReady ? 'loading' : 'ready';

  if (loading) {
    return <div className="bg-white" data-render-status="loading" />;
  }

  if (error || !template || !student) {
    return (
      <div
        className="bg-white flex items-center justify-center text-red-600 text-sm p-4"
        data-render-status="error"
      >
        {error || 'Failed to load'}
      </div>
    );
  }

  return (
    <div data-render-status={renderStatus}>
      <IdCardDesigner
        bgUrl={template.frontBgUrl || ''}
        elements={normalizeFrontConfig(template.frontConfig)}
        templateName={template.name}
        orientation={template.orientation === 'VERTICAL' ? 'VERTICAL' : 'HORIZONTAL'}
        student={student}
        onClose={() => {}}
        isRenderMode
        onRenderReady={() => setCanvasReady(true)}
      />
    </div>
  );
}

export function RenderStudentCardShell({
  templateId,
  studentId,
}: {
  templateId: string;
  studentId: string;
}) {
  return (
    <Suspense fallback={<div className="bg-white" data-render-status="loading" />}>
      <RenderStudentCard templateId={templateId} studentId={studentId} />
    </Suspense>
  );
}
