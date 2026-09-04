import { NextRequest, NextResponse } from "next/server";

// 查詢「抓2年份NQ期貨5分鐘K線大概要花多少錢」，不會真的下載資料，純粹先問價。
//
// 這一步是為了避免下面這個風險：Databento有$125免費額度，但OHLCV這種聚合K線的
// 計費費率不低，如果不先查價直接下載2年份資料，有可能一次就超出免費額度、直接扣款。
// 【誠實揭露】我沒辦法在自己的環境裡實際測過這支API能不能打通（沒有網路連線可以測），
// 這是照Databento官方文件寫的，第一次呼叫如果失敗，把錯誤訊息截圖給我，我再調整。
//
// 需要在 Vercel 環境變數設定 DATABENTO_API_KEY（不要寫死在程式碼裡，這是機密資訊）。

export async function GET(req: NextRequest) {
  const apiKey = process.env.DATABENTO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "還沒設定 DATABENTO_API_KEY 這個環境變數，去 Vercel 專案設定裡加上去。" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? "730"); // 預設查2年份
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10); // yyyy-mm-dd

  const params = new URLSearchParams({
    dataset: "GLBX.MDP3",
    symbols: "NQ.FUT",
    stype_in: "parent",
    schema: "ohlcv-5m",
    start: fmt(start),
    end: fmt(end),
  });

  try {
    // Databento的HTTP API用HTTP Basic Auth，帳號=API金鑰，密碼留空
    const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch(`https://hist.databento.com/v0/metadata.get_cost?${params.toString()}`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Databento回應 HTTP ${res.status}：${text}` }, { status: 502 });
    }

    const costUsd = Number(text);
    return NextResponse.json({
      costUsd,
      days,
      dataset: "GLBX.MDP3",
      symbols: "NQ.FUT",
      schema: "ohlcv-5m",
      start: fmt(start),
      end: fmt(end),
      note: "這只是查價，還沒有真的下載資料，不會產生費用。",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
