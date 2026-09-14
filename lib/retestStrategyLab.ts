import { Candle } from "./yahooFutures";
import { getETInfo } from "./etTime";
import { roundTripCostPoints } from "./futuresCost";
import { detectFromOpen, WEEKDAYS, MAX_TRACK_BARS } from "./retestCore";
import { isUsMarketHoliday } from "./usMarketHolidays";

// 回踩策略 Phase 3 — 真正的TP/SL交易模擬。
//
// 驗收修正：偵測邏輯（Reference Candle選法/突破/回踩）已改為呼叫 lib/retestCore.ts 的
// detectFromOpen()，跟即時引擎（lib/retestEngine.ts）共用同一份程式碼，不再是兩份平行邏輯。
// 這裡只負責「掃過歷史找出每一次09:30開盤」+「把偵測結果轉換成完整交易(含SL/TP模擬)」，
// 偵測本身完全交給共用核心。
//
// 【設計】
// - 進場價：Reference水平本身。
// - 停損：Reference Candle區間對側。
// - TP：可指定倍數。
// - 出場時間上限：4小時。
// - 手續費+滑價已扣除。
//
// 【驗收修正：期貨成本模型】手續費+滑價的計算方式跟crypto版本不一樣，這裡改用
// lib/futuresCost.ts 的「固定跳動點數+每口固定手續費」模型，不是crypto的百分比模型
// （NQ一口合約市值動輒60萬美金，套用百分比模型會嚴重高估成本）。
//
// 【2026-09新增：真實點數欄位】使用者實際下單4天後發現：R值本身雖然對稱（贏輸都接近
// 1R），但換算成真實點數/金額卻不對稱——原因是「1R代表多少點」取決於當天參考K棒的
// 高低點範圍(riskDistance)，範圍寬的那天輸了就是輸很多點，範圍窄的那天贏了就只贏
// 一點點。期貨是整數口數下單，沒辦法像加密貨幣那樣用百分比動態調整部位大小去抵銷
// 這個差異，所以「R值對稱」不代表「實際點數/金額對稱」。這裡把每筆交易的riskDistance
// （這筆交易1R代表幾點）跟pointsGained（這筆交易實際賺賠幾點，已扣成本）都存下來，
// 讓使用者可以直接看真實點數分布，不是只看R值。
//
// 【誠實揭露：這次沒做的】
// - 只測「等回踩」這個進場方式，不重複測直接進場（已證實較差）
// - 停損只測Reference區間對側，沒有測ATR停損或其他停損倍數
// - 沒有分年份、沒有BTC市場環境交叉分析
// - 最長開放到730天（2年）；730天在5分鐘K線下資料量非常大，手機瀏覽器執行時間可能長達10幾分鐘，
//   務必保持螢幕開啟、不要切換到其他App，否則可能被系統中斷

const DEFAULT_RETEST_ZONE_PCT = 0.3;

// 【2026-09修正：回踩容忍度改成固定點數】原本retestZonePct被當成百分比計算，
// 在NQ現在28000+的價位下，0.3%換算出來高達87點，遠超過合理的回踩容忍範圍，
// 導致回測把「價格根本沒有真正靠近進場水平」的情況也誤判成「回踩確認」，
// 高估了訊號數量跟勝率。詳細原因見 lib/retestCore.ts 頂部註解，這裡改成呼叫
// detectFromOpen時帶上"points"模式，跟即時引擎（retestEngine.ts）同步。
//
// 【2026-09再更新：容忍度改成可調參數】5點只是估計值，不是精算出來的最佳值。
// 修正後跑出來獲利因子只剩1.46（比修正前的3.98薄弱很多），使用者想測試不同
// 容忍度數值的敏感度，看5點是不是太嚴（把真正有效的回踩也排除掉）或太鬆
// （還是漏掉一些假回踩），所以拔掉寫死的常數，改成呼叫端可以自己指定，
// 預設值還是5，沒有傳參數的舊呼叫方式行為不變。
const DEFAULT_NQ_RETEST_TOLERANCE_POINTS = 5;

export interface RetestTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  refTime: number;
  refHigh: number;
  refLow: number;
  refVolume: number;
  breakoutTime: number;
  retestTime: number;
  retestPrice: number; // 回踩那根K棒觸及到的價格（低點/高點），跟entryPrice(乾淨水平)分開記錄
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rMultiple: number;
  // 【新增】這筆交易「1R」實際代表幾點——就是參考K棒的高低點範圍(也是停損距離)。
  // 不同天的參考K棒範圍不一樣，所以不同交易的riskDistance不會一樣，這正是R值對稱、
  // 但真實點數不對稱的根本原因。
  riskDistance: number;
  // 【新增】這筆交易實際賺賠幾點（已扣手續費+滑價成本），= rMultiple * riskDistance。
  // 這才是整數口數下單時，你帳戶實際會變動的點數（乘上NQ每點金額才是美金損益）。
  pointsGained: number;
  result: "WIN" | "LOSS" | "TIMEEXIT";
}

export function runRetestStrategyBacktest(
  symbol: string,
  candles5m: Candle[],
  windowMinutes: 30 | 60 | 90 | 120,
  tpMultiple: number,
  retestZonePct: number = DEFAULT_RETEST_ZONE_PCT,
  retestTolerancePoints: number = DEFAULT_NQ_RETEST_TOLERANCE_POINTS
): RetestTrade[] {
  const trades: RetestTrade[] = [];
  const windowBars = windowMinutes / 5;

  for (let i = 0; i < candles5m.length - windowBars - MAX_TRACK_BARS; i++) {
    const info = getETInfo(candles5m[i].time);
    // 【國定假日修正】跟即時引擎（retestCore.ts的findTodayOpenIdx）同步，排除美股全天
    // 休市的國定假日（lib/usMarketHolidays.ts，目前只列到2026年底）。這份80筆樣本外
    // 資料是在這次修正之前跑出來、已經存進oosSeed.ts的，不會回頭改變；這裡只影響
    // 「以後如果重新跑一次回測」的結果會不會排除掉假日。
    if (info.hour !== 9 || info.minute !== 30 || !WEEKDAYS.includes(info.weekday) || isUsMarketHoliday(info.year, info.month, info.day)) continue;

    // 確認這windowBars根K棒本身連續(沒有資料缺口)，這是回測特有的資料品質檢查，
    // 即時引擎不需要這個檢查(即時資料源假設本身連續)。
    const windowBarsArr = candles5m.slice(i, i + windowBars);
    if (windowBarsArr.length < windowBars) continue;
    let contiguous = true;
    for (let k = 1; k < windowBarsArr.length; k++) {
      if (windowBarsArr[k].time - windowBarsArr[k - 1].time !== 300) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;

    const det = detectFromOpen(candles5m, i, windowBars, retestTolerancePoints, "points");
    if (det.windowIncomplete || !det.refCandle || det.retestBarIdx === null || !det.direction || det.breakoutIdx === null) {
      continue; // 沒有出現回踩，或還沒收集滿觀察窗口，這次不進場
    }

    const { refCandle, refHigh, refLow, direction, breakoutIdx, retestBarIdx, trackEnd } = det;
    const refLevel = direction === "LONG" ? refHigh! : refLow!;
    const entryPrice = refLevel;
    const stopLoss = direction === "LONG" ? refLow! : refHigh!;
    const riskDistance = Math.abs(entryPrice - stopLoss);
    if (riskDistance <= 0) continue;
    const takeProfit =
      direction === "LONG" ? entryPrice + riskDistance * tpMultiple : entryPrice - riskDistance * tpMultiple;

    let result: RetestTrade["result"] = "TIMEEXIT";
    let exitIndex = retestBarIdx;
    let exitPrice = candles5m[retestBarIdx].close;

    for (let j = retestBarIdx; j < trackEnd; j++) {
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
    const retestBar = candles5m[retestBarIdx];
    const retestPrice = direction === "LONG" ? retestBar.low : retestBar.high;

    trades.push({
      symbol,
      direction,
      refTime: refCandle.time,
      refHigh: refHigh!,
      refLow: refLow!,
      refVolume: refCandle.volume,
      breakoutTime: candles5m[breakoutIdx].time,
      retestTime: candles5m[retestBarIdx].time,
      retestPrice,
      entryTime: candles5m[retestBarIdx].time,
      exitTime: candles5m[exitIndex].time,
      entryPrice,
      stopLoss,
      takeProfit,
      rMultiple,
      riskDistance,
      pointsGained,
      result,
    });

    i = exitIndex; // 同一個Reference Candle只產生一次交易事件，跳到這筆交易結束後繼續掃
  }

  return trades;
}

export interface RetestStrategyReport {
  label: string;
  tradeCount: number;
  winRate: number;
  completedTrades: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  maxConsecutiveLosses: number;
  // 【新增】點數版統計——跟上面R值版本並列，讓使用者直接看真實點數，
  // 不用自己拿rMultiple乘riskDistance換算。
  totalPoints: number;
  avgWinPoints: number; // 正數
  avgLossPoints: number; // 負數
  maxDrawdownPoints: number;
}

export function auditRetestStrategy(trades: RetestTrade[], label: string): RetestStrategyReport {
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

export const RETEST_STRATEGY_TP_OPTIONS = [1, 1.5, 2, 3];
export const RETEST_STRATEGY_DURATION_OPTIONS = [
  { label: "90天", days: 90 },
  { label: "180天（約半年）", days: 180 },
  { label: "365天（約1年）", days: 365 },
  { label: "730天（約2年，非常久，務必保持螢幕開啟）", days: 730 },
];

// 訓練/驗證/樣本外三段切分：前60%當訓練段、中間20%當驗證段、最後20%完全不能拿來調參，
// 只能用來最後檢驗一次。依進場時間排序後照比例切，不是隨機打散（保留時間先後順序）。
export function splitTrainValOOS(trades: RetestTrade[]): {
  train: RetestTrade[];
  validation: RetestTrade[];
  oos: RetestTrade[];
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
