import { BatchExportClientShell } from './batch-export-client';

type PageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function BatchExportPage({ params }: PageProps) {
  const { templateId } = await params;
  return <BatchExportClientShell templateId={templateId} />;
}
