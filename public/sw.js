// 極簡Service Worker，唯一目的是讓瀏覽器認得「這個網站有作用中的Service Worker」，
// 這樣 registration.showNotification() 才能用——手機把網站加到主畫面、變成獨立App
// （standalone模式）之後，很多時候只有透過這條路才能正常顯示通知，直接呼叫
// new Notification() 在這個模式下容易被安靜擋掉。
//
// 這裡刻意不處理離線快取、不攔截fetch，只負責啟用+接管，維持最簡單、風險最低的範圍，
// 不會改變App任何既有的行為。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
