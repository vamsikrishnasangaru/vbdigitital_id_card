import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SwDevBootstrap } from "@/components/SwDevBootstrap";
import { AppVersionBootstrap } from "@/components/AppVersionBootstrap";
import { SchoolColorBootstrap } from "@/components/SchoolColorBootstrap";
import { SyncIndicator } from "@/components/SyncIndicator";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Fresh HTML after each deploy — avoids stale script chunk hashes (s-maxage=31536000 broke post-deploy). */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "VB Digital ID Cards — School ID Card Management",
  description: "Enterprise-grade SaaS platform for managing school ID card operations from student onboarding to printing and delivery tracking.",
  keywords: "school ID cards, student management, ID card printing, digital ID, SaaS",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VB Digital",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <AppVersionBootstrap />
        <SchoolColorBootstrap />
        <SwDevBootstrap />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen antialiased`}>
        <Providers>
          {children}
          <SyncIndicator />
        </Providers>
      </body>
    </html>
  );
}
