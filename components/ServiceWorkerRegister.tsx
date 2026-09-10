"use client";

import { useEffect } from "react";

// 註冊 public/sw.js，只是為了讓通知能用 registration.showNotification() 這條路——
// 詳細原因見 sw.js 跟 lib/notifications.ts 裡的註解。跟crypto專案做法同步過來。
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 註冊失敗就算了，showNotification()裡有備用寫法，不影響其他功能
    });
  }, []);
  return null;
}
