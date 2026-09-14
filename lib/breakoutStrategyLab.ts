import { Candle } from "./yahooFutures";
import { getETInfo } from "./etTime";
import { roundTripCostPoints } from "./futuresCost";
import { WEEKDAYS, MAX_TRACK_BARS } from "./retestCore";
import { isUsMarketHoliday } from "./usMarketHolidays";
import { RetestStrategyReport } from "./retestStrategyLab";

// 突破直接進場策略——完全獨立於回踩策略(retestStrategyLab.ts)的另一套邏輯。
//
// 【為什麼要另外做這個】測回踩容忍度敏感度時發現：容忍度從3點一路測到87點，
// 勝率/期望值/獲利因子一路上升、完全沒有反轉。這代表容忍度調寬到極端時，
// 實質上已經不是「等回踩」了，變成「突破後價格大致往那個方向走就算數」——
// 這其實是另一種策略（動能突破直接跟上），只是偽裝成回踩容忍度的極端值。
// 這幾年NQ大部分時間處於多頭，「不等拉回、直接跟上突破」這種做法在這種市場
// 環境下容易表現好，但不代表這是「回踩策略調參調出來的」，是完全不同的假說，
// 混在同一個參數裡測試是不誠實的，容易導致過度配適(overfitting)在這5年剛好
// 是多頭市場這個巧合上。這裡獨立出來，乾淨地測試這個假說站不站得住腳。
//
// 【跟回踩策略的唯一差異】：Reference Candle選法、停損(參考區間對側)、停利
// (可指定倍數)、4小時追蹤上限、手續費滑價成本，全部跟回踩策略同一套規則沒有改。
// 唯一的差異是進場時間點——回踩策略等價格拉回到參考水平附近才進場，這裡是
// 突破確認(收盤價站上/跌破參考高低點)的那一刻，用那根K棒的收盤價直接進場，
// 完全不等回踩，這個策略裡根本沒有「回踩容忍度」這個概念。

export interface BreakoutTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  refTime: number;
  refHigh: number;
  refLow: number;
  refVolume: number;
  breakoutTime: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rMultiple: number;
  riskDistance: number;
  pointsGained: number;
  result: "WIN" | "LOSS" | "TIMEEXIT";
}

export function runBreakoutDirectBacktest(
  symbol: string,
  candles5m: Candle[],
  windowMinutes: 30 | 60 | 90 | 120,
  tpMultiple: number
): BreakoutTrade[] {
  const trades: BreakoutTrade[] = [];
  const windowBars = windowMinutes / 5;

  for (let i = 0; i < candles5m.length - windowBars - MAX_TRACK_BARS; i++) {
    const info = getETInfo(candles5m[i].time);
    if (info.hour !== 9 || info.minute !== 30 || !WEEKDAYS.includes(info.weekday) || isUsMarketHoliday(info.year, info.month, info.day)) continue;

    const windowEnd = i + windowBars;
    const windowBarsArr = candles5m.slice(i, windowEnd);
    if (windowBarsArr.length < windowBars) continue;
    let contiguous = true;
    for (let k = 1; k < windowBarsArr.length; k++) {
      if (windowBarsArr[k].time - windowBarsArr[k - 1].time !== 300) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    // Reference Candle：窗口內成交量最大的那根，跟回踩策略同一套規則
    let refIdx = 0;
    for (let k = 1; k < windowBarsArr.length; k++) {
      if (windowBarsArr[k].volume > windowBarsArr[refIdx].volume) refIdx = k;
    }
    const refCandle = windowBarsArr[refIdx];
    const refHigh = refCandle.high;
    const refLow = refCandle.low;

    // 找突破：窗口結束後才開始找，收盤價站上/跌破參考高低點才算數
    let breakoutIdx: number | null = null;
    let direction: "LONG" | "SHORT" | null = null;
    const breakoutScanEnd = Math.min(windowEnd + MAX_TRACK_BARS, candles5m.length);
    for (let j = windowEnd; j < breakoutScanEnd; j++) {
      const bar = candles5m[j];
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
    if (breakoutIdx === null || !direction) continue;

    // 進場：突破確認那根K棒的收盤價，完全不等回踩
    const entryPrice = candles5m[breakoutIdx].close;
    const stopLoss = direction === "LONG" ? refLow : refHigh;
    const riskDistance = Math.abs(entryPrice - stopLoss);
    if (riskDistance <= 0) continue;
    const takeProfit =
      direction === "LONG" ? entryPrice + riskDistance * tpMultiple : entryPrice - riskDistance * tpMultiple;

    const trackEnd = Math.min(breakoutIdx + MAX_TRACK_BARS, candles5m.length);
    let result: BreakoutTrade["result"] = "TIMEEXIT";
    let exitIndex = breakoutIdx;
    let exitPrice = candles5m[breakoutIdx].close;

    for (let j = breakoutIdx + 1; j < trackEnd; j++) {
      const bar = candles5m[j];
      if (direction === "LONG") {
        if (bar.low <= stopLoss) {
          exitIndex = j;
          exitPrice = stopLoss;
          result = "LOSS";
          break;
        }
        if (bar.high >= takeProfit) {
          exitIndex = j;
          exitPrice = takeProfit;
          result = "WIN";
          break;
        }
      } else {
        if (bar.high >= stopLoss) {
          exitIndex = j;
          exitPrice = stopLoss;
          result = "LOSS";
          break;
        }
        if (bar.low <= takeProfit) {
          exitIndex = j;
          exitPrice = takeProfit;
          result = "WIN";
          break;
        }
      }
      exitIndex = j;
      exitPrice = bar.close;
    }

    const grossR =
      direction === "LONG" ? (exitPrice - entryPrice) / riskDistance : (entryPrice - exitPrice) / riskDistance;
    const costR = roundTripCostPoints() / riskDistance;
    const rMultiple = grossR - costR;
    const pointsGained = rMultiple * riskDistance;

    trades.push({
      symbol,
      direction,
      refTime: refCandle.time,
      refHigh,
      refLow,
      refVolume: refCandle.volume,
      breakoutTime: candles5m[breakoutIdx].time,
      entryTime: candles5m[breakoutIdx].time,
      exitTime: candles5m[exitIndex].time,
      entryPrice,
      stopLoss,
      takeProfit,
      rMultiple,
      riskDistance,
      pointsGained,
      result,
    });

    i = exitIndex; // 同一個Reference Candle只產生一次交易事件
  }

  return trades;
}

// 跟 retestStrategyLab.ts 的 auditRetestStrategy 邏輯完全一樣，獨立寫一份是因為
// TypeScript型別不共用（BreakoutTrade跟RetestTrade是不同型別），內容故意保持
// 一模一樣，方便兩邊結果直接互相比較，不會因為算法本身有差異而失真。
export function auditBreakoutStrategy(trades: BreakoutTrade[], label: string): RetestStrategyReport {
  const n = trades.length;
  const wins = trades.filter((t) => t.result === "WIN");
  const losses = trades.filter((t) => t.result === "LOSS");
  const completed = wins.length + losses.length;
  const winRate = completed ? (wins.length / completed) * 100 : 0;
  const expectancy = n ? trades.reduce((a, t) => a + t.rMultiple, 0) / n : 0;
  const grossWin = trades.filter((t) => t.rMultiple > 0).reduce((a, t) => a + t.rMultiple, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.rMultiple <= 0).reduce((a, t) => a + t.rMultiple, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const totalPoints = trades.reduce((a, t) => a + t.pointsGained, 0);
  const winsForPoints = trades.filter((t) => t.pointsGained > 0);
  const lossesForPoints = trades.filter((t) => t.pointsGained <= 0);
  const avgWinPoints = winsForPoints.length ? winsForPoints.reduce((a, t) => a + t.pointsGained, 0) / winsForPoints.length : 0;
  const avgLossPoints = lossesForPoints.length ? lossesForPoints.reduce((a, t) => a + t.pointsGained, 0) / lossesForPoints.length : 0;

  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  let cumPoints = 0;
  let peakPoints = 0;
  let maxDDPoints = 0;
  let consec = 0;
  let maxConsec = 0;
  trades.forEach((t) => {
    cum += t.rMultiple;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;

    cumPoints += t.pointsGained;
    if (cumPoints > peakPoints) peakPoints = cumPoints;
    const ddPoints = peakPoints - cumPoints;
    if (ddPoints > maxDDPoints) maxDDPoints = ddPoints;

    if (t.rMultiple <= 0) {
      consec++;
      if (consec > maxConsec) maxConsec = consec;
    } else {
      consec = 0;
    }
  });

  return {
    label,
    tradeCount: n,
    winRate,
    completedTrades: completed,
    expectancy,
    profitFactor,
    maxDrawdownR: maxDD,
    maxConsecutiveLosses: maxConsec,
    totalPoints,
    avgWinPoints,
    avgLossPoints,
    maxDrawdownPoints: maxDDPoints,
  };
}

export function splitBreakoutTrainValOOS(trades: BreakoutTrade[]): {
  train: BreakoutTrade[];
  validation: BreakoutTrade[];
  oos: BreakoutTrade[];
} {
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const trainEnd = Math.floor(sorted.length * 0.6);
  const valEnd = Math.floor(sorted.length * 0.8);
  return {
    train: sorted.slice(0, trainEnd),
    validation: sorted.slice(trainEnd, valEnd),
    oos: sorted.slice(valEnd),
  };
}
