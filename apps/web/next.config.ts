import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const isDevelopment = process.env.NODE_ENV === "development";
const swDisabled = process.env.NEXT_PUBLIC_DISABLE_SW === "true";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  /** Dev uses public/vb-offline-sw.js; do not rebuild or serve Serwist during next dev. */
  disable: isDevelopment || swDisabled,
  /** Stable revision per deploy — avoids invalidating the entire SW cache on every build. */
  additionalPrecacheEntries: isDevelopment
    ? []
    : (() => {
        const revision =
          process.env.RELEASE_REVISION ||
          process.env.GITHUB_SHA ||
          process.env.VERCEL_GIT_COMMIT_SHA ||
          "1";
        return [
          { url: "/~offline", revision },
          { url: "/", revision },
          { url: "/students", revision },
          { url: "/classes", revision },
          { url: "/teachers", revision },
        ];
      })(),
});

const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    /**
     * Reduces bundle size by transforming imports for large libraries.
     * (Safe: does not change runtime behavior.)
     */
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@tanstack/react-query',
      'sonner',
    ],
  },
  async redirects() {
    return [
      /** Login UI is on `/` (app/page.tsx); keep old links working. */
      { source: '/login', destination: '/', permanent: false },
      { source: '/login/:path*', destination: '/', permanent: false },
      /** Nest API is on port 4000; bare `/api` is not a Next page. */
      { source: '/api', destination: '/', permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/media-uploads/:path*',
        destination: `${apiBase}/uploads/:path*`,
      },
      /** Optional same-origin API proxy (avoids mistaken navigation to bare `/api`). */
      {
        source: '/api/v1/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default withSerwist(nextConfig);
