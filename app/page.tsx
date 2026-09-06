"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchYahooKlines, YahooDataError } from "@/lib/yahooFutures";
import { evaluateLiveSignal, LiveSignal } from "@/lib/retestEngine";
import { getDisplayInfo } from "@/lib/statusDisplay";
import { OOS_SEED } from "@/lib/oosSeed";
import { upsertFromLiveSignal, loadSignalRecords } from "@/lib/signalLog";
import { getNotificationPermission, requestNotificationPermission, showNotification, NotificationPermissionStatus } from "@/lib/notifications";

// 首頁：即時訊號 + 策略驗證狀態。
//
// 即時訊號：跟crypto版本完全同一套引擎（retestCore.ts / retestEngine.ts，程式碼沒改，
// 只換了Candle的資料來源），接Yahoo免費資料。開頁自動檢查一次，之後每5分鐘自動重新
// 檢查一次（背景輪詢，分頁還開著才會運作，跟通知的限制一樣）。
//
// 策略驗證狀態：讀 lib/oosSeed.ts 裡刻好的Databento 2年回測結果。
//
// 【誠實揭露仍然保留】
// - 樣本外段只有80筆，加總三段400筆，都來自「同一段2年歷史」，不保證未來市場環境
//   還會維持這個表現
// - 資料來源限制（Yahoo免費、非官方）：15-20分鐘延遲、只能看最近約60天歷史
// - 背景輪詢只在分頁還開著（可在背景分頁）時才會運作，完全關閉分頁就會停止

const ENGINE_WINDOW = 60;
const ENGINE_TP = 1;
const RETEST_ZONE_PCT = 0.3;
const AUTO_POLL_MS = 5 * 60 * 1000; // 5分鐘

// 進度流程——跟crypto版本 app/signal/[symbol]/page.tsx 的 computeSteps 完全同一套邏輯，
// 純粹把 LiveSignal 已經算出來的欄位拆解成流程步驟顯示，沒有新增任何判斷邏輯。
type StepStatus = "done" | "current" | "pending";

function computeSteps(s: LiveSignal): { label: string; status: StepStatus; time: number | null }[] {
  const windowDone = s.refHigh != null;
  const breakoutDone = s.breakoutTime != null;
  const retestDone = s.retestTime != null;
  const entryReached = ["RETEST_CONFIRMED", "TP_HIT", "SL_HIT"].includes(s.state);

  const step = (done: boolean, isCurrent: boolean, label: string, time: number | null) => ({
    label,
    status: (done ? "done" : isCurrent ? "current" : "pending") as StepStatus,
    time,
  });

  return [
    step(windowDone, s.state === "SETUP", "觀察窗口完成", windowDone ? s.refTime : null),
    step(windowDone, false, "最大成交量K確定", windowDone ? s.refTime : null),
    step(breakoutDone, s.state === "WATCHING", "突破", s.breakoutTime),
    step(breakoutDone, s.state === "WAIT_RETEST", "等待回踩", null),
    step(retestDone, false, "回踩確認", s.retestTime),
    step(entryReached, s.state === "RETEST_CONFIRMED", "可以進場", s.signalTime),
  ];
}

function fmtTime(t: number | null) {
  if (!t) return "—";
  return new Date(t * 1000).toLocaleTimeString("zh-TW", { hour12: false });
}

function Row({ label, value, color, highlight }: { label: string; value: string; color?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-subtext">{label}</span>
      <span className={`numeric-safe font-medium ${color ?? ""} ${highlight ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

export default function HomePage() {
  const [symbol] = useState("NQ=F");
  const [signal, setSignal] = useState<LiveSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionStatus>("default");

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const beforeRecords = loadSignalRecords();
      const beforeOpenIds = new Set(beforeRecords.filter((r) => r.status === "OPEN").map((r) => r.id));

      const candles = await fetchYahooKlines(symbol, "5m", "5d");
      const result = evaluateLiveSignal(symbol, candles, ENGINE_WINDOW, ENGINE_TP, RETEST_ZONE_PCT);
      setSignal(result);
      upsertFromLiveSignal(result, ENGINE_TP);

      const afterRecords = loadSignalRecords();
      const newlyOpen = afterRecords.filter((r) => r.status === "OPEN" && !beforeOpenIds.has(r.id));
      newlyOpen.forEach((r) => {
        showNotification(
          `A級進場訊號：${r.symbol} ${r.direction === "LONG" ? "做多" : "做空"}`,
          `進場價 ${r.entryPrice.toPrecision(6)} ・ 止損 ${r.stopLoss.toPrecision(6)} ・ 止盈 ${r.takeProfit.toPrecision(6)}`,
          r.id
        );
      });
    } catch (err) {
      setError(err instanceof YahooDataError ? `${err.message}（來源：${err.source}）` : String(err));
      setSignal(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
    runCheck();
    const id = setInterval(runCheck, AUTO_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  };

  const info = signal ? getDisplayInfo(signal) : null;
  const isActive = signal?.state === "RETEST_CONFIRMED";
  const s = OOS_SEED.summary;

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold tracking-tight">NQ Signal</h1>
        <button
          onClick={runCheck}
          disabled={loading}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-border active:scale-90 transition text-subtext"
          aria-label="更新"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 mb-4 text-xs text-bear leading-relaxed">
          ❌ {error}
        </div>
      )}

      {/* 目前交易機會 */}
      {signal && info && (
        <div>
          <div className={`rounded-2xl border p-4 mb-3 ${isActive ? "bg-bull/10 border-bull/30" : "bg-panel border-border"}`}>
            <div className="flex items-center justify-between">
              {signal.direction && (
                <span className={`text-sm font-semibold ${signal.direction === "LONG" ? "text-bull" : "text-bear"}`}>
                  {signal.direction === "LONG" ? "做多" : "做空"}
                </span>
              )}
              <span className="text-sm font-semibold">
                {info.emoji} {info.label}
              </span>
            </div>
          </div>

          {/* 進度流程 */}
          <div className="rounded-2xl border border-border bg-panel p-4 mb-3">
            <div className="text-xs text-subtext mb-3">進度流程</div>
            <div className="space-y-3">
              {computeSteps(signal).map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === "done" ? "bg-bull" : step.status === "current" ? "bg-info" : "bg-panel2 border border-border"
                    }`}
                  >
                    {step.status === "done" && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0E14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-sm flex-1 ${step.status === "pending" ? "text-subtext" : ""}`}>{step.label}</span>
                  {step.status === "current" ? (
                    <span className="text-xs text-info">進行中</span>
                  ) : step.time ? (
                    <span className="text-xs text-subtext numeric-safe">{fmtTime(step.time)}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* 數值明細 */}
          <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
            <div className="text-xs text-subtext mb-3">數值明細</div>
            <div className="space-y-2 text-sm">
              <Row label="基準K線時間" value={signal.refTime ? new Date(signal.refTime * 1000).toLocaleString("zh-TW", { hour12: false }) : "—"} />
              <Row label="基準最高價" value={signal.refHigh?.toFixed(2) ?? "—"} />
              <Row label="基準最低價" value={signal.refLow?.toFixed(2) ?? "—"} />
              <Row label="目前價格" value={signal.currentPrice?.toFixed(2) ?? "—"} />
              {signal.distanceToBreakoutPct != null && <Row label="距突破幅度" value={`${signal.distanceToBreakoutPct.toFixed(2)}%`} />}
              {signal.entryPrice != null && <Row label="進場價" value={signal.entryPrice.toFixed(2)} highlight />}
              {signal.stopLoss != null && <Row label="止損價" value={signal.stopLoss.toFixed(2)} color="text-bear" />}
              {signal.takeProfit != null && <Row label="止盈價" value={signal.takeProfit.toFixed(2)} color="text-bull" />}
              <Row label="資料延遲" value={signal.dataAgeMinutes != null ? `${signal.dataAgeMinutes.toFixed(1)} 分鐘` : "—"} />
            </div>
          </div>
        </div>
      )}

      {/* 策略驗證狀態 */}
      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <div className="text-xs text-subtext mb-2">策略驗證狀態</div>
        <div className="text-sm font-semibold text-bull mb-3">
          {s.verdict === "PASSED" ? "已通過樣本外驗證" : s.verdict === "INSUFFICIENT" ? "樣本不足" : "未通過樣本外驗證"}
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div className="text-subtext">樣本</div>
            <div className="font-semibold numeric-safe">{s.sampleCount}</div>
          </div>
          <div>
            <div className="text-subtext">勝率</div>
            <div className="font-semibold numeric-safe">{s.winRate.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-subtext">期望值</div>
            <div className="font-semibold numeric-safe text-bull">+{s.expectancy.toFixed(2)}R</div>
          </div>
          <div>
            <div className="text-subtext">最大回撤</div>
            <div className="font-semibold numeric-safe text-bear">-{s.maxDrawdownR.toFixed(2)}R</div>
          </div>
        </div>
        <Link href="/history" className="text-xs text-bull mt-3 inline-block">
          查看歷史紀錄 →
        </Link>
      </div>

      {notifPermission !== "granted" && notifPermission !== "unsupported" && (
        <button onClick={handleEnableNotifications} className="btn-primary w-full border border-border bg-panel2 text-xs mb-4">
          開啟A級訊號通知
        </button>
      )}

      <div className="text-[11px] text-subtext leading-relaxed">
        驗證方式：拿上面「Reference High/Low」「現價」跟你自己另外看的真實NQ盤面比對，看數字合不合理、狀態轉換順不順。有問題把截圖傳給我。
      </div>
    </main>
  );
}
