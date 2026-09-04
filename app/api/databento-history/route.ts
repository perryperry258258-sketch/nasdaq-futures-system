import { NextRequest, NextResponse } from "next/server";

// 真的下載NQ期貨1分鐘K線（會產生費用，用量計費，之前查過2年份大約$3.85美金）。
//
// 用 symbols=NQ.c.0 + stype_in=continuous（近月連續合約，自動展期），不是parent
// （parent會把所有同時掛牌的合約疊在一起，同一個時間點會有好幾筆重複資料）。
//
// 用 encoding=csv 讓Databento直接回傳CSV文字，不用自己寫DBN二進位格式的解析器
// （那個複雜很多）。pretty_px=true 讓價格直接是正常小數，不用自己除以1e9換算。
//
// 呼叫這支API一次不要抓太長的區間（Vercel serverless function有執行時間限制），
// 前端會自動切成一個月一個月抓，不是一次抓兩年份。

const DATASET = "GLBX.MDP3";
const SYMBOL = "NQ.c.0";

export async function GET(req: NextRequest) {
  const apiKey = process.env.DATABENTO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "還沒設定 DATABENTO_API_KEY 環境變數。" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start"); // yyyy-mm-dd
  const end = searchParams.get("end"); // yyyy-mm-dd
  if (!start || !end) {
    return NextResponse.json({ error: "缺少 start 或 end 參數（yyyy-mm-dd 格式）" }, { status: 400 });
  }

  const params = new URLSearchParams({
    dataset: DATASET,
    symbols: SYMBOL,
    stype_in: "continuous",
    schema: "ohlcv-1m",
    start,
    end,
    encoding: "csv",
    pretty_px: "true",
  });

  try {
    const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
    const res = await fetch(`https://hist.databento.com/v0/timeseries.get_range?${params.toString()}`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Databento回應 HTTP ${res.status}：${text.slice(0, 500)}` }, { status: 502 });
    }

    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json({ candles: [] }); // 這段期間沒有資料（例如還沒開盤的區間）
    }

    const header = lines[0].split(",");
    const idx = (name: string) => header.indexOf(name);
    const iTs = idx("ts_event");
    const iOpen = idx("open");
    const iHigh = idx("high");
    const iLow = idx("low");
    const iClose = idx("close");
    const iVolume = idx("volume");

    if (iTs === -1 || iOpen === -1) {
      return NextResponse.json(
        { error: `CSV欄位格式跟預期不同，實際欄位：${header.join(",")}` },
        { status: 502 }
      );
    }

    const candles = lines.slice(1).map((line) => {
      const cols = line.split(",");
      // ts_event 如果是ISO字串就用Date解析，如果是奈秒數字就除以1e9
      const rawTs = cols[iTs];
      const time = /^\d+$/.test(rawTs) ? Math.floor(Number(rawTs) / 1e9) : Math.floor(new Date(rawTs).getTime() / 1000);
      return {
        time,
        open: Number(cols[iOpen]),
        high: Number(cols[iHigh]),
        low: Number(cols[iLow]),
        close: Number(cols[iClose]),
        volume: Number(cols[iVolume] ?? 0),
      };
    });

    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
