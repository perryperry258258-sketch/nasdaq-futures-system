import { Candle } from "./yahooFutures";
import { detectFromOpen, findTodayOpenIdx, checkDataFreshness, WEEKDAYS } from "./retestCore";
import { getETInfo } from "./etTime";

// 即時訊號狀態機。
//
// 驗收修正：偵測邏輯已改為呼叫 lib/retestCore.ts 的 detectFromOpen()，
// 跟回測（lib/retestStrategyLab.ts）共用同一份程式碼，不再是兩份平行邏輯（驗收第1項）。
//
// 【狀態說明】
// DATA_STALE       - 🔴 資料延遲或異常，暫停訊號判斷（驗收第4項）
// NO_SESSION_TODAY - 今天不是交易日（週末），或資料不足
// BEFORE_WINDOW    - 還沒到今天美股開盤時間
// SETUP            - 開盤區間正在形成中
// WATCHING         - Reference Candle已形成，還沒突破
// WAIT_RETEST      - 已突破，正在等待回踩
// RETEST_CONFIRMED - 🟢 回踩確認，A級進場訊號（尚未觸及SL/TP）
// TP_HIT           - 已觸及停利
// SL_HIT           - 已觸及停損
// EXPIRED          - 追蹤時間(4小時)到了，沒有完成整個流程
//
// 【驗收第3項再次確認】detectFromOpen() 內部：只有窗口收集滿windowBars根才會選出
// Reference Candle，突破偵測的迴圈從windowEnd才開始——這裡不重新判斷，直接繼承
// retestCore.ts 已經內建的防護。
//
// 【驗收第6項】同一個Reference Candle最多一個交易事件：Reference Candle 綁定「今天的
// 09:30那根K棒」，一天只有一根，所以結構上不可能對同一個Reference Candle重複產生訊號。

export type SignalState =
  | "DATA_STALE"
  | "NO_SESSION_TODAY"
  | "BEFORE_WINDOW"
  | "SETUP"
  | "WATCHING"
  | "WAIT_RETEST"
  | "RETEST_CONFIRMED"
  | "TP_HIT"
  | "SL_HIT"
  | "EXPIRED";

export interface LiveSignal {
  symbol: string;
  state: SignalState;
  direction: "LONG" | "SHORT" | null;
  refTime: number | null;
  refHigh: number | null;
  refLow: number | null;
  refVolume: number | null;
  breakoutTime: number | null;
  retestTime: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskDistance: number | null;
  currentPrice: number | null;
  distanceToBreakoutPct: number | null; // 現價距離突破線還差幾%（WATCHING狀態時有意義）
  signalTime: number | null; // 進入RETEST_CONFIRMED狀態的時間
  dataAgeMinutes: number | null;
  updatedAt: number;
}

// 判斷「現在」（不是資料裡最後一根K棒的時間，是真實的當下）是不是CME期貨的
// 每週休市時間——週五17:00 ET收盤，週日18:00 ET才重新開盤，中間這段時間本來就
// 不會有新資料，資料「延遲」是正常現象，不該被當成「資料異常」嚇使用者。
// 這裡沒有處理每日5-6PM ET的例行維護休市（比較短，且發生機率遇到使用者剛好在
// 那個時間點打開App的機率低很多），也沒有處理國定假日休市（CME行事曆每年會變，
// 沒有寫死進來），這兩種情況目前還是會被歸類成資料異常，這是已知、故意先不處理
// 的簡化，不是遺漏。
function isWeeklyMarketClosed(nowSec: number): boolean {
  const info = getETInfo(nowSec);
  const minutesNow = info.hour * 60 + info.minute;
  const fridayCloseMinutes = 17 * 60; // 週五17:00 ET
  const sundayOpenMinutes = 18 * 60; // 週日18:00 ET
  if (info.weekday === "Sat") return true;
  if (info.weekday === "Fri" && minutesNow >= fridayCloseMinutes) return true;
  if (info.weekday === "Sun" && minutesNow < sundayOpenMinutes) return true;
  return false;
}

export function evaluateLiveSignal(
  symbol: string,
  candles5mRaw: Candle[],
  windowMinutes: 30 | 60 | 90 | 120,
  tpMultiple: number,
  retestZonePct: number
): LiveSignal {
  // 驗收修正：Binance /klines 沒指定 endTime 時，回傳的最後一根K棒可能還在成型中
  // （收盤價=即時價格，還沒走完5分鐘），如果拿它當「已收盤」資料判斷，會讓同一段
  // 歷史在不同次輪詢得出不同結論（這次判定可以進場、下次重算又變已過期）。
  // 2年回測完全不會遇到這個問題，因為回測資料本來就都是已經收盤的歷史K棒——
  // 這裡丟掉還沒真正收盤的最後一根，讓即時引擎看到的資料型態跟回測一致，
  // 沒有改變任何策略規則（Reference Candle/突破/回踩/Entry/SL/TP算法完全不動）。
  const nowSec = Date.now() / 1000;
  const candles5m =
    candles5mRaw.length > 0 && candles5mRaw[candles5mRaw.length - 1].time + 300 > nowSec
      ? candles5mRaw.slice(0, -1)
      : candles5mRaw;

  const freshness = checkDataFreshness(candles5m);
  const base: LiveSignal = {
    symbol,
    state: "NO_SESSION_TODAY",
    direction: null,
    refTime: null,
    refHigh: null,
    refLow: null,
    refVolume: null,
    breakoutTime: null,
    retestTime: null,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    riskDistance: null,
    currentPrice: candles5m.length ? candles5m[candles5m.length - 1].close : null,
    distanceToBreakoutPct: null,
    signalTime: null,
    dataAgeMinutes: freshness.ageMinutes,
    updatedAt: Date.now(),
  };

  if (isWeeklyMarketClosed(nowSec)) {
    return { ...base, state: "NO_SESSION_TODAY" };
  }
  if (candles5m.length === 0) return { ...base, state: "DATA_STALE" };
  if (!freshness.fresh) return { ...base, state: "DATA_STALE" };

  const openIdx = findTodayOpenIdx(candles5m);
  if (openIdx === -1) {
    // 用最後一根K棒判斷是不是週末（非交易日）還是單純還沒到開盤時間
    return { ...base, state: "BEFORE_WINDOW" };
  }

  const windowBars = windowMinutes / 5;
  const det = detectFromOpen(candles5m, openIdx, windowBars, retestZonePct);

  if (det.windowIncomplete) return { ...base, state: "SETUP" };

  const currentPrice = candles5m[candles5m.length - 1].close;

  if (det.breakoutIdx === null) {
    const expired = candles5m.length - 1 >= det.windowEnd + 48;
    const distPct = det.refHigh && det.refLow
      ? Math.min(
          Math.abs((det.refHigh - currentPrice) / currentPrice) * 100,
          Math.abs((currentPrice - det.refLow) / currentPrice) * 100
        )
      : null;
    return {
      ...base,
      state: expired ? "EXPIRED" : "WATCHING",
      refTime: det.refCandle?.time ?? null,
      refHigh: det.refHigh,
      refLow: det.refLow,
      refVolume: det.refCandle?.volume ?? null,
      distanceToBreakoutPct: distPct,
      currentPrice,
    };
  }

  const refLevel = det.direction === "LONG" ? det.refHigh! : det.refLow!;

  if (det.retestBarIdx === null) {
    const expired = candles5m.length - 1 >= det.breakoutIdx + 48;
    const state: SignalState = det.closedBackThrough ? "EXPIRED" : expired ? "EXPIRED" : "WAIT_RETEST";
    return {
      ...base,
      state,
      direction: det.direction,
      refTime: det.refCandle?.time ?? null,
      refHigh: det.refHigh,
      refLow: det.refLow,
      refVolume: det.refCandle?.volume ?? null,
      breakoutTime: candles5m[det.breakoutIdx].time,
      currentPrice,
    };
  }

  const entryPrice = refLevel;
  const stopLoss = det.direction === "LONG" ? det.refLow! : det.refHigh!;
  const riskDistance = Math.abs(entryPrice - stopLoss);
  if (riskDistance <= 0) {
    return {
      ...base,
      state: "EXPIRED",
      direction: det.direction,
      refHigh: det.refHigh,
      refLow: det.refLow,
      currentPrice,
    };
  }
  const takeProfit =
    det.direction === "LONG" ? entryPrice + riskDistance * tpMultiple : entryPrice - riskDistance * tpMultiple;

  let state: SignalState = "RETEST_CONFIRMED";
  for (let j = det.retestBarIdx; j < candles5m.length; j++) {
    const bar = candles5m[j];
    if (det.direction === "LONG") {
      if (bar.low <= stopLoss) {
        state = "SL_HIT";
        break;
      }
      if (bar.high >= takeProfit) {
        state = "TP_HIT";
        break;
      }
    } else {
      if (bar.high >= stopLoss) {
        state = "SL_HIT";
        break;
      }
      if (bar.low <= takeProfit) {
        state = "TP_HIT";
        break;
      }
    }
  }
  if (state === "RETEST_CONFIRMED" && candles5m.length - 1 >= det.trackEnd) {
    state = "EXPIRED";
  }

  return {
    symbol,
    state,
    direction: det.direction,
    refTime: det.refCandle?.time ?? null,
    refHigh: det.refHigh,
    refLow: det.refLow,
    refVolume: det.refCandle?.volume ?? null,
    breakoutTime: candles5m[det.breakoutIdx].time,
    retestTime: candles5m[det.retestBarIdx].time,
    entryPrice,
    stopLoss,
    takeProfit,
    riskDistance,
    currentPrice,
    distanceToBreakoutPct: 0,
    signalTime: candles5m[det.retestBarIdx].time,
    dataAgeMinutes: freshness.ageMinutes,
    updatedAt: Date.now(),
  };
}

export const STATE_INFO: Record<SignalState, { emoji: string; label: string }> = {
  DATA_STALE: { emoji: "🔴", label: "資料異常，暫停訊號判斷" },
  NO_SESSION_TODAY: { emoji: "⚪", label: "非交易日" },
  BEFORE_WINDOW: { emoji: "⚪", label: "尚未開盤" },
  SETUP: { emoji: "🟡", label: "開盤區間形成中" },
  WATCHING: { emoji: "🔵", label: "觀察突破中" },
  WAIT_RETEST: { emoji: "🟠", label: "已突破，等待回踩" },
  RETEST_CONFIRMED: { emoji: "🟢", label: "A級進場訊號" },
  TP_HIT: { emoji: "🟢", label: "已觸及停利" },
  SL_HIT: { emoji: "🔴", label: "已觸及停損" },
  EXPIRED: { emoji: "⚪", label: "已過期" },
};
