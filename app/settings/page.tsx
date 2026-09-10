"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNotificationPermission, requestNotificationPermission, NotificationPermissionStatus } from "@/lib/notifications";

export default function SettingsPage() {
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionStatus>("default");

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
  }, []);

  const requestNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  };

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">設定</h1>
      </header>

      {/* 交易設定與成本模型：完整的回測參數/驗證結果/成本假設在「回測」頁看，
          這裡不重複顯示唯讀數值——跟crypto版本的簡化方式同步。 */}
      <section className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <div className="text-sm font-semibold mb-1">交易設定與成本模型</div>
        <div className="text-xs text-subtext mb-3 leading-relaxed">
          觀察窗口/回踩容忍度/止盈倍數這些參數，跟已經完成樣本外驗證的回測綁定在一起，暫不開放在這裡調整；手續費/滑價成本模型是估計值，正式使用前應該換成你自己帳戶的真實數字。完整的回測工具跟驗證結果在「回測」頁。
        </div>
        <Link href="/backtest" className="text-xs text-bull inline-block">
          查看完整回測與驗證工具 →
        </Link>
      </section>

      {/* 通知設定 */}
      <section className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <div className="text-sm font-semibold mb-2">通知設定</div>
        <div className="text-xs text-subtext mb-3 leading-relaxed">
          A級訊號通知：出現可以進場的訊號時提醒。限制：只有這個網站分頁還開著（可在背景）才會運作，完全關閉分頁不會收到。
        </div>
        {notifPermission === "granted" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-bull" />
            <span className="text-bull">已啟用</span>
          </div>
        )}
        {notifPermission === "denied" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-bear" />
            <span className="text-bear">已被封鎖，請到手機瀏覽器的網站權限設定裡手動開啟</span>
          </div>
        )}
        {notifPermission === "unsupported" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-subtext" />
            <span className="text-subtext">此瀏覽器不支援通知功能</span>
          </div>
        )}
        {notifPermission === "default" && (
          <button onClick={requestNotifications} className="btn-primary w-full bg-brand/15 text-brand border border-brand/40 text-sm">
            啟用A級訊號通知
          </button>
        )}
      </section>

      {/* 資料來源 */}
      <details className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <summary className="text-sm font-semibold cursor-pointer select-none">資料來源 ▾</summary>
        <div className="space-y-2 text-xs mt-3">
          <div className="flex items-center justify-between">
            <span className="text-subtext">即時資料</span>
            <span className="numeric-safe">Yahoo Finance（免費，15-20分鐘延遲）</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">歷史回測資料</span>
            <span className="numeric-safe">Databento GLBX.MDP3</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">回測期間</span>
            <span className="numeric-safe">5年（NQ連續合約，快照，2026-09-10購買）</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">回測費用</span>
            <span className="numeric-safe">約$9.50美金（已完成，不用重抓）</span>
          </div>
        </div>
      </details>

      <section className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <div className="text-sm font-semibold mb-2">關於本系統</div>
        <div className="text-sm text-subtext leading-relaxed break-words">
          本系統僅供交易決策參考，所有訊號與回測結果都可能出錯或失效，不構成投資建議，不保證獲利。請自行承擔交易風險。
        </div>
      </section>
    </main>
  );
}
