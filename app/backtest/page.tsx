"use client";

import { useState } from "react";
import { Candle } from "@/lib/yahooFutures";
import { loadNqHistoricalCandles, NQ_HISTORY_INFO } from "@/lib/nqHistoricalData";
import { runRetestStrategyBacktest, auditRetestStrategy, splitTrainValOOS, RetestStrategyReport, RetestTrade } from "@/lib/retestStrategyLab";
import { runMonteCarlo, MonteCarloResult } from "@/lib/monteCarlo";

// 正式回測頁——改版：原本每次都要呼叫Databento付費API（一次約$3.85美金），
// 現在改成讀取內建的歷史快照（lib/nqHistoricalData.ts，2026-09買的那份5年資料），
// 不用再花錢，也不用等好幾分鐘分月抓取，讀取一次之後在瀏覽器裡直接切期間、換窗口
// 重跑，跟crypto版本一樣可以自由調整參數。
//
// 【跟原本付費版本的差異，誠實揭露】
// - 資料是固定快照，不會即時更新，回測結果只反映到 NQ_HISTORY_INFO.endTime 為止
// - 如果之後想要更新的資料，要重新跟Databento買一次、重新產生快照檔案
// - 原本按月呼叫API的 /api/databento-history 路由還留著沒有刪除，需要真正重新抓最新
//   資料時還能用，只是這個頁面預設改用免費的內建快照

const DURATION_OPTIONS = [
  { label: "90天", days: 90 },
  { label: "180天（半年）", days: 180 },
  { label: "365天（1年）", days: 365 },
  { label: "730天（2年）", days: 730 },
  { label: "1825天（5年，全部資料）", days: 1825 },
];
const WINDOW_OPTIONS: { label: string; value: 30 | 60 | 90 | 120 }[] = [
  { label: "30分鐘", value: 30 },
  { label: "60分鐘", value: 60 },
  { label: "90分鐘", value: 90 },
  { label: "120分鐘", value: 120 },
];
const ENGINE_TP = 1;

function RetestStrategyCard({ r }: { r: RetestStrategyReport }) {
  return (
    <div className="rounded-xl bg-panel2 p-3 mb-3">
      <div className="text-xs font-semibold mb-2">{r.label}</div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
        <div>
          <div className="text-subtext">訊號數</div>
          <div className="font-semibold numeric-safe">{r.tradeCount}</div>
        </div>
        <div>
          <div className="text-subtext">勝率</div>
          <div className="font-semibold numeric-safe">{r.winRate.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-subtext">期望值</div>
          <div className={`font-semibold numeric-safe ${r.expectancy >= 0 ? "text-bull" : "text-bear"}`}>
            {r.expectancy >= 0 ? "+" : ""}
            {r.expectancy.toFixed(2)}R
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="text-subtext">獲利因子</div>
          <div className="font-semibold numeric-safe">{r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-subtext">最大回撤</div>
          <div className="font-semibold numeric-safe text-bear">-{r.maxDrawdownR.toFixed(2)}R</div>
        </div>
        <div>
          <div className="text-subtext">最大連續虧損</div>
          <div className="font-semibold numeric-safe text-bear">{r.maxConsecutiveLosses}筆</div>
        </div>
      </div>
    </div>
  );
}

export default function BacktestPage() {
  const [days, setDays] = useState(1825);
  const [window, setWindowMinutes] = useState<30 | 60 | 90 | 120>(60);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<RetestTrade[] | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setTrades(null);
    setExportText(null);
    try {
      setProgress("讀取內建歷史資料中…");
      const all = await loadNqHistoricalCandles();
      const cutoff = NQ_HISTORY_INFO.endTime - days * 86400;
      const sliced: Candle[] = all.filter((c) => c.time >= cutoff);
      if (sliced.length < 500) {
        setError("這個期間內的資料不足以執行回測，請選更長的期間。");
        setLoading(false);
        setProgress("");
        return;
      }
      setProgress("執行回踩策略回測中…");
      const allTrades = runRetestStrategyBacktest("NQ", sliced, window, ENGINE_TP);
      setTrades(allTrades);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
    setProgress("");
  };

  const oosSplit = trades ? splitTrainValOOS(trades) : null;
  const trainReport = oosSplit ? auditRetestStrategy(oosSplit.train, "訓練段（前60%）") : null;
  const valReport = oosSplit ? auditRetestStrategy(oosSplit.validation, "驗證段（中間20%）") : null;
  const oosReport = oosSplit ? auditRetestStrategy(oosSplit.oos, "樣本外段（最後20%，完全沒被看過）") : null;
  const oosMonteCarlo: MonteCarloResult | null =
    oosSplit && oosSplit.oos.length >= 20 ? runMonteCarlo(oosSplit.oos.map((t) => t.rMultiple), 2000) : null;

  const verdict =
    trainReport && valReport && oosReport
      ? oosReport.tradeCount < 30
        ? { label: "樣本不足", color: "text-warn" }
        : trainReport.expectancy > 0 && valReport.expectancy > 0 && oosReport.expectancy > 0
        ? { label: "已通過樣本外驗證", color: "text-bull" }
        : { label: "未通過樣本外驗證", color: "text-bear" }
      : null;

  const buildExport = () => {
    if (!oosSplit || !oosReport) return;
    const summary = {
      verdict: oosReport.tradeCount < 30 ? "INSUFFICIENT" : verdict?.label === "已通過樣本外驗證" ? "PASSED" : "FAILED",
      sampleCount: oosReport.tradeCount,
      winRate: oosReport.winRate,
      expectancy: oosReport.expectancy,
      profitFactor: oosReport.profitFactor,
      maxDrawdownR: oosReport.maxDrawdownR,
      windowMinutes: window,
      tpMultiple: ENGINE_TP,
      computedAt: Date.now(),
    };
    const tradesData = oosSplit.oos.map((t) => ({ rMultiple: t.rMultiple, entryTime: t.entryTime }));
    setExportText(JSON.stringify({ summary, trades: tradesData }));
    setExportCopied(false);
  };

  const copyExport = async () => {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setExportCopied(true);
    } catch {
      // 部分瀏覽器不支援，使用者可以手動點文字框全選複製
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">NQ 正式回測</h1>
        <div className="text-xs text-subtext mt-2 leading-relaxed">
          用內建的歷史快照（{NQ_HISTORY_INFO.boughtAt}向Databento購買，涵蓋5年），不用花錢、不用等分批抓取。快照不會自動更新，之後想涵蓋更新的資料要重新買一次。
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <div className="mb-3">
          <label className="text-xs text-subtext mb-1 block">觀察窗口</label>
          <select
            value={window}
            onChange={(e) => setWindowMinutes(Number(e.target.value) as 30 | 60 | 90 | 120)}
            className="w-full bg-panel2 border border-border rounded-xl px-3 text-sm"
            style={{ minHeight: 44 }}
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label className="text-xs text-subtext mb-1 block">回測期間（從快照最後一天往回算）</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full bg-panel2 border border-border rounded-xl px-3 text-sm"
            style={{ minHeight: 44 }}
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button onClick={runBacktest} disabled={loading} className="btn-primary w-full bg-accent/20 text-accent border border-accent/40 text-sm">
          {loading ? progress || "執行中…" : "開始回測"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 mb-4 text-xs text-bear leading-relaxed break-all">❌ {error}</div>}

      {trainReport && valReport && oosReport && verdict && (
        <div>
          <div className="rounded-xl bg-panel2 p-3 mb-3">
            <div className={`text-sm font-semibold ${verdict.color}`}>{verdict.label}</div>
          </div>
          <RetestStrategyCard r={trainReport} />
          <RetestStrategyCard r={valReport} />
          <RetestStrategyCard r={oosReport} />
          {oosMonteCarlo && (
            <div className="rounded-xl bg-panel2 p-3 mb-4">
              <div className="text-xs font-semibold mb-2">蒙地卡羅重排（{oosMonteCarlo.simulations.toLocaleString()}次）</div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <div className="text-subtext">中位數回撤</div>
                  <div className="font-semibold numeric-safe text-bear">-{oosMonteCarlo.p50DrawdownR.toFixed(2)}R</div>
                </div>
                <div>
                  <div className="text-subtext">最壞情況</div>
                  <div className="font-semibold numeric-safe text-bear">-{oosMonteCarlo.worstDrawdownR.toFixed(2)}R</div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
            <div className="text-sm font-semibold mb-2">💾 匯出樣本外資料</div>
            <div className="text-xs text-subtext mb-3 leading-relaxed">
              產生文字後複製貼給我，我把它寫進程式碼裡當內建預設值（lib/oosSeed.ts）。
            </div>
            <button onClick={buildExport} className="btn-primary w-full border border-border bg-panel2 text-sm mb-3">
              產生匯出文字
            </button>
            {exportText && (
              <div>
                <textarea
                  readOnly
                  value={exportText}
                  className="w-full bg-panel2 border border-border rounded-xl px-3 py-2 text-[10px] numeric-safe"
                  style={{ height: 100 }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button onClick={copyExport} className="btn-primary w-full bg-accent/20 text-accent border border-accent/40 text-sm mt-2">
                  {exportCopied ? "已複製 ✓" : "複製到剪貼簿"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
