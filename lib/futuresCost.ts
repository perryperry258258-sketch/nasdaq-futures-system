// NQ期貨的交易成本模型——這裡刻意不沿用crypto版本的「手續費用%表示」（lib/backtest.ts
// 的 FEE_PCT/SLIPPAGE_PCT），因為期貨的成本結構本質上不一樣：
// - 加密貨幣交易所的手續費是「成交金額的百分比」（例如0.1%）
// - 期貨的手續費是「每口合約固定金額」（例如一趟交易來回$4-5美金），跟價格高低無關
// - 期貨的滑價通常用「跳動點數(tick)」描述，不是百分比
// 如果硬套crypto的%模型，算出來的成本會嚴重失真（NQ一口合約市值動輒60萬美金，
// 0.1%就是600美金，遠高於真實的期貨手續費）。
//
// 【誠實揭露：這些數字是估計值，不是你實際券商的真實費率】
// 下面用的是一般散戶期貨帳戶的常見水準，實際費率因券商、帳戶類型而異，正式使用前
// 應該換成你自己帳戶的真實費率。

export const NQ_POINT_VALUE_USD = 20; // 標準NQ合約：1點=20美金（micro的MNQ是1點=2美金）
export const NQ_TICK_SIZE = 0.25; // 最小跳動點數
export const COMMISSION_USD_PER_SIDE = 2.5; // 每口合約單邊手續費估計值（進場+出場各算一次）
export const SLIPPAGE_TICKS_PER_SIDE = 1; // 每邊滑價估計：1個跳動點

// 一趟交易（進場+出場）的總成本，換算成「點數」，可以直接跟riskDistance相除得到R的耗損。
export function roundTripCostPoints(): number {
  const slippagePoints = SLIPPAGE_TICKS_PER_SIDE * NQ_TICK_SIZE * 2; // 進場+出場各一次
  const commissionPoints = (COMMISSION_USD_PER_SIDE * 2) / NQ_POINT_VALUE_USD; // 進場+出場各一次
  return slippagePoints + commissionPoints;
}
