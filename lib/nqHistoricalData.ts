import { Candle } from "./yahooFutures";

// 讀取內建的NQ歷史5分鐘K線快照（public/nq-5m-history.json）。
// 這份資料是2026年9月向Databento付費購買的NQ期貨連續合約真實歷史，
// 涵蓋 2021-09-10 ~ 2026-09-09（5年）。連續合約的展期規則：每一天用
// 「當天成交量最大」的那口合約當作主力（業界常見的volume-based roll），
// 不是用固定天數展期。
//
// 【重要限制，誠實揭露】
// - 這是「當時買的那份」的固定快照，不會自動更新，之後新增的交易日不會出現在這裡。
//   回測結果永遠只反映到2026-09-09為止的歷史，想涵蓋更新的資料要重新買一次、
//   重新產生這份檔案。
// - 展期前後幾天，價格可能因為兩口合約的價差(基差)出現不連續的跳動，這是連續合約
//   的正常現象，不是資料錯誤。
// - 原始1分鐘CSV有298MB，處理成5分鐘K棒後仍有17MB多，檔案裡每筆資料用精簡陣列格式
//   [time, open, high, low, close, volume]，不是物件，減少檔案大小、加快讀取。
// - 只排除了週末，沒有排除美股國定假日（跟lib/usMarketHolidays.ts不同步）——
//   假日照樣會有資料進來算，因為NQ期貨假日通常還是有交易（只是量很低），這點跟
//   即時引擎（會排除假日）不完全一致，是這份快照回測的已知簡化。

let cachedCandles: Candle[] | null = null;

export async function loadNqHistoricalCandles(): Promise<Candle[]> {
  if (cachedCandles) return cachedCandles;
  const res = await fetch("/nq-5m-history.json");
  if (!res.ok) throw new Error(`讀取內建歷史資料失敗：HTTP ${res.status}`);
  const raw: [number, number, number, number, number, number][] = await res.json();
  cachedCandles = raw.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
  return cachedCandles;
}

export const NQ_HISTORY_INFO = {
  startTime: 1631232000, // 2021-09-10 00:00 UTC
  endTime: 1788998100, // 2026-09-09 23:55 UTC
  boughtAt: "2026-09-10",
  source: "Databento GLBX.MDP3, NQ連續合約(volume-based roll), ohlcv-1m 合併為5分鐘",
};
