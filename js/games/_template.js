/* ==========================================================================
   新遊戲模板 — 複製這個檔案、改名，再到 index.html 和 sw.js 各加一行
   1. index.html：<script src="js/games/你的檔名.js" defer></script>
   2. sw.js 的 PRECACHE 清單：'./js/games/你的檔名.js'
   （這個模板本身沒有被載入）
   ========================================================================== */
(() => {
    const A = Arcade;

    // 遊戲狀態放這裡
    let root, els = {};

    function mount(el) {
        // 第一次進入遊戲時呼叫一次：建立畫面、綁定事件
        root = el;
        el.append(A.h(`
            <div class="panel stack">
                <p class="hint">遊戲說明寫在這裡。</p>
                <div class="stats">
                    <div class="stat"><span class="stat-label">分數</span><span class="stat-value score">0</span></div>
                    <div class="stat"><span class="stat-label">最高</span><span class="stat-value best">0</span></div>
                </div>
                <button class="btn btn-big btn-block btn-sunset start-btn">▶️ 開始</button>
            </div>`));
        els.score = el.querySelector('.score');
        els.best = el.querySelector('.best');
        el.querySelector('.start-btn').onclick = start;
        els.best.textContent = A.store.get('template_best', 0);
    }

    function start() { /* 開始一局 */ }

    function enter() { /* 每次進入畫面（或 App 從背景切回來）時呼叫 */ }

    function leave() { /* 離開畫面或 App 切到背景時呼叫：暫停計時器、動畫 */ }

    A.register({
        id: 'template',             // 網址會是 #template
        name: '模板遊戲',
        icon: '🧩',
        desc: '一句話說明，顯示在大廳卡片上',
        tag: '動腦',                // 動腦 / 反應 / 休閒
        color: '#38bdf8',           // 卡片頂端的顏色
        mount, enter, leave,
        stat: () => {               // 大廳卡片上的紀錄（沒有就回傳 null）
            const b = A.store.get('template_best', 0);
            return b ? `🏆 最高 ${b}` : null;
        },
        // onKey(e) { },            // 需要鍵盤時才寫
    });
})();
