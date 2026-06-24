'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IdCardDesigner } from '@/components/designer/IdCardDesigner';

function BatchRenderContent({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setOrder(data);
      } catch (error) {
        console.error('Failed to fetch order:', error);
      } finally {
        setLoading(false);
      }
    }
    if (orderId) fetchOrder();
  }, [orderId, token]);

  if (loading) return <div className="p-10">Loading batch...</div>;
  if (!order || !order.idCards) return <div className="p-10">Order not found or no cards.</div>;

  const pageSize = 8;
  const pages = [];
  for (let i = 0; i < order.idCards.length; i += pageSize) {
    pages.push(order.idCards.slice(i, i + pageSize));
  }

  return (
    <div className="bg-white min-h-screen">
      <style jsx global>{`
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          .page-break {
            page-break-after: always;
          }
        }
      `}</style>

      {pages.map((pageCards, pageIndex) => (
        <div
          key={pageIndex}
          className="page-break p-[10mm] w-[210mm] h-[297mm] mx-auto border-b last:border-0 border-gray-200"
        >
          <div className="grid grid-cols-2 gap-4">
            {pageCards.map((card: any) => (
              <div key={card.id} className="flex justify-center items-center scale-[0.85] transform-gpu">
                <IdCardDesigner
                  bgUrl={card.template?.frontBgUrl || ''}
                  elements={card.template?.frontConfig || []}
                  templateName={card.template?.name || ''}
                  orientation={card.template?.orientation || 'HORIZONTAL'}
                  student={card.student}
                  onClose={() => {}}
                  isRenderMode
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BatchRenderShell({ orderId }: { orderId: string }) {
  return (
    <Suspense fallback={<div className="p-10">Loading batch...</div>}>
      <BatchRenderContent orderId={orderId} />
    </Suspense>
  );
}
