import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SwDevBootstrap } from "@/components/SwDevBootstrap";
import { SyncIndicator } from "@/components/SyncIndicator";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "VB Digital ID Cards — School ID Card Management",
  description: "Enterprise-grade SaaS platform for managing school ID card operations from student onboarding to printing and delivery tracking.",
  keywords: "school ID cards, student management, ID card printing, digital ID, SaaS",
  manifest: "/manifest.json",
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
