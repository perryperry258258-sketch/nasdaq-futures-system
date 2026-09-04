// 內建預設樣本外資料（永久保存用）。
//
// 資料來源：Databento GLBX.MDP3，NQ.c.0（近月連續合約），2年份1分鐘K線合併成5分鐘，
// 跑跟crypto版本完全同一套回踩策略引擎（觀察窗口60分鐘、TP=1R），2026-09-04 產生。
// 花費約$3.85美金，已經刻進這個檔案，之後不用再重複花錢抓一次。
//
// 【誠實揭露：這份結果比crypto版本（74%勝率/PF1.4）好上一截（82%勝率/PF3.96），
// 還沒完全確認這是真的優勢還是資料/樣本問題，先列出保留意見，不是照單全收】
// - 樣本只有80筆（crypto版本587筆），統計可信度比較低，數字容易因為運氣而失真
// - 用的是「連續合約」（NQ.c.0），季度展期時價格會跳空（2年大約8次），
//   如果跳空剛好發生在Reference Candle附近，可能製造出異常巨大、不真實的「假突破」，
//   被策略誤判成一次漂亮的勝利——這次沒有另外過濾展期日期，是已知的方法論缺口
// - 期貨的手續費/滑價成本（lib/futuresCost.ts，固定跳動點數模型）相對於NQ典型的
//   波動幅度非常小，這是「命中停利的交易R值都貼著+1.0」的合理原因，不是bug
// - 訓練段/驗證段的實際數字還沒有交叉核對過量級是否一致，只確認了三段都是正期望值

export interface OosSummary {
  verdict: "PASSED" | "INSUFFICIENT" | "FAILED";
  sampleCount: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdownR: number;
  windowMinutes: number;
  tpMultiple: number;
  computedAt: number;
}

export interface OosTradeRecord {
  rMultiple: number;
  entryTime: number; // unix秒
}

export const OOS_SEED: { summary: OosSummary; trades: OosTradeRecord[] } = {
  summary: {
    verdict: "PASSED",
    sampleCount: 80,
    winRate: 81.81818181818183,
    expectancy: 0.5262712831445754,
    profitFactor: 3.96283948919692,
    maxDrawdownR: 2.02137573964497,
    windowMinutes: 60,
    tpMultiple: 1,
    computedAt: 1788513337297,
  },
  trades: [
    { rMultiple: -1.0088757396449703, entryTime: 1775745300 },
    { rMultiple: -1.0125, entryTime: 1775834100 },
    { rMultiple: 0.9820359281437125, entryTime: 1776090900 },
    { rMultiple: 0.9895104895104895, entryTime: 1776177300 },
    { rMultiple: 0.9834254143646409, entryTime: 1776263700 },
    { rMultiple: 0.9912280701754386, entryTime: 1776352200 },
    { rMultiple: 0.9917355371900827, entryTime: 1776436500 },
    { rMultiple: 0.9905956112852664, entryTime: 1776695700 },
    { rMultiple: -1.008450704225352, entryTime: 1776782100 },
    { rMultiple: 0.9905362776025236, entryTime: 1776868500 },
    { rMultiple: 0.9856459330143541, entryTime: 1776954900 },
    { rMultiple: 0.9891304347826086, entryTime: 1777041900 },
    { rMultiple: -1.0079575596816976, entryTime: 1777387800 },
    { rMultiple: 0.9912536443148688, entryTime: 1777473300 },
    { rMultiple: -1.004991680532446, entryTime: 1777560300 },
    { rMultiple: 0.9942528735632183, entryTime: 1777646100 },
    { rMultiple: 0.9883720930232558, entryTime: 1777905300 },
    { rMultiple: 0.9875518672199171, entryTime: 1777991700 },
    { rMultiple: 0.9932432432432432, entryTime: 1778078100 },
    { rMultiple: 0.9846153846153847, entryTime: 1778166300 },
    { rMultiple: -0.3474714518760196, entryTime: 1778514600 },
    { rMultiple: 0.99079754601227, entryTime: 1778596500 },
    { rMultiple: 0.994661921708185, entryTime: 1778682900 },
    { rMultiple: 0.9919786096256684, entryTime: 1778769300 },
    { rMultiple: 0.9926650366748166, entryTime: 1778855700 },
    { rMultiple: 0.9949579831932773, entryTime: 1779201300 },
    { rMultiple: 0.9911764705882353, entryTime: 1779287700 },
    { rMultiple: -0.07746478873239437, entryTime: 1779462300 },
    { rMultiple: 0.9620253164556962, entryTime: 1779719700 },
    { rMultiple: 0.9919354838709677, entryTime: 1779807900 },
    { rMultiple: 0.9886792452830189, entryTime: 1779900000 },
    { rMultiple: 0.6957123098201936, entryTime: 1779980400 },
    { rMultiple: 0.9934640522875817, entryTime: 1780325400 },
    { rMultiple: 0.9925558312655087, entryTime: 1780410900 },
    { rMultiple: -1.0052447552447552, entryTime: 1780497300 },
    { rMultiple: 0.9947826086956522, entryTime: 1780585200 },
    { rMultiple: 0.9926289926289926, entryTime: 1780670100 },
    { rMultiple: 0.9949066213921901, entryTime: 1781016300 },
    { rMultiple: -1.0042796005706134, entryTime: 1781102700 },
    { rMultiple: 0.9934924078091106, entryTime: 1781188500 },
    { rMultiple: 0.9962121212121212, entryTime: 1781274900 },
    { rMultiple: 0.9917808219178083, entryTime: 1781534100 },
    { rMultiple: 0.9886363636363636, entryTime: 1781620500 },
    { rMultiple: -1.0161290322580645, entryTime: 1781880900 },
    { rMultiple: 0.9949066213921901, entryTime: 1782138900 },
    { rMultiple: -0.2507987220447284, entryTime: 1782225900 },
    { rMultiple: -1.0036585365853659, entryTime: 1782313200 },
    { rMultiple: -0.031222896790980052, entryTime: 1782404100 },
    { rMultiple: 0.9960578186596584, entryTime: 1782484800 },
    { rMultiple: 0.9942528735632183, entryTime: 1783002900 },
    { rMultiple: 0.9781021897810219, entryTime: 1783089300 },
    { rMultiple: 0.19478527607361962, entryTime: 1783348500 },
    { rMultiple: -0.01466275659824047, entryTime: 1783440000 },
    { rMultiple: 0.9928909952606635, entryTime: 1783958100 },
    { rMultiple: 0.9949324324324325, entryTime: 1784126400 },
    { rMultiple: 0.9948717948717949, entryTime: 1784299500 },
    { rMultiple: 0.9933035714285714, entryTime: 1784558100 },
    { rMultiple: 0.9933774834437086, entryTime: 1784646600 },
    { rMultiple: 0.9896193771626297, entryTime: 1784730900 },
    { rMultiple: 0.9930232558139535, entryTime: 1784817900 },
    { rMultiple: 0.993006993006993, entryTime: 1784904900 },
    { rMultiple: 0.9937888198757764, entryTime: 1785249600 },
    { rMultiple: 0.40237691001697795, entryTime: 1785348000 },
    { rMultiple: 0.7170658682634731, entryTime: 1785518700 },
    { rMultiple: 0.9903536977491961, entryTime: 1785940500 },
    { rMultiple: 0.9943396226415094, entryTime: 1786032900 },
    { rMultiple: -1.005671077504726, entryTime: 1786113600 },
    { rMultiple: -1.0071599045346062, entryTime: 1786372500 },
    { rMultiple: 0.9935344827586207, entryTime: 1786461000 },
    { rMultiple: -0.33064516129032256, entryTime: 1786546500 },
    { rMultiple: 0.9882352941176471, entryTime: 1786718100 },
    { rMultiple: 0.1995967741935484, entryTime: 1787064300 },
    { rMultiple: 0.9920424403183024, entryTime: 1787150100 },
    { rMultiple: -1.0063424947145878, entryTime: 1787322900 },
    { rMultiple: -0.8497652582159624, entryTime: 1787582100 },
    { rMultiple: 0.6056701030927836, entryTime: 1787668500 },
    { rMultiple: 0.98989898989899, entryTime: 1787927700 },
    { rMultiple: -0.21662468513853902, entryTime: 1788186900 },
    { rMultiple: 0.9879032258064516, entryTime: 1788273300 },
    { rMultiple: 0.9875, entryTime: 1788359700 },
  ],
};
