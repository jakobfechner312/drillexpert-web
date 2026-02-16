import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Drillexpert",
  description: "Digitale Tagesberichte",
  applicationName: "Drillexpert",
  manifest: "/manifest.webmanifest",
  themeColor: "#0f6ca8",
  icons: {
    icon: [
      { url: "/favicon.ico?v=20260216", sizes: "32x32", type: "image/x-icon" },
      { url: "/favicon-16x16.png?v=20260216", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=20260216", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png?v=20260216", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png?v=20260216", sizes: "512x512", type: "image/png" },
      { url: "/android-chrome-192x192.png?v=20260216", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png?v=20260216", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png?v=20260216",
    shortcut: "/favicon.ico?v=20260216",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "application-name": "Drillexpert",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
