"use client";

import { useEffect, useState } from "react";
import { getNotificationPermission, requestNotificationPermission, NotificationPermissionStatus } from "@/lib/notifications";
import { OOS_SEED } from "@/lib/oosSeed";
import { NQ_POINT_VALUE_USD, NQ_TICK_SIZE, COMMISSION_USD_PER_SIDE, SLIPPAGE_TICKS_PER_SIDE } from "@/lib/futuresCost";

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

      {/* 交易設定（唯讀） */}
      <section className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <div className="text-sm font-semibold mb-1">交易設定</div>
        <div className="text-xs text-subtext mb-3 leading-relaxed">
          目前使用中的參數，跟已經完成樣本外驗證的回測綁定，暫不開放調整。
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-subtext">觀察窗口</span>
            <span className="numeric-safe font-medium">60 分鐘</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">回踩容忍度</span>
            <span className="numeric-safe font-medium">±0.3%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">止盈設定</span>
            <span className="numeric-safe font-medium">{OOS_SEED.summary.tpMultiple}R</span>
          </div>
        </div>
      </section>

      {/* 成本模型（唯讀） */}
      <section className="rounded-2xl border border-border bg-panel p-4 mb-3">
        <div className="text-sm font-semibold mb-1">交易成本模型</div>
        <div className="text-xs text-subtext mb-3 leading-relaxed">
          這是估計值，不是你實際券商的真實費率，正式使用前應該換成你自己帳戶的數字。
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-subtext">合約點值</span>
            <span className="numeric-safe font-medium">${NQ_POINT_VALUE_USD}/點</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">最小跳動</span>
            <span className="numeric-safe font-medium">{NQ_TICK_SIZE}點</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">單邊手續費估計</span>
            <span className="numeric-safe font-medium">${COMMISSION_USD_PER_SIDE}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">單邊滑價估計</span>
            <span className="numeric-safe font-medium">{SLIPPAGE_TICKS_PER_SIDE}個跳動</span>
          </div>
        </div>
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
            <span className="numeric-safe">2年（NQ.c.0連續合約）</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-subtext">回測費用</span>
            <span className="numeric-safe">約$3.85美金（已完成，不用重抓）</span>
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
