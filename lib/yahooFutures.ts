// Yahoo Finance（非官方端點，透過我們自己的 /api/yahoo 代理）資料客戶端。
//
// Candle 型別跟原本 crypto-trading-system 的 lib/binance.ts 完全同一個形狀
// （time/open/high/low/close/volume），這是刻意設計的——回踩引擎（retestCore.ts /
// retestEngine.ts / retestStrategyLab.ts）只吃 Candle[] 陣列，不管資料哪裡來的，
// 之後把那幾個檔案搬過來這個專案時，可以完全不用改，只要接上這裡的資料就好。
//
// 【誠實揭露，跟前面對話講過的一樣】
// - 免費、不用金鑰，但只能抓最近約60天的5分鐘K線，不是完整2年歷史
// - 資料在美股盤中通常有15-20分鐘延遲
// - 這是非官方端點，沒有穩定性保證，Yahoo隨時可能改格式或擋

export interface Candle {
  time: number; // unix秒
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class YahooDataError extends Error {
  constructor(public source: string, message: string) {
    super(message);
    this.name = "YahooDataError";
  }
}

// symbol 預設 "NQ=F"（納斯達克100期貨連續合約）。interval 支援 "5m" 等 Yahoo 支援的區間。
// range 最大實務上約 "60d"（超過這個Yahoo通常也不會回傳更多5分鐘資料）。
export async function fetchYahooKlines(
  symbol: string = "NQ=F",
  interval: string = "5m",
  range: string = "5d"
): Promise<Candle[]> {
  const url = `/api/yahoo?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data.candles as Candle[];
  } catch (err) {
    throw new YahooDataError(`yahoo:${symbol}`, (err as Error).message);
  }
}
