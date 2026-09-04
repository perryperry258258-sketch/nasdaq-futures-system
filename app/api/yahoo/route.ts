import { NextRequest, NextResponse } from "next/server";

// 伺服器端代理（Next.js API Route，跑在 Vercel 的 serverless function 裡）。
//
// 為什麼需要這一層，跟原本crypto-trading-system直接在瀏覽器呼叫Binance不一樣：
// Binance的公開API允許瀏覽器直接跨網域呼叫（CORS開放），Yahoo Finance的非官方端點
// 不是設計給瀏覽器直接呼叫的，從手機瀏覽器直接fetch大機率會被CORS擋掉。
// 這裡讓「伺服器」（Vercel serverless function）去呼叫Yahoo，瀏覽器只呼叫我們自己的
// /api/yahoo，沒有跨網域問題。
//
// 【誠實揭露】
// - Yahoo這個端點是非官方的，沒有文件保證、隨時可能改格式或擋IP，這是免費的代價
// - 5分鐘K線只能抓到最近約60天，不是完整2年歷史
// - 資料在美股盤中通常有15-20分鐘延遲，不是真即時

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "NQ=F";
  const interval = searchParams.get("interval") ?? "5m";
  const range = searchParams.get("range") ?? "5d";

  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo的非官方端點對沒有瀏覽器UA的請求比較容易擋，補一個常見UA字串降低被擋機率
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo回應 HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      const errMsg = data?.chart?.error?.description ?? "Yahoo沒有回傳資料（可能是代號錯誤或該時段沒有交易）";
      return NextResponse.json({ error: errMsg }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: (number | null)[] = quote.open ?? [];
    const highs: (number | null)[] = quote.high ?? [];
    const lows: (number | null)[] = quote.low ?? [];
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];

    // Yahoo在無成交/盤前盤後空檔常會回傳null，這幾根要濾掉，不能當作0處理
    const candles = timestamps
      .map((t, i) => ({
        time: t,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
        volume: volumes[i] ?? 0,
      }))
      .filter((c) => c.open != null && c.high != null && c.low != null && c.close != null) as {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[];

    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
