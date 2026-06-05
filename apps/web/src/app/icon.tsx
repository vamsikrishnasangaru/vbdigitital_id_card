import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          borderRadius: 112,
        }}
      >
        <div
          style={{
            width: 280,
            height: 180,
            borderRadius: 24,
            background: 'rgba(255,255,255,0.95)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px 28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              }}
            />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: -1 }}>
              VB
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6b7280', letterSpacing: 2 }}>
            ID CARD
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
