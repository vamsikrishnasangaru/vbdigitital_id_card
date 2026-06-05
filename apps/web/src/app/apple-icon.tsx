import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 98,
            height: 62,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.95)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '8px 10px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              }}
            />
            <div style={{ fontSize: 10, fontWeight: 800, color: '#111827' }}>VB</div>
          </div>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#6b7280', letterSpacing: 1 }}>
            ID
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
