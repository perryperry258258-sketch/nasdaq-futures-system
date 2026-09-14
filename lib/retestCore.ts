import { Candle } from "./yahooFutures";
import { getETInfo } from "./etTime";
import { isUsMarketHoliday } from "./usMarketHolidays";

// 回踩策略核心偵測邏輯 — 唯一的真相來源（Single Source of Truth）。
//
// 這是驗收第1項的修正：回測（retestStrategyLab.ts）跟即時引擎（retestEngine.ts）
// 之前是兩份平行but邏輯相同的程式碼，有日後修改時漂移不同步的風險。
// 現在兩邊都呼叫這裡的 detectFromOpen()，Reference Candle 選法、突破定義、回踩定義
// 完全共用同一份程式碼，不會再有兩邊不一致的可能。
//
// 這個函式本身不知道自己是在跑「回測」還是「即時」——它純粹是：
// 「給定一個09:30那根K棒的位置，跟這根K棒之後所有能看到的K棒，告訴我目前偵測到什麼」。
// 回測呼叫時，candles是完整歷史陣列，所以breakout/retest通常能找到完整結果。
// 即時引擎呼叫時，candles只到「現在」，所以可能還沒掃到breakout或retest，
// 這正是「即時」跟「回測」唯一該有的差異——資料看到多少，不是判斷邏輯不同。
//
// 【2026-09修正：回踩容忍度的bug】使用者實單交易發現：9/14那次訊號，進場價28932，
// 但人工看盤價格根本沒有回踩到28932，系統卻已經判定「回踩確認」，還顯示獲利52點。
// 原因查出來了：retestZonePct原本設計成「百分比」，這個設計是為了crypto（BTC六萬鎂，
// 0.3%只差幾十塊，合理），但直接套用在NQ這種期貨商品上就出問題——28932 × 0.3% =
// 86.8點，遠超過合理的回踩容忍範圍，等於系統在價格離目標還差快87點的時候就已經
// 判定「回踩確認」了。
//
// 修法：新增一個retestZoneMode參數，"percent"（預設，crypto用，行為完全不變）或
// "points"（NQ改用，retestZone這個數字直接當成固定點數，不受價格高低影響）。
// crypto所有呼叫端都沒有改參數，維持原本100%一樣的行為，不會受這次修正影響。

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const MAX_TRACK_BARS = 48; // 追蹤上限4小時（5分鐘K棒數）

export interface RetestDetection {
  windowEnd: number; // Reference Candle觀察窗口結束的index
  refCandle: Candle | null;
  refHigh: number | null;
  refLow: number | null;
  breakoutIdx: number | null;
  direction: "LONG" | "SHORT" | null;
  retestBarIdx: number | null;
  closedBackThrough: boolean; // 突破後是否曾經收盤跌破回Reference內（代表這次突破已經失敗）
  trackEnd: number; // 4小時追蹤窗口的index上限（用來判斷EXPIRED）
  windowIncomplete: boolean; // true代表觀察窗口還沒收集滿（資料不足以形成Reference Candle）
}

// candles: 該從哪一根K棒開始找都可以，只要 candles[openIdx] 是09:30那根。
// 呼叫前必須自己確認 openIdx 對應的是正確的09:30 ET K棒（用 getETInfo 檢查），
// 這裡不重複檢查時間，只負責偵測邏輯本身。
//
// retestZone：容忍範圍的數值。retestZoneMode="percent"時是百分比（例如0.3代表0.3%，
// 跟crypto原本行為完全一樣）；retestZoneMode="points"時是固定點數（例如5代表5點，
// 不管價格是多少都是加減5點，NQ用這個模式）。
export function detectFromOpen(
  candles: Candle[],
  openIdx: number,
  windowBars: number,
  retestZone: number,
  retestZoneMode: "percent" | "points" = "percent"
): RetestDetection {
  const windowEnd = openIdx + windowBars;
  const base: RetestDetection = {
    windowEnd,
    refCandle: null,
    refHigh: null,
    refLow: null,
    breakoutIdx: null,
    direction: null,
    retestBarIdx: null,
    closedBackThrough: false,
    trackEnd: windowEnd + MAX_TRACK_BARS,
    windowIncomplete: false,
  };

  // Look-ahead bias 防護：觀察窗口還沒收集滿 windowBars 根K棒之前，
  // 不能宣稱已經知道哪一根是最大成交量K。
  if (candles.length - 1 < windowEnd) {
    return { ...base, windowIncomplete: true };
  }

  const windowBarsArr = candles.slice(openIdx, windowEnd);
  let refIdx = 0;
  for (let k = 1; k < windowBarsArr.length; k++) {
    if (windowBarsArr[k].volume > windowBarsArr[refIdx].volume) refIdx = k;
  }
  const refCandle = windowBarsArr[refIdx];
  const refHigh = refCandle.high;
  const refLow = refCandle.low;

  // 找突破：只從windowEnd(觀察窗口結束後)開始找，不會提前使用窗口內的資料判斷突破
  let breakoutIdx: number | null = null;
  let direction: "LONG" | "SHORT" | null = null;
  const breakoutScanEnd = Math.min(windowEnd + MAX_TRACK_BARS, candles.length);
  for (let j = windowEnd; j < breakoutScanEnd; j++) {
    const bar = candles[j];
    if (bar.close > refHigh) {
      breakoutIdx = j;
      direction = "LONG";
      break;
    }
    if (bar.close < refLow) {
      breakoutIdx = j;
      direction = "SHORT";
      break;
    }
  }

  if (breakoutIdx === null || !direction) {
    return { ...base, refCandle, refHigh, refLow };
  }

  // 回踩容忍範圍：percent模式算「這個水平的retestZone%」，points模式直接用retestZone
  // 當成固定點數，不受refHigh/refLow數值大小影響。
  const longTolerance = retestZoneMode === "points" ? retestZone : refHigh * (retestZone / 100);
  const shortTolerance = retestZoneMode === "points" ? retestZone : refLow * (retestZone / 100);

  const trackEnd = Math.min(breakoutIdx + MAX_TRACK_BARS, candles.length);
  let closedBackThrough = false;
  let retestBarIdx: number | null = null;

  for (let j = breakoutIdx; j < candles.length && j < breakoutIdx + MAX_TRACK_BARS; j++) {
    const bar = candles[j];
    if (direction === "LONG") {
      if (bar.close < refHigh) closedBackThrough = true;
      if (retestBarIdx === null && j > breakoutIdx && !closedBackThrough && bar.low <= refHigh + longTolerance) {
        retestBarIdx = j;
      }
    } else {
      if (bar.close > refLow) closedBackThrough = true;
      if (retestBarIdx === null && j > breakoutIdx && !closedBackThrough && bar.high >= refLow - shortTolerance) {
        retestBarIdx = j;
      }
    }
  }

  return {
    windowEnd,
    refCandle,
    refHigh,
    refLow,
    breakoutIdx,
    direction,
    retestBarIdx,
    closedBackThrough,
    trackEnd,
    windowIncomplete: false,
  };
}

// 找出 candles 陣列中，跟「最後一根K棒同一天」的09:30 ET K棒的index。
// 用在即時引擎：只關心「今天」的開盤區間。
//
// 【跟crypto版本同步】crypto版本的retestCore.ts之前補過WEEKDAYS檢查（避免週末的
// 09:30K棒被誤判成有效開盤），這裡原本沒有同步到，現在補上，讓兩個專案的判斷邏輯
// 一致。NQ這邊另外還有 retestEngine.ts 的 isWeeklyMarketClosed 做真實時間的週末判斷，
// 這裡是第二層防護，不衝突。
//
// 【國定假日修正】同樣排除 lib/usMarketHolidays.ts 列出的美股全天休市日期——
// 這份清單目前只到2026年底，每年要記得更新。
export function findTodayOpenIdx(candles: Candle[]): number {
  if (candles.length === 0) return -1;
  const lastInfo = getETInfo(candles[candles.length - 1].time);
  for (let i = 0; i < candles.length; i++) {
    const info = getETInfo(candles[i].time);
    if (
      info.hour === 9 &&
      info.minute === 30 &&
      info.year === lastInfo.year &&
      info.month === lastInfo.month &&
      info.day === lastInfo.day &&
      WEEKDAYS.includes(info.weekday) &&
      !isUsMarketHoliday(info.year, info.month, info.day)
    ) {
      return i;
    }
  }
  return -1;
}

// 判斷資料是否新鮮（驗收第4項：資料延遲或異常時禁止產生訊號）。
// 這裡的容忍度比crypto版（15分鐘）寬鬆很多，因為Yahoo這個免費資料源本身正常情況下
// 就有15-20分鐘延遲——如果沿用crypto的15分鐘門檻，會讓系統在完全正常的情況下也一直
// 誤判成「資料異常」。maxAgeMinutes預設35分鐘，抓「正常延遲上限20分鐘 + 緩衝」。
export function checkDataFreshness(candles: Candle[], maxAgeMinutes: number = 35): { fresh: boolean; ageMinutes: number | null } {
  if (candles.length === 0) return { fresh: false, ageMinutes: null };
  const lastBarTime = candles[candles.length - 1].time * 1000;
  const ageMinutes = (Date.now() - lastBarTime) / 60000;
  return { fresh: ageMinutes <= maxAgeMinutes, ageMinutes };
}
