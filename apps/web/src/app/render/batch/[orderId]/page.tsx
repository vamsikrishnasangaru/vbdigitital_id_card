import { BatchRenderShell } from './batch-render-client';

type PageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function BatchRenderPage({ params }: PageProps) {
  const { orderId } = await params;
  return <BatchRenderShell orderId={orderId} />;
}
