export const dynamic = 'force-dynamic';

/** Back-compat probe path used by offline connectivity checks. */
export function GET() {
  return new Response(null, { status: 204 });
}
