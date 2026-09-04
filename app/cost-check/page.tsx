"use client";

import { useState } from "react";

// Databento查價頁——先問「抓2年份NQ期貨5分鐘K線大概要多少錢」，不會真的下載資料。
// 要先在Vercel環境變數設定 DATABENTO_API_KEY 才會動。

export default function CostCheckPage() {
  const [days, setDays] = useState(730);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/databento-cost?days=${days}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">Databento 查價</h1>
        <div className="text-xs text-warn mt-2 leading-relaxed">
          ⚠️ 這只是查詢預估費用，不會真的下載資料、不會產生費用。要先在Vercel環境變數設定好 DATABENTO_API_KEY。
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
        <label className="text-xs text-subtext mb-1 block">查詢天數（預設730天=2年）</label>
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full bg-panel2 border border-border rounded-xl px-3 text-sm numeric-safe mb-3"
          style={{ minHeight: 44 }}
        />
        <button onClick={runCheck} disabled={loading} className="btn-primary w-full bg-accent/20 text-accent border border-accent/40 text-sm">
          {loading ? "查詢中…" : "查詢預估費用"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 mb-4 text-xs text-bear leading-relaxed break-all">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-border bg-panel p-4 mb-4">
          <div className="text-xs text-subtext mb-1">預估費用</div>
          <div className="text-2xl font-display font-bold numeric-safe mb-3">${result.costUsd?.toFixed(2)} USD</div>
          <div className="text-xs text-subtext space-y-1">
            <div>期間：{result.start} ~ {result.end}（{result.days}天）</div>
            <div>資料集：{result.dataset}</div>
            <div>商品：{result.symbols}</div>
            <div>資料型態：{result.schema}</div>
          </div>
          <div className="text-[11px] text-warn mt-3">
            免費額度是 $125，如果這個數字明顯低於 $125，可以放心抓；如果接近或超過，先跟我討論要不要縮短天數或改抓 ohlcv-1h 這種更粗的資料再說。
          </div>
        </div>
      )}
    </main>
  );
}
