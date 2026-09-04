"use client";

import { useState } from "react";
import { fetchYahooKlines, Candle, YahooDataError } from "@/lib/yahooFutures";

// 資料驗證測試頁——這不是正式產品頁面，目的是先確認Yahoo資料真的抓得到、
// 格式對不對，回踩引擎還沒接上來。等這頁證實資料pipeline正常運作，
// 下一步才會把 retestCore.ts / retestEngine.ts 等檔案搬過來接上。

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtTime(t: number) {
  return new Date(t * 1000).toLocaleString("zh-TW", { hour12: false });
}

export default function TestPage() {
  const [symbol, setSymbol] = useState("NQ=F");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setCandles(null);
    try {
      const result = await fetchYahooKlines(symbol, "5m", "5d");
      setCandles(result);
    } catch (err) {
      setError(err instanceof YahooDataError ? `${err.message}（來源：${err.source}）` : String(err));
    }
    setLoading(false);
  };

  const latest = candles && candles.length > 0 ? candles[candles.length - 1] : null;

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">NQ Signal — 資料驗證測試頁</h1>
        <div className="text-xs text-warn mt-2 leading-relaxed">
          ⚠️ 這是資料pipeline測試頁，不是正式功能。目的只是確認Yahoo資料抓得到、格式正確。
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <label className="text-xs text-subtext mb-1 block">代號（預設NQ=F=納斯達克100期貨連續合約）</label>
        <div className="flex gap-2 mb-3">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="flex-1 min-w-0 bg-panel2 border border-border rounded-xl px-3 text-sm numeric-safe"
            style={{ minHeight: 44 }}
          />
        </div>
        <button onClick={runTest} disabled={loading} className="btn-primary w-full bg-accent/20 text-accent border border-accent/40 text-sm">
          {loading ? "抓取中…" : "測試抓取5分鐘K線"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 mb-4 text-xs text-bear leading-relaxed">
          ❌ 抓取失敗：{error}
        </div>
      )}

      {candles && (
        <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
          <div className="text-xs text-subtext mb-2">
            ✅ 成功抓到 {candles.length} 根K棒
          </div>
          {latest && (
            <div className="grid grid-cols-2 gap-2 text-center text-sm mb-3">
              <div className="rounded-xl bg-panel2 p-3">
                <div className="text-xs text-subtext">最新收盤價</div>
                <div className="font-semibold numeric-safe text-lg">{fmt(latest.close)}</div>
              </div>
              <div className="rounded-xl bg-panel2 p-3">
                <div className="text-xs text-subtext">最新K棒時間</div>
                <div className="font-semibold numeric-safe text-[11px]">{fmtTime(latest.time)}</div>
              </div>
            </div>
          )}
          <details>
            <summary className="text-xs text-subtext cursor-pointer select-none mb-2">最近10根K棒明細 ▾</summary>
            <div className="space-y-1">
              {candles.slice(-10).reverse().map((c) => (
                <div key={c.time} className="flex items-center justify-between text-[11px] rounded-lg bg-panel2 px-2 py-1.5">
                  <span className="text-subtext">{fmtTime(c.time)}</span>
                  <span className="numeric-safe">O{fmt(c.open)}</span>
                  <span className="numeric-safe">H{fmt(c.high)}</span>
                  <span className="numeric-safe">L{fmt(c.low)}</span>
                  <span className="numeric-safe">C{fmt(c.close)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      <div className="text-[11px] text-subtext leading-relaxed">
        測試成功的判斷標準：能看到最近的K棒時間跟現在時間差不多（考慮15-20分鐘延遲），
        數字看起來像是真的NQ期貨價位（不是0、不是明顯錯誤的數字）。跑起來沒問題的話，
        把這頁結果告訴我，下一步接上完整的回踩引擎。
      </div>
    </main>
  );
}
