/* ==========================================================================
   🎴 翻牌記憶
   - 離開再回來不會重新洗牌，計時器會暫停
   - 翻第一張牌才開始計時；計時可以關掉（長輩玩比較沒壓力）
   ========================================================================== */
(() => {
    const A = Arcade;
    const EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐸', '🦁', '🦄', '🐵', '🐰', '🐨'];
    const LEVELS = {
        easy:   { label: '簡單 12 張', pairs: 6, cols: 4 },
        normal: { label: '標準 16 張', pairs: 8, cols: 4 },
        hard:   { label: '進階 20 張', pairs: 10, cols: 5 }
    };

    const cfg = Object.assign({ level: 'normal', showTimer: true }, A.store.get('memory_cfg', {}));
    let els = {};
    let flipped = [], matched = 0, moves = 0, secs = 0;
    let timer = null, started = false, done = false;

    const saveCfg = () => A.store.set('memory_cfg', cfg);
    const bestKey = () => `memory_best_${cfg.level}`;

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="seg level-seg">
                    ${Object.entries(LEVELS).map(([k, v]) => `<button data-level="${k}">${v.label}</button>`).join('')}
                </div>
                <div class="stats three compact">
                    <div class="stat time-stat"><span class="stat-label">⏱️ 時間</span><span class="stat-value time" style="color:var(--amber)">0</span></div>
                    <div class="stat"><span class="stat-label">🐾 步數</span><span class="stat-value moves" style="color:var(--sky)">0</span></div>
                    <div class="stat"><span class="stat-label">🏅 最少步數</span><span class="stat-value best" style="color:var(--emerald)">—</span></div>
                </div>
                <div class="fit-grow mem-area"><div class="memory-board"></div></div>
                <div class="mem-status"></div>
                <div class="row">
                    <button class="btn grow timer-btn"></button>
                    <button class="btn btn-indigo grow restart-btn">🔄 重新洗牌</button>
                </div>
            </div>`));

        els.board = el.querySelector('.memory-board');
        els.area = el.querySelector('.mem-area');
        new ResizeObserver(sizeBoard).observe(els.area);
        els.time = el.querySelector('.time');
        els.timeStat = el.querySelector('.time-stat');
        els.moves = el.querySelector('.moves');
        els.best = el.querySelector('.best');
        els.status = el.querySelector('.mem-status');
        els.timerBtn = el.querySelector('.timer-btn');
        els.levelBtns = [...el.querySelectorAll('.level-seg button')];

        els.levelBtns.forEach(b => b.onclick = () => { cfg.level = b.dataset.level; saveCfg(); init(); });
        els.timerBtn.onclick = () => { cfg.showTimer = !cfg.showTimer; saveCfg(); syncUI(); };
        el.querySelector('.restart-btn').onclick = init;

        init();
    }

    function syncUI() {
        els.levelBtns.forEach(b => b.classList.toggle('on', b.dataset.level === cfg.level));
        els.timeStat.style.visibility = cfg.showTimer ? 'visible' : 'hidden';
        els.timerBtn.textContent = `⏱️ 計時：${cfg.showTimer ? '顯示' : '隱藏'}`;
        const best = A.store.get(bestKey(), 0);
        els.best.textContent = best || '—';
    }

    // 依可用空間決定每張牌多大，整個牌面不用捲動
    function sizeBoard() {
        const r = els.area.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const lv = LEVELS[cfg.level];
        const rowsN = lv.pairs * 2 / lv.cols, G = 10, P = 22;
        const card = Math.floor(Math.min(
            (r.width - P - (lv.cols - 1) * G) / lv.cols,
            (r.height - P - (rowsN - 1) * G) / rowsN,
            110));
        els.board.style.width = (card * lv.cols + (lv.cols - 1) * G + P) + 'px';
        els.board.style.setProperty('--card', card + 'px');
    }

    function startTimer() {
        if (timer || !started || done) return;
        timer = setInterval(() => { secs++; els.time.textContent = secs; }, 1000);
    }
    function stopTimer() { clearInterval(timer); timer = null; }

    function init() {
        stopTimer();
        const lv = LEVELS[cfg.level];
        flipped = []; matched = 0; moves = 0; secs = 0;
        started = false; done = false;
        els.time.textContent = '0';
        els.moves.textContent = '0';
        els.status.textContent = '';

        const picks = A.shuffle(EMOJIS).slice(0, lv.pairs);
        const deck = A.shuffle([...picks, ...picks]);

        els.board.style.setProperty('--cols', lv.cols);
        sizeBoard();
        els.board.innerHTML = '';
        deck.forEach(emoji => {
            const card = A.h(`
                <div class="card-flip" role="button" aria-label="翻牌">
                    <div class="card-inner">
                        <div class="card-front">❓</div>
                        <div class="card-back">${emoji}</div>
                    </div>
                </div>`);
            card.dataset.emoji = emoji;
            card.onclick = () => flip(card);
            els.board.append(card);
        });
        syncUI();
    }

    function flip(card) {
        if (done || flipped.length >= 2) return;
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;

        if (!started) { started = true; startTimer(); }
        card.classList.add('flipped');
        flipped.push(card);
        if (flipped.length < 2) return;

        moves++;
        els.moves.textContent = moves;
        const [a, b] = flipped;

        if (a.dataset.emoji === b.dataset.emoji) {
            a.classList.add('matched');
            b.classList.add('matched');
            flipped = [];
            matched += 2;
            A.buzz(30);
            if (matched === LEVELS[cfg.level].pairs * 2) finish();
        } else {
            setTimeout(() => {
                a.classList.remove('flipped');
                b.classList.remove('flipped');
                flipped = [];
            }, 800);
        }
    }

    function finish() {
        done = true;
        stopTimer();
        const best = A.store.get(bestKey(), 0);
        const isRecord = !best || moves < best;
        if (isRecord) A.store.set(bestKey(), moves);
        const timeText = cfg.showTimer ? `耗時 ${secs} 秒，` : '';
        els.status.textContent = `🎉 恭喜通關！${timeText}共 ${moves} 步${isRecord ? '　🏅 新紀錄！' : ''}`;
        A.buzz([50, 50, 100]);
        syncUI();
    }

    A.register({
        id: 'memory',
        name: '翻牌記憶',
        icon: '🎴',
        desc: '翻開兩張相同的萌寵，訓練記憶力',
        tag: '動腦',
        color: '#818cf8',
        mount,
        enter: startTimer,   // 回來時如果還在玩，繼續計時
        leave: stopTimer,
        stat: () => {
            const b = A.store.get(bestKey(), 0);
            return b ? `🏅 ${LEVELS[cfg.level].label.split(' ')[0]}最少 ${b} 步` : null;
        }
    });
})();
