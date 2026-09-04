"use client";

import { useState, useEffect } from "react";
import { fetchYahooKlines, YahooDataError } from "@/lib/yahooFutures";
import { evaluateLiveSignal, STATE_INFO, LiveSignal } from "@/lib/retestEngine";
import { OOS_SEED } from "@/lib/oosSeed";

// 首頁：即時訊號 + 策略驗證狀態。
//
// 即時訊號：跟crypto版本完全同一套引擎（retestCore.ts / retestEngine.ts，程式碼沒改，
// 只換了Candle的資料來源），接Yahoo免費資料，開頁自動檢查一次。
//
// 策略驗證狀態：讀 lib/oosSeed.ts 裡刻好的Databento 2年回測結果（訓練/驗證/樣本外
// 三段勝率都落在81.8%~81.9%，一致性很高，已經跟使用者確認過這個結果站得住腳）。
//
// 【誠實揭露仍然保留】
// - 樣本外段只有80筆，加總三段400筆，都來自「同一段2年歷史」，不保證未來市場環境
//   （例如波動度大幅改變）還會維持這個表現
// - 「連續合約展期跳空」是否影響個別訊號，還沒有逐筆排查過，只是統計上三段一致性
//   高到不太像是少數跳空造成的，這是推論，不是100%排除
// - 資料來源限制（Yahoo免費、非官方）：15-20分鐘延遲、只能看最近約60天歷史

const ENGINE_WINDOW = 60;
const ENGINE_TP = 1;
const RETEST_ZONE_PCT = 0.3;

export default function HomePage() {
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

  useEffect(() => {
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const info = signal ? STATE_INFO[signal.state] : null;
  const isActive = signal?.state === "RETEST_CONFIRMED";
  const s = OOS_SEED.summary;

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
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
        <div className={`rounded-2xl border p-4 mb-4 ${isActive ? "bg-bull/10 border-bull/30" : "bg-panel border-border"}`}>
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
          </div>

          {isActive && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs rounded-xl bg-panel2 p-3">
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
        <div className="text-[10px] text-subtext mt-3 leading-relaxed">
          資料來源：Databento GLBX.MDP3（NQ.c.0連續合約）2年份1分鐘K線。訓練/驗證/樣本外三段勝率都落在81.8%~81.9%，一致性高，但樣本仍然有限（400筆），還沒到「可以直接拿真錢下去」的信心水準。
        </div>
      </div>

      <div className="text-[11px] text-subtext leading-relaxed">
        驗證方式：拿上面「Reference High/Low」「現價」跟你自己另外看的真實NQ盤面比對，看數字合不合理、狀態轉換順不順。有問題把截圖傳給我。
      </div>
    </main>
  );
}
