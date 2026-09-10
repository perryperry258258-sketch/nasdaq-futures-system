"use client";

import { useEffect, useState } from "react";
import { getUpcomingEvents, EconomicEvent } from "@/lib/economicCalendar";

// 在未來24小時內（或過去1小時內剛公布）有FOMC/CPI/非農，就顯示一條提醒。
// 這些是已知會讓價格劇烈波動的總經事件，跟系統本身的訊號判斷無關，單純是
// 讓使用者自己提高警覺、決定要不要在這段時間附近進出場。
export default function EconomicEventBanner() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);

  useEffect(() => {
    setEvents(getUpcomingEvents(24));
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn/10 p-3 mb-3">
      <div className="text-xs font-semibold text-warn mb-1.5">⚠️ 近期有總經事件，注意波動</div>
      <div className="space-y-1">
        {events.map((e) => {
          const t = new Date(e.utcTime);
          const isPast = t.getTime() < Date.now();
          return (
            <div key={e.id} className="text-xs text-subtext">
              {e.name}
              {!e.confirmed && <span className="text-[10px]">（日期未確認，慣例推算）</span>} ・{" "}
              {isPast ? "剛公布" : t.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
