"use client";

import { useState } from "react";
import { Candle } from "@/lib/yahooFutures";
import { resampleCandles } from "@/lib/resample";
import { runRetestStrategyBacktest, auditRetestStrategy, splitTrainValOOS, RetestStrategyReport, RetestTrade } from "@/lib/retestStrategyLab";
import { runMonteCarlo, MonteCarloResult } from "@/lib/monteCarlo";

// 正式回測頁：從Databento抓真正的2年NQ期貨1分鐘資料（會產生費用，抓一次大約$3.85美金，
// 已經事先查過價），合併成5分鐘K線，跑跟crypto版本完全同一套回踩策略引擎（訓練/驗證/
// 樣本外三段切分），最後可以匯出結果讓使用者貼給我刻進程式碼，不用重複花錢再抓一次。
//
// 一次呼叫API不會抓兩年份（Vercel serverless function有執行時間限制），這裡切成
// 一個月一個月抓，抓完在瀏覽器裡合併。

const ENGINE_WINDOW = 60;
const ENGINE_TP = 1;

function monthChunks(totalDays: number): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  const end = new Date();
  let cursor = new Date(end.getTime() - totalDays * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 30);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ start: fmt(cursor), end: fmt(actualEnd) });
    cursor = actualEnd;
  }
  return chunks;
}

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
  const [days, setDays] = useState(730);
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
    const chunks = monthChunks(days);
    let allOneMin: Candle[] = [];
    for (let i = 0; i < chunks.length; i++) {
      setProgress(`抓取 ${chunks[i].start} ~ ${chunks[i].end}（${i + 1}/${chunks.length}）…`);
      try {
        const res = await fetch(`/api/databento-history?start=${chunks[i].start}&end=${chunks[i].end}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(`${chunks[i].start} 這段抓取失敗：${data.error ?? `HTTP ${res.status}`}`);
          setLoading(false);
          return;
        }
        allOneMin = allOneMin.concat(data.candles ?? []);
      } catch (err) {
        setError(`${chunks[i].start} 這段抓取失敗：${(err as Error).message}`);
        setLoading(false);
        return;
      }
    }
    setProgress("合併成5分鐘K線、執行回測…");
    allOneMin.sort((a, b) => a.time - b.time);
    const candles5m = resampleCandles(allOneMin, 5);
    const allTrades = runRetestStrategyBacktest("NQ", candles5m, ENGINE_WINDOW, ENGINE_TP);
    setTrades(allTrades);
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
      windowMinutes: ENGINE_WINDOW,
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
        <div className="text-xs text-warn mt-2 leading-relaxed">
          ⚠️ 這會真的呼叫Databento下載資料，產生費用（2年份大約$3.85美金，已經查過價）。抓取時間可能要幾分鐘，請保持螢幕開啟。
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <label className="text-xs text-subtext mb-1 block">回測天數</label>
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full bg-panel2 border border-border rounded-xl px-3 text-sm numeric-safe mb-3"
          style={{ minHeight: 44 }}
        />
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
              產生文字後複製貼給我，我把它寫進程式碼裡當內建預設值，之後不用再花錢重抓。
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
