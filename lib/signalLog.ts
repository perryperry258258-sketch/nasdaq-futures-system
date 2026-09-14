import { LiveSignal } from "./retestEngine";
import { OOS_SEED } from "./oosSeed";

// Signal Record — 訊號生命週期紀錄 + 模擬交易（Paper Trading）。
// 完全比照crypto版本的設計：每次即時引擎檢查，對每個處在
// RETEST_CONFIRMED/TP_HIT/SL_HIT/EXPIRED 狀態的 LiveSignal，用 symbol+refTime 當id去
// upsert 一筆記錄。因為 evaluateLiveSignal() 每次都是用「目前為止所有可見資料」重新
//完整判斷一次，所以晚一點的檢查如果看到狀態從 RETEST_CONFIRMED 變成 TP_HIT，
// 直接覆寫同一筆記錄就好。
//
// 【誠實揭露，跟crypto版本一樣的限制】
// - EXPIRED時的rMultiple/pointsGained是用「過期當下的現價」概算，不是精確的時間出場
//   價格模擬
// - WIN/LOSS的rMultiple/pointsGained沒有扣手續費/滑價（回測有扣），數字會比回測期望值
//   好看一點點
//
// 【2026-09新增：點數欄位改成主要顯示】使用者實單交易後發現：R值本身對稱，但因為
// 每次訊號的riskDistance（參考K棒高低點範圍，也就是1R代表幾點）差異很大（曾經查過
// 最小16.5點、最大288點，相差17.5倍），期貨整數口數下單沒辦法像加密貨幣那樣用
// 百分比動態調整部位去抵銷這個差異，所以R值對稱不代表實際點數/金額對稱。
// 這裡新增pointsGained欄位，歷史頁改成以點數為主要顯示，rMultiple保留在背後
// （之後如果要跟crypto版本或回測結果對照，還是用得到）。

export interface SignalRecord {
  id: string; // symbol + refTime
  symbol: string;
  direction: "LONG" | "SHORT";
  refTime: number;
  refHigh: number;
  refLow: number;
  refVolume: number;
  breakoutTime: number;
  retestTime: number;
  entryTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: "OPEN" | "WIN" | "LOSS" | "EXPIRED";
  rMultiple: number | null;
  // 【新增】這筆交易實際賺賠幾點——WIN是+riskDistance（entryPrice跟takeProfit的
  // 距離）、LOSS是-riskDistance（entryPrice跟stopLoss的距離）、EXPIRED是用過期當下
  // 現價概算出的實際點數差。這是畫面上主要顯示的數字，不是rMultiple。
  pointsGained: number | null;
  firstLoggedAt: number;
  lastUpdatedAt: number;
}

const RECORD_KEY = "nq_signal_records_v1";
const MAX_RECORDS = 500;

export function loadSignalRecords(): SignalRecord[] {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSignalRecords(records: SignalRecord[]) {
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // 忽略儲存失敗，不影響當前 session
  }
}

export function upsertFromLiveSignal(s: LiveSignal, tpMultiple: number): void {
  if (!s.refTime || !s.entryPrice || !s.stopLoss || !s.takeProfit || !s.riskDistance || !s.direction) return;
  if (!["RETEST_CONFIRMED", "TP_HIT", "SL_HIT", "EXPIRED"].includes(s.state)) return;

  const id = `${s.symbol}_${s.refTime}`;
  const status: SignalRecord["status"] =
    s.state === "RETEST_CONFIRMED" ? "OPEN" : s.state === "TP_HIT" ? "WIN" : s.state === "SL_HIT" ? "LOSS" : "EXPIRED";

  let rMultiple: number | null = null;
  let pointsGained: number | null = null;
  if (status === "WIN") {
    rMultiple = tpMultiple;
    pointsGained = s.riskDistance * tpMultiple;
  } else if (status === "LOSS") {
    rMultiple = -1;
    pointsGained = -s.riskDistance;
  } else if (status === "EXPIRED" && s.currentPrice) {
    rMultiple =
      s.direction === "LONG"
        ? (s.currentPrice - s.entryPrice) / s.riskDistance
        : (s.entryPrice - s.currentPrice) / s.riskDistance;
    pointsGained = s.direction === "LONG" ? s.currentPrice - s.entryPrice : s.entryPrice - s.currentPrice;
  }

  const records = loadSignalRecords();
  const idx = records.findIndex((r) => r.id === id);
  const now = Date.now();

  const record: SignalRecord = {
    id,
    symbol: s.symbol,
    direction: s.direction,
    refTime: s.refTime,
    refHigh: s.refHigh ?? 0,
    refLow: s.refLow ?? 0,
    refVolume: s.refVolume ?? 0,
    breakoutTime: s.breakoutTime ?? 0,
    retestTime: s.retestTime ?? s.signalTime ?? 0,
    entryTime: s.signalTime ?? 0,
    entryPrice: s.entryPrice,
    stopLoss: s.stopLoss,
    takeProfit: s.takeProfit,
    status,
    rMultiple,
    pointsGained,
    firstLoggedAt: idx === -1 ? now : records[idx].firstLoggedAt,
    lastUpdatedAt: now,
  };

  if (idx === -1) {
    saveSignalRecords([...records, record]);
  } else {
    const updated = [...records];
    updated[idx] = record;
    saveSignalRecords(updated);
  }
}

// 手動刪除單筆訊號紀錄——給「歷史」頁用，讓使用者可以自己清掉錯誤或不想要的紀錄。
// 跟crypto專案的做法同步過來。
export function deleteSignalRecord(id: string): void {
  const records = loadSignalRecords();
  saveSignalRecords(records.filter((r) => r.id !== id));
}

export interface PaperReport {
  sampleCount: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  // 【新增】點數版統計，畫面上主要顯示這組，不是上面的R值版本。
  totalPoints: number;
  avgWinPoints: number;
  avgLossPoints: number;
  maxDrawdownPoints: number;
}

export function auditSignalRecords(records: SignalRecord[]): PaperReport {
  const resolved = records.filter((r) => r.status !== "OPEN" && r.rMultiple !== null);
  const n = resolved.length;
  const wins = resolved.filter((r) => r.status === "WIN");
  const losses = resolved.filter((r) => r.status === "LOSS");
  const completed = wins.length + losses.length;
  const winRate = completed ? (wins.length / completed) * 100 : 0;
  const expectancy = n ? resolved.reduce((a, r) => a + (r.rMultiple ?? 0), 0) / n : 0;
  const grossWin = resolved.filter((r) => (r.rMultiple ?? 0) > 0).reduce((a, r) => a + (r.rMultiple ?? 0), 0);
  const grossLoss = Math.abs(resolved.filter((r) => (r.rMultiple ?? 0) <= 0).reduce((a, r) => a + (r.rMultiple ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const resolvedPoints = resolved.filter((r) => r.pointsGained !== null);
  const totalPoints = resolvedPoints.reduce((a, r) => a + (r.pointsGained ?? 0), 0);
  const winsForPoints = resolvedPoints.filter((r) => (r.pointsGained ?? 0) > 0);
  const lossesForPoints = resolvedPoints.filter((r) => (r.pointsGained ?? 0) <= 0);
  const avgWinPoints = winsForPoints.length ? winsForPoints.reduce((a, r) => a + (r.pointsGained ?? 0), 0) / winsForPoints.length : 0;
  const avgLossPoints = lossesForPoints.length ? lossesForPoints.reduce((a, r) => a + (r.pointsGained ?? 0), 0) / lossesForPoints.length : 0;

  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let cumPoints = 0;
  let peakPoints = 0;
  let maxDDPoints = 0;
  resolved
    .sort((a, b) => a.entryTime - b.entryTime)
    .forEach((r) => {
      cum += r.rMultiple ?? 0;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;

      cumPoints += r.pointsGained ?? 0;
      if (cumPoints > peakPoints) peakPoints = cumPoints;
      const ddPoints = peakPoints - cumPoints;
      if (ddPoints > maxDDPoints) maxDDPoints = ddPoints;
    });

  return {
    sampleCount: n,
    winRate,
    expectancy,
    profitFactor,
    maxDrawdownR: maxDD,
    totalPoints,
    avgWinPoints,
    avgLossPoints,
    maxDrawdownPoints: maxDDPoints,
  };
}

// 策略驗證狀態存取——跟crypto版本一樣的fallback設計：localStorage讀不到就用
// lib/oosSeed.ts 裡刻好的內建資料（這次已經花$3.85美金抓過的真實Databento結果）。

export interface OosSummary {
  verdict: "PASSED" | "INSUFFICIENT" | "FAILED";
  sampleCount: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  windowMinutes: number;
  tpMultiple: number;
  computedAt: number;
}

const OOS_SUMMARY_KEY = "nq_oos_summary_v1";

export function saveOosSummary(summary: OosSummary) {
  try {
    localStorage.setItem(OOS_SUMMARY_KEY, JSON.stringify(summary));
  } catch {
    // 忽略儲存失敗
  }
}

export function loadOosSummary(): OosSummary | null {
  try {
    const raw = localStorage.getItem(OOS_SUMMARY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // 讀取失敗，往下 fallback
  }
  return OOS_SEED?.summary ?? null;
}

export interface OosTradeRecord {
  rMultiple: number;
  entryTime: number; // unix秒
  riskDistance?: number;
  pointsGained?: number;
}

const OOS_TRADES_KEY = "nq_oos_trades_v1";
const MAX_OOS_TRADES = 3000;

export function saveOosTrades(trades: OosTradeRecord[]) {
  try {
    localStorage.setItem(OOS_TRADES_KEY, JSON.stringify(trades.slice(-MAX_OOS_TRADES)));
  } catch {
    // 忽略儲存失敗
  }
}

export function loadOosTrades(): OosTradeRecord[] {
  try {
    const raw = localStorage.getItem(OOS_TRADES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // 讀取失敗，往下 fallback
  }
  return OOS_SEED?.trades ?? [];
}
