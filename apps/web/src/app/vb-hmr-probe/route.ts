export const dynamic = 'force-dynamic';

/** Lightweight reachability probe for DevTools Offline / HMR gating. */
export function GET() {
  return new Response(null, { status: 204 });
}
