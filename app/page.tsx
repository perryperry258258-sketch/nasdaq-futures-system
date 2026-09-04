"use client";

import { useState } from "react";
import { fetchYahooKlines, YahooDataError } from "@/lib/yahooFutures";
import { evaluateLiveSignal, STATE_INFO, LiveSignal } from "@/lib/retestEngine";

// 回踩引擎即時狀態驗證頁——這是把crypto-trading-system那套已經驗證過的引擎
// （retestCore.ts / retestEngine.ts，程式碼完全沒改，只換了Candle的資料來源）
// 接上Yahoo資料後的第一次真實測試。
//
// 【誠實揭露】
// - 下面用的 觀察窗口=60分鐘、TP=1R、回踩容忍度=0.3% 是直接沿用crypto版本已經驗證過的
//   參數，還沒有針對「納斯達克期貨本身」做過事件研究/回測驗證，純粹是先確認狀態機
//   在真實NQ資料上能不能正常跑、狀態轉換合不合理，不是說這套參數在NQ上也有效
// - 資料來源限制（Yahoo免費、非官方）：15-20分鐘延遲、只能看最近約60天

const ENGINE_WINDOW = 60;
const ENGINE_TP = 1;
const RETEST_ZONE_PCT = 0.3;

export default function LiveSignalTestPage() {
  const [symbol, setSymbol] = useState("NQ=F");
  const [signal, setSignal] = useState<LiveSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const candles = await fetchYahooKlines(symbol, "5m", "5d");
      const result = evaluateLiveSignal(symbol, candles, ENGINE_WINDOW, ENGINE_TP, RETEST_ZONE_PCT);
      setSignal(result);
    } catch (err) {
      setError(err instanceof YahooDataError ? `${err.message}（來源：${err.source}）` : String(err));
      setSignal(null);
    }
    setLoading(false);
  };

  const info = signal ? STATE_INFO[signal.state] : null;

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">NQ Signal — 引擎驗證頁</h1>
        <div className="text-xs text-warn mt-2 leading-relaxed">
          ⚠️ 觀察窗口/TP/回踩容忍度沿用crypto版本已驗證的參數，還沒針對NQ期貨本身做過事件研究/回測。這頁只驗證狀態機邏輯本身跑不跑得對，不代表這套參數在NQ上已經驗證有效。
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <label className="text-xs text-subtext mb-1 block">代號</label>
        <div className="flex gap-2 mb-3">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="flex-1 min-w-0 bg-panel2 border border-border rounded-xl px-3 text-sm numeric-safe"
            style={{ minHeight: 44 }}
          />
        </div>
        <button onClick={runCheck} disabled={loading} className="btn-primary w-full bg-accent/20 text-accent border border-accent/40 text-sm">
          {loading ? "檢查中…" : "檢查現在的訊號狀態"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 mb-4 text-xs text-bear leading-relaxed">
          ❌ {error}
        </div>
      )}

      {signal && info && (
        <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-display font-bold">{signal.symbol}</span>
            <span className="text-sm font-semibold">
              {info.emoji} {info.label}
            </span>
          </div>

          {signal.direction && (
            <div className="text-xs text-subtext mb-3">方向：{signal.direction === "LONG" ? "做多" : "做空"}</div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div>
              <div className="text-subtext">現價</div>
              <div className="font-semibold numeric-safe">{signal.currentPrice?.toFixed(2) ?? "—"}</div>
            </div>
            <div>
              <div className="text-subtext">資料延遲</div>
              <div className="font-semibold numeric-safe">
                {signal.dataAgeMinutes != null ? `${signal.dataAgeMinutes.toFixed(1)}分` : "—"}
              </div>
            </div>
            <div>
              <div className="text-subtext">Reference High</div>
              <div className="font-semibold numeric-safe">{signal.refHigh?.toFixed(2) ?? "—"}</div>
            </div>
            <div>
              <div className="text-subtext">Reference Low</div>
              <div className="font-semibold numeric-safe">{signal.refLow?.toFixed(2) ?? "—"}</div>
            </div>
            {signal.refTime && (
              <div className="col-span-2">
                <div className="text-subtext">基準K線時間</div>
                <div className="font-semibold numeric-safe">{new Date(signal.refTime * 1000).toLocaleString("zh-TW", { hour12: false })}</div>
              </div>
            )}
            {signal.breakoutTime && (
              <div className="col-span-2">
                <div className="text-subtext">突破時間</div>
                <div className="font-semibold numeric-safe">{new Date(signal.breakoutTime * 1000).toLocaleString("zh-TW", { hour12: false })}</div>
              </div>
            )}
            {signal.distanceToBreakoutPct != null && (
              <div className="col-span-2">
                <div className="text-subtext">距突破</div>
                <div className="font-semibold numeric-safe">{signal.distanceToBreakoutPct.toFixed(2)}%</div>
              </div>
            )}
          </div>

          {signal.state === "RETEST_CONFIRMED" && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs rounded-xl bg-bull/10 border border-bull/30 p-3">
              <div>
                <div className="text-subtext">進場價</div>
                <div className="font-semibold numeric-safe">{signal.entryPrice?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-subtext">止損</div>
                <div className="font-semibold numeric-safe text-bear">{signal.stopLoss?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-subtext">止盈</div>
                <div className="font-semibold numeric-safe text-bull">{signal.takeProfit?.toFixed(2)}</div>
              </div>
            </div>
          )}

          <div className="text-[10px] text-subtext mt-3">更新於 {new Date(signal.updatedAt).toLocaleTimeString("zh-TW")}</div>
        </div>
      )}

      <div className="text-[11px] text-subtext leading-relaxed">
        驗證方式：拿這頁顯示的「基準最高/最低價」「現價」「距突破%」跟你自己另外看的真實NQ盤面比對，看數字合不合理、狀態轉換順不順（例如盤中應該要看到狀態從觀察突破中→已突破等待回踩→這幾個階段跑過，不是卡住不動）。有問題把截圖傳給我。
      </div>
    </main>
  );
}
