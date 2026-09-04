import { Candle } from "./yahooFutures";

// 把1分鐘K線合併成5分鐘K線（或任意倍數）。純資料處理，不是交易邏輯。
// 對齊規則：用K棒開始時間對5分鐘取整數，同一個5分鐘桶裡的1分鐘K棒合併成一根：
// open=桶內第一根的open，close=桶內最後一根的close，high/low=桶內最高/最低，
// volume=桶內加總。
export function resampleCandles(oneMinCandles: Candle[], targetMinutes: number = 5): Candle[] {
  const bucketSeconds = targetMinutes * 60;
  const buckets = new Map<number, Candle[]>();

  for (const c of oneMinCandles) {
    const bucketStart = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
    buckets.get(bucketStart)!.push(c);
  }

  const result: Candle[] = [];
  const sortedBucketTimes = [...buckets.keys()].sort((a, b) => a - b);
  for (const bucketTime of sortedBucketTimes) {
    const bars = buckets.get(bucketTime)!.sort((a, b) => a.time - b.time);
    result.push({
      time: bucketTime,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, b) => sum + b.volume, 0),
    });
  }
  return result;
}
