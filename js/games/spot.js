/* ==========================================================================
   🔍 找不同 — 用程式產生題目，永遠玩不完
   - 上下兩格夜市圖案，下面那格有幾處不一樣
   - 點上面或下面都算；點錯不扣分、沒有時間限制、有提示
   ========================================================================== */
(() => {
    const A = Arcade;
    const ITEMS = ['🍢', '🧋', '🍡', '🥟', '🍗', '🎈', '🍧', '🌽', '🍠', '🍉', '🏮', '🎏', '🍭', '🦑', '🍤', '🥤', '🍬', '🧸'];
    // 轉向後看得出差別的圖案（左右對稱的不適合用「倒過來」）
    const ROTATABLE = ['🍢', '🧋', '🍡', '🍗', '🎈', '🍧', '🌽', '🍠', '🍭', '🦑', '🍤', '🎏', '🥤', '🧸'];
    const LEVELS = {
        easy:   { label: '簡單', n: 4, diffs: 3, kinds: ['swap', 'swap', 'gone'] },
        normal: { label: '普通', n: 5, diffs: 4, kinds: ['swap', 'swap', 'gone', 'flip'] },
        hard:   { label: '困難', n: 6, diffs: 5, kinds: ['swap', 'gone', 'flip', 'small', 'turn'] }
    };

    const cfg = Object.assign({ level: 'easy' }, A.store.get('spot_cfg', {}));
    let els = {};
    let base = [], diffs = new Map(), found = new Set();
    let topCells = [], botCells = [];

    const saveCfg = () => A.store.set('spot_cfg', cfg);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    function mount(el) {
        el.append(A.h(`
            <div class="panel stack">
                <div class="status spot-status"></div>
                <div class="spot-label">⬆️ 原本的樣子</div>
                <div class="spot-grid spot-top"></div>
                <div class="spot-label">⬇️ 哪裡不一樣？點它！</div>
                <div class="spot-grid spot-bottom"></div>
                <div class="row">
                    <button class="btn grow hint-btn">💡 提示</button>
                    <button class="btn btn-sky grow new-btn">🔄 換一題</button>
                </div>
                <div class="seg level-seg">
                    ${Object.entries(LEVELS).map(([k, v]) => `<button data-level="${k}">${v.label}</button>`).join('')}
                </div>
            </div>`));

        els.status = el.querySelector('.spot-status');
        els.top = el.querySelector('.spot-top');
        els.bottom = el.querySelector('.spot-bottom');
        els.levelBtns = [...el.querySelectorAll('.level-seg button')];

        els.levelBtns.forEach(b => b.onclick = () => { cfg.level = b.dataset.level; saveCfg(); newPuzzle(); });
        el.querySelector('.hint-btn').onclick = hint;
        el.querySelector('.new-btn').onclick = newPuzzle;

        newPuzzle();
    }

    function newPuzzle() {
        const lv = LEVELS[cfg.level];
        const total = lv.n * lv.n;

        // 原圖：盡量平均使用各種圖案
        base = [];
        while (base.length < total) base.push(...A.shuffle(ITEMS));
        base = A.shuffle(base.slice(0, total));

        // 挑出不重複的位置做差異
        diffs = new Map();
        found = new Set();
        const spots = A.shuffle([...Array(total).keys()]);
        const kinds = A.shuffle(lv.kinds);
        for (let k = 0, i = 0; k < kinds.length && i < spots.length; i++) {
            const idx = spots[i];
            let kind = kinds[k];
            if ((kind === 'flip' || kind === 'turn') && !ROTATABLE.includes(base[idx])) continue;
            const d = { kind };
            if (kind === 'swap') d.item = pick(ITEMS.filter(x => x !== base[idx]));
            diffs.set(idx, d);
            k++;
        }

        els.levelBtns.forEach(b => b.classList.toggle('on', b.dataset.level === cfg.level));
        [els.top, els.bottom].forEach(g => { g.style.setProperty('--n', lv.n); g.innerHTML = ''; });
        topCells = []; botCells = [];

        base.forEach((item, idx) => {
            topCells.push(makeCell(els.top, item, '', idx));
            const d = diffs.get(idx);
            let face = item, cls = '';
            if (d) {
                if (d.kind === 'swap') face = d.item;
                else if (d.kind === 'gone') face = '';
                else if (d.kind === 'flip') cls = 'flip';
                else if (d.kind === 'small') cls = 'small';
                else if (d.kind === 'turn') cls = 'turn';
            }
            botCells.push(makeCell(els.bottom, face, cls, idx));
        });
        updateStatus();
    }

    function makeCell(grid, face, cls, idx) {
        const c = A.h(`<button class="spot-cell"><span class="${cls}"></span></button>`);
        c.firstElementChild.textContent = face;
        c.addEventListener('click', () => tap(idx, c));
        c.addEventListener('animationend', () => c.classList.remove('hinting', 'miss'));
        grid.append(c);
        return c;
    }

    function tap(idx, cell) {
        if (found.size === diffs.size) return;
        if (diffs.has(idx)) {
            if (found.has(idx)) return;
            found.add(idx);
            topCells[idx].classList.add('found');
            botCells[idx].classList.add('found');
            A.buzz(30);
            updateStatus();
            if (found.size === diffs.size) finish();
        } else {
            // 點錯：輕輕晃一下，不扣分
            cell.classList.remove('miss');
            void cell.offsetWidth;
            cell.classList.add('miss');
            A.buzz(8);
        }
    }

    function hint() {
        const left = [...diffs.keys()].filter(i => !found.has(i));
        if (!left.length) return;
        const idx = pick(left);
        [topCells[idx], botCells[idx]].forEach(c => {
            c.classList.remove('hinting');
            void c.offsetWidth;
            c.classList.add('hinting');
        });
    }

    function updateStatus() {
        els.status.textContent = `🔍 已找到 ${found.size} / ${diffs.size} 處`;
    }

    async function finish() {
        const n = A.store.get('spot_cleared', 0) + 1;
        A.store.set('spot_cleared', n);
        els.status.textContent = `🎉 全部找到了！已經過關 ${n} 題`;
        A.buzz([50, 50, 100]);
        const next = await A.modal({
            icon: '🎉', message: `眼力真好，${diffs.size} 處全部找到了！`,
            buttons: [{ label: '先看看', value: false }, { label: '下一題', value: true, primary: true }]
        });
        if (next) newPuzzle();
    }

    A.register({
        id: 'spot',
        name: '找不同',
        icon: '🔍',
        desc: '上下兩張圖，找出不一樣的地方',
        tag: '動腦',
        color: '#06b6d4',
        mount,
        stat: () => {
            const n = A.store.get('spot_cleared', 0);
            return n ? `🎉 過關 ${n} 題` : null;
        }
    });
})();
