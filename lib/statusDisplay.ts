import { STATE_INFO } from "./retestEngine";
import type { SignalState } from "./retestEngine";

// 顯示層細分：EXPIRED這個狀態底下其實有兩種不同情況——
// (a) 曾經確認回踩、已經進場，但4小時內沒碰到停損或停利 → 「時間到出場」，
//     用4小時最後一根的收盤價平倉（跟回測的TIMEEXIT一樣），畫面直接顯示這筆賺賠幾點。
//     【2026-09修正】原本這種情況顯示「⚠️ 錯過進場」，但使用者其實有進場，這個字眼
//     會讓人誤以為沒進到場，改成「⏱ 時間到出場 ±X點」。
// (b) 從頭到尾沒有確認回踩就過期（突破後沒回踩，或回踩失敗）→ 維持原本的「已過期」。
// 這只是把 evaluateLiveSignal() 已經算出來的欄位拿來組合判斷，沒有新增或修改任何
// 交易判斷邏輯，純粹是顯示文字的細分。
//
// 【國定假日/週末修正】NO_SESSION_TODAY狀態現在會附帶closedReason（「週末休市」或
// 「XX休市」），這裡優先顯示這個具體原因，比原本統一寫「非交易日」更清楚。
export function getDisplayInfo(s: {
  state: SignalState;
  retestTime: number | null;
  closedReason?: string | null;
  direction?: "LONG" | "SHORT" | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
}): { emoji: string; label: string } {
  if (s.state === "EXPIRED" && s.retestTime != null) {
    if (s.exitPrice != null && s.entryPrice != null && s.direction) {
      const pts = s.direction === "LONG" ? s.exitPrice - s.entryPrice : s.entryPrice - s.exitPrice;
      return { emoji: "⏱", label: `時間到出場 ${pts >= 0 ? "+" : ""}${pts.toFixed(2)}點` };
    }
    return { emoji: "⏱", label: "時間到出場" };
  }
  if (s.state === "NO_SESSION_TODAY" && s.closedReason) {
    return { emoji: "⚪", label: s.closedReason };
  }
  return STATE_INFO[s.state];
}
