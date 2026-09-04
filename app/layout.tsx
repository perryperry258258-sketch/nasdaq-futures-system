import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "NQ Signal",
  description: "納斯達克期貨回踩訊號系統，僅供決策參考，非投資建議，不保證獲利。",
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
      <body className="min-h-screen bg-bg text-text antialiased overflow-x-hidden">
        <div className="pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
