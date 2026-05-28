import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Stale Serwist bundle in public/ must not register while dev uses vb-offline-sw.js */
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'development' && request.nextUrl.pathname === '/sw.js') {
    return new NextResponse('// Serwist is disabled in development. Use /vb-offline-sw.js.', {
      status: 404,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/sw.js',
};
