import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NQ Signal（測試版）",
  description: "納斯達克期貨回踩訊號系統 — 資料驗證階段，僅供決策參考，非投資建議，不保證獲利。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0A0E14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-bg text-text antialiased overflow-x-hidden">{children}</body>
    </html>
  );
}
