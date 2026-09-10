// 瀏覽器原生 Notification API。免費、不需要任何後端或第三方服務。
// 限制：只有在網站分頁還開著（可在背景）時才會運作，完全關閉分頁後不會收到。
//
// 【修正，跟crypto專案同步】手機把網站加到主畫面、變成獨立App圖示之後（standalone模式），
// 即使App開在最前面、權限也是granted，直接呼叫 new Notification() 還是會被安靜擋掉。
// 現在改成優先走Service Worker的 registration.showNotification() 這條路，
// Service Worker還沒註冊好才退回原本的簡單寫法。

export type NotificationPermissionStatus = "default" | "granted" | "denied" | "unsupported";

export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationPermissionStatus;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const result = await Notification.requestPermission();
  return result as NotificationPermissionStatus;
}

export async function showNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag });
        return;
      }
    } catch {
      // 這條路失敗就往下退回備用寫法
    }
  }

  try {
    new Notification(title, { body, tag });
  } catch {
    // 兩條路都失敗就安靜放棄，不影響其他功能
  }
}
