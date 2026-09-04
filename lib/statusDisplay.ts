import { STATE_INFO } from "./retestEngine";
import type { SignalState } from "./retestEngine";

// 顯示層細分：EXPIRED這個狀態底下其實有兩種不同情況——
// (a) 曾經確認回踩、可以進場，但4小時內沒等到停損或停利就到期了 → 這其實是「錯過進場」，
//     使用者如果那段時間沒看到，就真的錯過了這次機會，跟單純「這次沒有形成訊號」意義不同。
// (b) 從頭到尾沒有確認回踩就過期（突破後沒回踩，或回踩失敗）→ 維持原本的「已過期」。
// 這只是把 evaluateLiveSignal() 已經算出來的 state + retestTime 兩個既有欄位拿來組合判斷，
// 沒有新增或修改任何交易判斷邏輯，純粹是顯示文字的細分——跟crypto版本components/
// statusTheme.ts的getSignalDisplayTheme做法完全一樣，這裡是給NQ這個單一商品App用的
// 簡化版（不需要crypto版本那一整套顏色系統，只要emoji+label）。
export function getDisplayInfo(s: { state: SignalState; retestTime: number | null }): { emoji: string; label: string } {
  if (s.state === "EXPIRED" && s.retestTime != null) {
    return { emoji: "⚠️", label: "錯過進場" };
  }
  return STATE_INFO[s.state];
}
