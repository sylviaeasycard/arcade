/* ==========================================================================
   🌿 踩坑避雷（踩地雷）
   - 第一下保證安全（周圍 8 格也不會有坑）
   - 長按 / 右鍵 / 插旗模式 三種方式插旗
   ========================================================================== */
(() => {
    const A = Arcade;
    const LEVELS = {
        easy:   { label: '簡單', ratio: 0.10 },
        medium: { label: '普通', ratio: 0.15 },
        hard:   { label: '困難', ratio: 0.22 }
    };
    const SIZES = [6, 8, 10];
    const COUNT_COLORS = ['', '#38bdf8', '#4ade80', '#facc15', '#f97316', '#f43f5e', '#a855f7', '#e2e8f0', '#e2e8f0'];
    const LONG_PRESS_MS = 420;

    const cfg = Object.assign({ size: 6, level: 'easy' }, A.store.get('mines_cfg', {}));
    let els = {};
    let board = [], cells = [];
    let started = false, over = false, flagMode = false, mineCount = 0;

    const saveCfg = () => A.store.set('mines_cfg', cfg);

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="seg size-seg">
                    ${SIZES.map(s => `<button data-size="${s}">${s}×${s}</button>`).join('')}
                    <button data-size="custom">自訂</button>
                </div>
                <div class="seg level-seg">
                    ${Object.entries(LEVELS).map(([k, v]) => `<button data-level="${k}">${v.label}</button>`).join('')}
                </div>
                <div class="status compact"></div>
                <div class="fit-grow mines-area"><div class="mines-board"></div></div>
                <div class="row">
                    <button class="btn grow flag-btn">🚩 插旗：關</button>
                    <button class="btn btn-emerald grow restart-btn">🔄 重新開局</button>
                    <button class="btn help-btn" aria-label="玩法說明">❓</button>
                </div>
            </div>`));

        els.board = el.querySelector('.mines-board');
        A.fitInto(el.querySelector('.mines-area'), 1, w => {
            const size = Math.min(w, 440);
            els.board.style.width = size + 'px';
            els.board.style.setProperty('--bs', size + 'px');
        });
        els.status = el.querySelector('.status');
        els.flag = el.querySelector('.flag-btn');
        els.sizeBtns = [...el.querySelectorAll('.size-seg button')];
        els.levelBtns = [...el.querySelectorAll('.level-seg button')];

        els.sizeBtns.forEach(b => b.onclick = () => {
            if (b.dataset.size === 'custom') { customSize(); return; }
            cfg.size = +b.dataset.size; saveCfg(); init();
        });
        els.levelBtns.forEach(b => b.onclick = () => {
            cfg.level = b.dataset.level; saveCfg(); init();
        });
        els.flag.onclick = () => { flagMode = !flagMode; syncButtons(); };
        el.querySelector('.restart-btn').onclick = init;
        el.querySelector('.help-btn').onclick = showHelp;

        init();
        if (!A.store.get('mines_seen_help', false)) {
            A.store.set('mines_seen_help', true);
            setTimeout(showHelp, 300);
        }
    }

    function showHelp() {
        A.modal({
            icon: '🌿', title: '怎麼玩',
            message: '點一下翻開草叢，數字代表周圍 8 格裡有幾個坑。\n覺得某格是坑，就「長按」它插上 🚩，或打開下方「🚩 插旗」再點。\n第一下一定安全！把所有不是坑的格子翻開就過關。'
        });
    }

    function syncButtons() {
        const isPreset = SIZES.includes(cfg.size);
        els.sizeBtns.forEach(b => {
            const custom = b.dataset.size === 'custom';
            b.classList.toggle('on', custom ? !isPreset : +b.dataset.size === cfg.size);
            if (custom) b.textContent = isPreset ? '自訂' : `${cfg.size}×${cfg.size}`;
        });
        els.levelBtns.forEach(b => b.classList.toggle('on', b.dataset.level === cfg.level));
        els.flag.classList.toggle('on', flagMode);
        els.flag.textContent = `🚩 插旗：${flagMode ? '開' : '關'}`;
    }

    async function customSize() {
        let v = cfg.size;
        const body = A.h(`
            <div class="stepper">
                <button class="btn" data-d="-1" aria-label="減少">−</button>
                <span class="stepper-val"></span>
                <button class="btn" data-d="1" aria-label="增加">＋</button>
            </div>`);
        const val = body.querySelector('.stepper-val');
        const show = () => { val.textContent = `${v}×${v}`; };
        show();
        body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
            v = Math.min(12, Math.max(4, v + Number(b.dataset.d)));
            show();
        });
        const ok = await A.modal({
            icon: '📐', title: '自訂地圖大小', message: '邊長 4 ～ 12 格', body,
            buttons: [{ label: '取消', value: false }, { label: '確定', value: true, primary: true }]
        });
        if (ok) { cfg.size = v; saveCfg(); init(); }
    }

    function neighbors(r, c) {
        const out = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (!dr && !dc) continue;
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < cfg.size && nc >= 0 && nc < cfg.size) out.push([nr, nc]);
            }
        }
        return out;
    }

    function init() {
        const N = cfg.size;
        started = false;
        over = false;
        mineCount = Math.max(1, Math.floor(N * N * LEVELS[cfg.level].ratio));
        board = Array.from({ length: N }, () =>
            Array.from({ length: N }, () => ({ mine: false, open: false, flag: false, count: 0 })));

        els.board.style.setProperty('--n', N);
        els.board.innerHTML = '';
        cells = [];
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const b = document.createElement('button');
                b.className = 'cell';
                b.textContent = '🌿';
                b.setAttribute('aria-label', `第 ${r + 1} 列第 ${c + 1} 格`);
                bindCell(b, r, c);
                els.board.append(b);
                cells.push(b);
            }
        }
        syncButtons();
        updateStatus();
    }

    // 點擊 / 長按 / 右鍵
    function bindCell(b, r, c) {
        let timer = null, sx = 0, sy = 0, long = false;
        const cancel = () => { clearTimeout(timer); timer = null; };

        b.addEventListener('pointerdown', e => {
            long = false;
            sx = e.clientX; sy = e.clientY;
            cancel();
            if (e.button !== 0) return;
            timer = setTimeout(() => { long = true; timer = null; toggleFlag(r, c); }, LONG_PRESS_MS);
        });
        b.addEventListener('pointermove', e => {
            if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) cancel();
        });
        b.addEventListener('pointerup', cancel);
        b.addEventListener('pointercancel', cancel);
        b.addEventListener('pointerleave', cancel);

        // 桌機右鍵；Android 長按也會觸發這個，已經插過旗就不要再切一次
        b.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (long) return;
            cancel();
            long = true;
            toggleFlag(r, c);
        });

        b.addEventListener('click', () => {
            if (long) { long = false; return; }
            if (flagMode) toggleFlag(r, c);
            else reveal(r, c);
        });
    }

    function cellEl(r, c) { return cells[r * cfg.size + c]; }

    function placeMines(sr, sc) {
        const N = cfg.size;
        const safe = new Set([sr * N + sc]);
        // 地圖夠大時，第一下周圍也清空，保證開出一片
        if (N * N - 9 >= mineCount) neighbors(sr, sc).forEach(([r, c]) => safe.add(r * N + c));

        const candidates = [];
        for (let i = 0; i < N * N; i++) if (!safe.has(i)) candidates.push(i);
        A.shuffle(candidates).slice(0, mineCount).forEach(i => {
            board[Math.floor(i / N)][i % N].mine = true;
        });

        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                board[r][c].count = neighbors(r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
            }
        }
    }

    function toggleFlag(r, c) {
        const cell = board[r][c];
        if (over || cell.open) return;
        cell.flag = !cell.flag;
        cellEl(r, c).textContent = cell.flag ? '🚩' : '🌿';
        A.buzz(25);
        updateStatus();
    }

    function reveal(r, c) {
        if (over) return;
        const cell = board[r][c];
        if (cell.open || cell.flag) return;

        if (!started) { placeMines(r, c); started = true; }
        if (cell.mine) { lose(r, c); return; }

        // 用堆疊展開空白區域（不用遞迴，大地圖也不會爆）
        const stack = [[r, c]];
        while (stack.length) {
            const [y, x] = stack.pop();
            const k = board[y][x];
            if (k.open || k.flag || k.mine) continue;
            k.open = true;
            paintOpen(y, x);
            if (k.count === 0) stack.push(...neighbors(y, x));
        }
        A.buzz(10);
        checkWin();
        updateStatus();
    }

    function paintOpen(r, c) {
        const b = cellEl(r, c);
        const n = board[r][c].count;
        b.classList.add('open');
        b.textContent = n > 0 ? n : '';
        if (n > 0) b.style.color = COUNT_COLORS[n];
    }

    function lose(r, c) {
        over = true;
        for (let y = 0; y < cfg.size; y++) {
            for (let x = 0; x < cfg.size; x++) {
                const k = board[y][x], b = cellEl(y, x);
                if (k.mine && !k.flag) { b.textContent = '🕳️'; b.classList.add('mine'); }
                else if (!k.mine && k.flag) { b.textContent = '❌'; }
            }
        }
        const b = cellEl(r, c);
        b.textContent = '💥';
        b.classList.remove('mine');
        b.classList.add('boom');
        els.status.textContent = '💥 踩到坑了！人生總有意外，重新再來！';
        A.buzz([80, 40, 80]);
    }

    function checkWin() {
        for (const row of board) for (const k of row) if (!k.mine && !k.open) return;
        over = true;
        board.forEach((row, y) => row.forEach((k, x) => {
            if (k.mine) { k.flag = true; cellEl(y, x).textContent = '🚩'; }
        }));
        const wins = A.store.get('mines_wins', 0) + 1;
        A.store.set('mines_wins', wins);
        A.buzz([50, 50, 50, 50, 100]);
    }

    function updateStatus() {
        if (over) {
            if (!els.status.textContent.startsWith('💥')) {
                els.status.textContent = '🎉 太棒了！順利避開所有人生陷阱！';
            }
            return;
        }
        let flags = 0;
        for (const row of board) for (const k of row) if (k.flag) flags++;
        els.status.textContent = `🕳️ 坑洞 ${mineCount} 個　🚩 已標記 ${flags}`;
    }

    A.register({
        id: 'mines',
        name: '踩坑避雷',
        icon: '🌿',
        desc: '夜市探險版踩地雷，推理出每個坑洞的位置',
        tag: '動腦',
        color: '#10b981',
        mount,
        stat: () => {
            const w = A.store.get('mines_wins', 0);
            return w ? `🏆 過關 ${w} 次` : null;
        }
    });
})();
