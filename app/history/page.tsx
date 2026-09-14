"use client";

import { useEffect, useState } from "react";
import { loadSignalRecords, auditSignalRecords, deleteSignalRecord, SignalRecord } from "@/lib/signalLog";

// 【2026-09更新：改成以點數為主要顯示】原本畫面主要顯示R值，使用者實單交易後
// 發現R值對稱不代表真實點數對稱（原因見 lib/signalLog.ts 頂部註解）。這裡改成
// 每筆紀錄、還有上方摘要，都以真實點數為主要顯示，R值不再顯示在畫面上
// （資料還留在SignalRecord裡，只是不放在UI上）。

type Tab = "ALL" | "WIN" | "LOSS";

function fmtPrice(n: number) {
  return n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(4);
}

function fmtPoints(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<SignalRecord[]>([]);
  const [tab, setTab] = useState<Tab>("ALL");

  useEffect(() => {
    setRecords(loadSignalRecords());
  }, []);

  const handleDelete = (id: string) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    deleteSignalRecord(id);
    setRecords(loadSignalRecords());
  };

  const resolved = records.filter((r) => r.status !== "OPEN");
  const filtered =
    tab === "WIN" ? resolved.filter((r) => r.status === "WIN") : tab === "LOSS" ? resolved.filter((r) => r.status === "LOSS") : resolved;

  const report = resolved.length ? auditSignalRecords(records) : null;

  return (
    <main className="max-w-md mx-auto px-4 pt-8 pb-10">
      <header className="mb-4">
        <h1 className="text-xl font-display font-bold tracking-tight">歷史紀錄</h1>
        <div className="text-xs text-subtext mt-1">本機儲存（清瀏覽器資料會消失，不是雲端同步）</div>
      </header>

      {report && report.sampleCount > 0 && (
        <section className="rounded-2xl border border-border bg-panel p-4 mb-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
            <div>
              <div className="text-subtext">樣本數</div>
              <div className="font-semibold numeric-safe">{report.sampleCount}</div>
            </div>
            <div>
              <div className="text-subtext">勝率</div>
              <div className="font-semibold numeric-safe">{report.winRate.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-subtext">總點數</div>
              <div className={`font-semibold numeric-safe ${report.totalPoints >= 0 ? "text-bull" : "text-bear"}`}>
                {fmtPoints(report.totalPoints)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs border-t border-border/60 pt-2">
            <div>
              <div className="text-subtext">平均贏點數</div>
              <div className="font-semibold numeric-safe text-bull">+{report.avgWinPoints.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-subtext">平均輸點數</div>
              <div className="font-semibold numeric-safe text-bear">{report.avgLossPoints.toFixed(1)}</div>
            </div>
          </div>
        </section>
      )}

      <div className="flex gap-2 mb-4">
        {[
          { key: "ALL" as Tab, label: "全部" },
          { key: "WIN" as Tab, label: "獲利" },
          { key: "LOSS" as Tab, label: "虧損" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-xl text-sm py-2 border transition ${
              tab === t.key ? "bg-brand/15 text-brand border-brand/40" : "bg-panel2 text-subtext border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-sm text-subtext">尚無交易紀錄</div>
          <div className="text-xs text-subtext mt-1 opacity-70">出現A級訊號並走完完整流程後會自動記錄在這裡</div>
        </div>
      ) : (
        <div className="space-y-2">
          {[...filtered]
            .sort((a, b) => b.refTime - a.refTime)
            .map((r) => (
              <div key={r.id} className="rounded-xl bg-panel2 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold">
                    {r.symbol}
                    <span className={`ml-2 text-xs ${r.direction === "LONG" ? "text-bull" : "text-bear"}`}>
                      {r.direction === "LONG" ? "做多" : "做空"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold numeric-safe ${(r.pointsGained ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                      {r.pointsGained != null ? `${fmtPoints(r.pointsGained)}點` : "—"}
                    </span>
                    <button onClick={() => handleDelete(r.id)} aria-label="刪除" className="text-bear text-xs px-1">
                      刪除
                    </button>
                  </div>
                </div>
                <div className="text-xs text-subtext">
                  進場 {fmtPrice(r.entryPrice)} → 止盈 {fmtPrice(r.takeProfit)}
                </div>
                <div className="text-[10px] text-subtext mt-1">
                  {new Date(r.refTime * 1000).toLocaleString("zh-TW", { hour12: false })}
                </div>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
