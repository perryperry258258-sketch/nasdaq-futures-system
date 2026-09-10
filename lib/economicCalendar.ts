// 會影響價格的總經事件行事曆——FOMC利率決策、CPI、非農就業報告。
// 這些日期是政府機關（Fed、BLS）提前公布好的官方排程，不是預測，查證來源：
// - FOMC：federalreserve.gov 官方會議行事曆
// - CPI：BLS 官方發布排程
// - 非農（NFP）：BLS Employment Situation 排程，通常是每月第一個星期五，
//   但2026年已經因為政府關門、假日等原因調整過好幾次，11月、12月這兩筆
//   還沒被BLS正式確認，是照「第一個星期五」的慣例推算，標記為「預期」。
//
// 時間全部存UTC，是根據查證當下（2026年9月）美東時間換算好的，9-10月是
// 日光節約時間（EDT，UTC-4），11月起换回標準時間（EST，UTC-5，11/1切換）。
// 這份資料只到2026年底，跨年後要重新查證2027年的排程再更新。

export interface EconomicEvent {
  id: string;
  name: string;
  category: "FOMC" | "CPI" | "NFP";
  utcTime: string; // ISO 8601
  confirmed: boolean; // false代表是照慣例推算，不是官方已公布確認的日期
  note: string;
}

export const ECONOMIC_EVENTS_2026: EconomicEvent[] = [
  {
    id: "cpi-2026-09",
    name: "CPI 消費者物價指數（8月數據）",
    category: "CPI",
    utcTime: "2026-09-11T12:30:00Z",
    confirmed: true,
    note: "BLS官方排程，8:30 AM ET",
  },
  {
    id: "fomc-2026-09",
    name: "FOMC 利率決策",
    category: "FOMC",
    utcTime: "2026-09-16T18:00:00Z",
    confirmed: true,
    note: "聯準會官方會議行事曆，2:00 PM ET，會議為9/15-16兩天",
  },
  {
    id: "nfp-2026-10",
    name: "非農就業報告（9月數據）",
    category: "NFP",
    utcTime: "2026-10-02T12:30:00Z",
    confirmed: true,
    note: "BLS官方排程，8:30 AM ET",
  },
  {
    id: "cpi-2026-10",
    name: "CPI 消費者物價指數（9月數據）",
    category: "CPI",
    utcTime: "2026-10-14T12:30:00Z",
    confirmed: true,
    note: "BLS官方排程，8:30 AM ET",
  },
  {
    id: "fomc-2026-10",
    name: "FOMC 利率決策",
    category: "FOMC",
    utcTime: "2026-10-28T18:00:00Z",
    confirmed: true,
    note: "聯準會官方會議行事曆，2:00 PM ET，會議為10/27-28兩天",
  },
  {
    id: "nfp-2026-11",
    name: "非農就業報告（10月數據）",
    category: "NFP",
    utcTime: "2026-11-06T13:30:00Z",
    confirmed: false,
    note: "照「每月第一個星期五」慣例推算，BLS尚未正式公布確認，2026年已多次因故調整過排程",
  },
  {
    id: "cpi-2026-11",
    name: "CPI 消費者物價指數（10月數據）",
    category: "CPI",
    utcTime: "2026-11-10T13:30:00Z",
    confirmed: true,
    note: "BLS官方排程，8:30 AM ET（11月起換回標準時間EST）",
  },
  {
    id: "nfp-2026-12",
    name: "非農就業報告（11月數據）",
    category: "NFP",
    utcTime: "2026-12-04T13:30:00Z",
    confirmed: false,
    note: "照「每月第一個星期五」慣例推算，BLS尚未正式公布確認",
  },
  {
    id: "fomc-2026-12",
    name: "FOMC 利率決策",
    category: "FOMC",
    utcTime: "2026-12-09T19:00:00Z",
    confirmed: true,
    note: "聯準會官方會議行事曆，2:00 PM ET，會議為12/8-9兩天",
  },
  {
    id: "cpi-2026-12",
    name: "CPI 消費者物價指數（11月數據）",
    category: "CPI",
    utcTime: "2026-12-10T13:30:00Z",
    confirmed: true,
    note: "BLS官方排程，8:30 AM ET",
  },
];

// 回傳「現在算起，未來withinHours小時內」+「過去1小時內剛發生」的事件，
// 依時間排序。剛發生的也一併顯示，因為公布後短時間內價格通常還在劇烈反應。
export function getUpcomingEvents(withinHours: number = 24): EconomicEvent[] {
  const now = Date.now();
  const cutoff = now + withinHours * 3600 * 1000;
  const past = now - 1 * 3600 * 1000;
  return ECONOMIC_EVENTS_2026.filter((e) => {
    const t = new Date(e.utcTime).getTime();
    return t >= past && t <= cutoff;
  }).sort((a, b) => new Date(a.utcTime).getTime() - new Date(b.utcTime).getTime());
}
