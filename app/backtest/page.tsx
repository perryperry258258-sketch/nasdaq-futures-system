"use client";

import { useState, Fragment } from "react";
import { Candle } from "@/lib/yahooFutures";
import { loadNqHistoricalCandles, NQ_HISTORY_INFO } from "@/lib/nqHistoricalData";
import { runRetestStrategyBacktest, auditRetestStrategy, splitTrainValOOS, RetestStrategyReport, RetestTrade, ExitMode } from "@/lib/retestStrategyLab";
import { runBreakoutDirectBacktest, auditBreakoutStrategy, splitBreakoutTrainValOOS, BreakoutTrade } from "@/lib/breakoutStrategyLab";
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
//
// 【2026-09新增：真實點數統計】使用者實際下單4天後發現R值對稱但真實點數不對稱
// （原因見 lib/retestStrategyLab.ts 頂部註解）。這裡在每個RetestStrategyCard多加一排
// 點數統計（總點數/平均贏點數/平均輸點數/最大回撤點數），不取代R值統計、是並列顯示，
// 讓使用者可以直接比較兩種角度。
//
// 【2026-09新增：平倉規則比較】回踩策略模式下，一次跑兩個版本：現行「4小時平倉」跟
// 「抱到美股收盤（美東16:00）平倉」，同一批訊號、只換平倉規則，並排比較。
// 樣本外段用「4小時版本」的切點時間套在兩邊，確保比的是同一段時間，不是各切各的。
// 下方原本的三段卡片/蒙地卡羅/匯出，會依照你選的平倉規則顯示。

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
const TOLERANCE_OPTIONS = [3, 5, 8, 10, 15, 20, 30, 40, 60, 87];

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
      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
        <div>
          <div className="text-subtext">獲利因子</div>
          <div className="font-semibold numeric-safe">{r.profitFactor === Infinity ? "∞" : r.profitFactor.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-subtext">最大回撤</div>
          <div className="font-semibold numeric-safe text-bear">-{r.maxDrawdownPoints.toFixed(0)}點</div>
        </div>
        <div>
          <div className="text-subtext">最大連續虧損</div>
          <div className="font-semibold numeric-safe text-bear">{r.maxConsecutiveLosses}筆</div>
        </div>
      </div>
      {/* 真實點數統計——總點數/平均贏輸點數，最大回撤已經改到上面主要統計格顯示 */}
      <div className="border-t border-border/60 pt-2 mt-1">
        <div className="text-[10px] text-subtext mb-1.5">真實點數（已扣手續費+滑價）・ R值僅供參考 {r.expectancy >= 0 ? "+" : ""}{r.expectancy.toFixed(2)}R / 最大回撤{r.maxDrawdownR.toFixed(2)}R</div>
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div>
            <div className="text-subtext">總點數</div>
            <div className={`font-semibold numeric-safe ${r.totalPoints >= 0 ? "text-bull" : "text-bear"}`}>
              {r.totalPoints >= 0 ? "+" : ""}
              {r.totalPoints.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-subtext">平均贏/輸點數</div>
            <div className="font-semibold numeric-safe">
              <span className="text-bull">+{r.avgWinPoints.toFixed(0)}</span>
              {" / "}
              <span className="text-bear">{r.avgLossPoints.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 平倉規則比較用的摘要：在auditRetestStrategy既有統計之外，多算「時間出場」的筆數/
// 平均點數，跟平均持倉分鐘數——這三個是判斷「抱到收盤」有沒有幫助最直接的數字。
interface ExitSummary {
  count: number;
  winRate: number;
  expectancy: number;
  totalPoints: number;
  maxDDPoints: number;
  timeExitCount: number;
  timeExitAvgPoints: number;
  avgHoldMinutes: number;
}

function summarizeExit(trades: RetestTrade[]): ExitSummary {
  const r = auditRetestStrategy(trades, "");
  const te = trades.filter((t) => t.result === "TIMEEXIT");
  const avgHoldMinutes = trades.length ? trades.reduce((a, t) => a + (t.exitTime - t.entryTime) / 60, 0) / trades.length : 0;
  return {
    count: r.tradeCount,
    winRate: r.winRate,
    expectancy: r.expectancy,
    totalPoints: r.totalPoints,
    maxDDPoints: r.maxDrawdownPoints,
    timeExitCount: te.length,
    timeExitAvgPoints: te.length ? te.reduce((a, t) => a + t.pointsGained, 0) / te.length : 0,
    avgHoldMinutes,
  };
}

const signed = (v: number, digits: number) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`;

const EXIT_ROWS: [string, (s: ExitSummary) => string][] = [
  ["筆數", (s) => `${s.count}`],
  ["勝率（不含時間出場）", (s) => `${s.winRate.toFixed(1)}%`],
  ["期望值", (s) => `${signed(s.expectancy, 2)}R`],
  ["總點數", (s) => signed(s.totalPoints, 0)],
  ["最大回撤", (s) => `-${s.maxDDPoints.toFixed(0)}點`],
  ["時間出場筆數", (s) => `${s.timeExitCount}`],
  ["時間出場平均", (s) => `${signed(s.timeExitAvgPoints, 1)}點`],
  ["平均持倉", (s) => `${s.avgHoldMinutes.toFixed(0)}分`],
];

function ExitCompareCard({ title, a, b }: { title: string; a: ExitSummary; b: ExitSummary }) {
  return (
    <div className="rounded-xl bg-panel2 p-3 mb-3">
      <div className="text-xs font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-3 gap-y-1.5 text-xs">
        <div />
        <div className="text-subtext text-right">4小時平倉</div>
        <div className="text-subtext text-right">收盤平倉</div>
        {EXIT_ROWS.map(([label, fn]) => (
          <Fragment key={label}>
            <div className="text-subtext">{label}</div>
            <div className="text-right numeric-safe">{fn(a)}</div>
            <div className="text-right numeric-safe font-semibold">{fn(b)}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function BacktestPage() {
  const [days, setDays] = useState(1825);
  const [window, setWindowMinutes] = useState<30 | 60 | 90 | 120>(60);
  const [tolerance, setTolerance] = useState(5);
  const [mode, setMode] = useState<"retest" | "breakout">("retest");
  const [exitMode, setExitMode] = useState<ExitMode>("4h");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<RetestTrade[] | BreakoutTrade[] | null>(null);
  const [tradesClose, setTradesClose] = useState<RetestTrade[] | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setTrades(null);
    setTradesClose(null);
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
      setProgress(mode === "retest" ? "執行回踩策略回測中（4小時＋收盤兩個版本）…" : "執行突破直接進場回測中…");
      if (mode === "retest") {
        const tradesA = runRetestStrategyBacktest("NQ", sliced, window, ENGINE_TP, 0.3, tolerance, "4h");
        const tradesB = runRetestStrategyBacktest("NQ", sliced, window, ENGINE_TP, 0.3, tolerance, "close");
        setTrades(tradesA);
        setTradesClose(tradesB);
      } else {
        setTrades(runBreakoutDirectBacktest("NQ", sliced, window, ENGINE_TP));
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
    setProgress("");
  };

  // 下方詳細卡片顯示哪一個平倉版本（突破直接進場模式不受影響）
  const displayTrades = mode === "retest" && exitMode === "close" && tradesClose ? tradesClose : trades;

  const oosSplit =
    displayTrades && mode === "retest"
      ? splitTrainValOOS(displayTrades as RetestTrade[])
      : displayTrades && mode === "breakout"
      ? splitBreakoutTrainValOOS(displayTrades as BreakoutTrade[])
      : null;
  const auditFn = mode === "retest" ? auditRetestStrategy : auditBreakoutStrategy;
  const trainReport = oosSplit ? auditFn(oosSplit.train as never, "訓練段（前60%）") : null;
  const valReport = oosSplit ? auditFn(oosSplit.validation as never, "驗證段（中間20%）") : null;
  const oosReport = oosSplit ? auditFn(oosSplit.oos as never, "樣本外段（最後20%，完全沒被看過）") : null;
  // 【改成用真實點數重排，不是用R值】原因見上面「真實點數」註解——R值對稱不代表
  // 點數對稱，蒙地卡羅重排如果拿R值去跑，算出來的回撤範圍會被「R值本身對稱」這個
  // 假象誤導，看不出真實點數的回撤可能有多深。改用pointsGained，結果單位是點數。
  const oosMonteCarlo: MonteCarloResult | null =
    oosSplit && oosSplit.oos.length >= 20 ? runMonteCarlo(oosSplit.oos.map((t) => t.pointsGained), 2000) : null;

  // 平倉規則比較：樣本外切點用4小時版本的切點時間，兩邊套同一段時間
  const exitCompare = (() => {
    if (mode !== "retest" || !trades || !tradesClose) return null;
    const a = trades as RetestTrade[];
    const b = tradesClose;
    const oosStart = splitTrainValOOS(a).oos[0]?.entryTime ?? Infinity;
    return {
      all: { a: summarizeExit(a), b: summarizeExit(b) },
      oos: {
        a: summarizeExit(a.filter((t) => t.entryTime >= oosStart)),
        b: summarizeExit(b.filter((t) => t.entryTime >= oosStart)),
      },
      skipped: a.length - b.length,
    };
  })();

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
      retestTolerancePoints: tolerance,
      exitMode: mode === "retest" ? exitMode : null,
      computedAt: Date.now(),
      // 【新增】點數版摘要一起匯出，方便之後不用重跑就能對照真實點數
      totalPoints: oosReport.totalPoints,
      avgWinPoints: oosReport.avgWinPoints,
      avgLossPoints: oosReport.avgLossPoints,
      maxDrawdownPoints: oosReport.maxDrawdownPoints,
    };
    // 【新增】riskDistance/pointsGained一起匯出，不是只有rMultiple——這樣拿到這份資料
    // 就能直接看每一筆的真實點數，不用回頭重跑回測。
    const tradesData = oosSplit.oos.map((t) => ({
      rMultiple: t.rMultiple,
      entryTime: t.entryTime,
      riskDistance: t.riskDistance,
      pointsGained: t.pointsGained,
    }));
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
          <label className="text-xs text-subtext mb-1 block">策略模式</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMode("retest");
                setTrades(null);
                setTradesClose(null);
                setExportText(null);
              }}
              className={`flex-1 rounded-xl text-sm py-2.5 border transition ${
                mode === "retest" ? "bg-brand/15 text-brand border-brand/40" : "bg-panel2 text-subtext border-border"
              }`}
            >
              回踩策略
            </button>
            <button
              onClick={() => {
                setMode("breakout");
                setTrades(null);
                setTradesClose(null);
                setExportText(null);
              }}
              className={`flex-1 rounded-xl text-sm py-2.5 border transition ${
                mode === "breakout" ? "bg-brand/15 text-brand border-brand/40" : "bg-panel2 text-subtext border-border"
              }`}
            >
              突破直接進場
            </button>
          </div>
          <div className="text-[10px] text-subtext mt-1.5 leading-relaxed">
            {mode === "retest"
              ? "等價格拉回到參考水平附近才進場，需要設定回踩容忍度。"
              : "突破確認的當下直接用收盤價進場，不等拉回，完全獨立的另一套邏輯，用來檢驗「不等回踩、直接跟上突破」這個假說是不是真的有效，不是回踩容忍度調到最寬的結果。"}
          </div>
        </div>
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
        {mode === "retest" && (
          <div className="mb-3">
            <label className="text-xs text-subtext mb-1 block">回踩容忍度（固定點數，不是百分比）</label>
            <select
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="w-full bg-panel2 border border-border rounded-xl px-3 text-sm"
              style={{ minHeight: 44 }}
            >
              {TOLERANCE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}點{t === 5 ? "（目前即時引擎用這個）" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
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

      {exitCompare && (
        <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
          <div className="text-sm font-semibold mb-1">平倉規則比較</div>
          <div className="text-[10px] text-subtext mb-3 leading-relaxed">
            同一批訊號，只換「沒碰到止盈止損時何時平倉」：4小時（從突破起算）vs 抱到美東16:00收盤。勝率不含時間出場的單，所以主要看期望值、總點數跟最大回撤。
            {exitCompare.skipped > 0 && ` 回踩進場時已過美東16:00、收盤版沒有進場的訊號：${exitCompare.skipped}筆。`}
          </div>
          <ExitCompareCard title="全部期間" a={exitCompare.all.a} b={exitCompare.all.b} />
          <ExitCompareCard title="樣本外段（同一段時間）" a={exitCompare.oos.a} b={exitCompare.oos.b} />
          <label className="text-xs text-subtext mb-1 block mt-1">下方詳細數據顯示</label>
          <div className="flex gap-2">
            {(["4h", "close"] as ExitMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setExitMode(m);
                  setExportText(null);
                }}
                className={`flex-1 rounded-xl text-sm py-2.5 border transition ${
                  exitMode === m ? "bg-brand/15 text-brand border-brand/40" : "bg-panel2 text-subtext border-border"
                }`}
              >
                {m === "4h" ? "4小時平倉" : "收盤平倉"}
              </button>
            ))}
          </div>
        </div>
      )}

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
              <div className="text-xs font-semibold mb-2">蒙地卡羅重排（{oosMonteCarlo.simulations.toLocaleString()}次，單位：點數）</div>
              <div className="text-[10px] text-subtext mb-2 leading-relaxed">
                把這批交易的順序重排很多次，看真實點數的回撤範圍——不是重排R值，是直接重排每筆的真實點數，避免R值對稱掩蓋掉點數不對稱的風險。
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <div className="text-subtext">中位數回撤</div>
                  <div className="font-semibold numeric-safe text-bear">-{oosMonteCarlo.p50DrawdownR.toFixed(0)}點</div>
                </div>
                <div>
                  <div className="text-subtext">最壞情況</div>
                  <div className="font-semibold numeric-safe text-bear">-{oosMonteCarlo.worstDrawdownR.toFixed(0)}點</div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
            <div className="text-sm font-semibold mb-2">💾 匯出樣本外資料</div>
            <div className="text-xs text-subtext mb-3 leading-relaxed">
              產生文字後複製貼給我，我把它寫進程式碼裡當內建預設值（lib/oosSeed.ts）。這次也一起匯出每筆的真實點數，不是只有R值。
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
