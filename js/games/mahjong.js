/* ==========================================================================
   🀄 麻將連連看
   - 點兩張相同的牌，如果能用「最多轉兩個彎」的線連起來就消除
   - 線可以從牌桌外圍繞過去
   - 沒有時間限制；有提示、洗牌；沒路可走時自動洗牌
   - 牌面全部用 CSS 畫（手機的麻將 emoji 大多顯示不出來）
   ========================================================================== */
(() => {
    const A = Arcade;
    const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const HONORS = { E: '東', S: '南', W: '西', N: '北', C: '中', F: '發', P: '白' };
    const MAN = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => 'm' + n);
    const PIN = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => 'p' + n);
    const SOU = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => 's' + n);
    const ALL = [...MAN, ...PIN, ...SOU, ...Object.keys(HONORS)];
    const LEVELS = {
        easy:   { label: '簡單', cols: 4, rows: 6,  pool: [...Object.keys(HONORS), ...MAN] }, // 字牌 + 萬子，最好認
        normal: { label: '普通', cols: 6, rows: 8,  pool: ALL },
        hard:   { label: '困難', cols: 7, rows: 10, pool: ALL }
    };
    // 3×3 格子裡，點 / 條要放的位置（0~8）
    const LAYOUT = {
        1: [4], 2: [1, 7], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8], 7: [0, 1, 2, 4, 6, 7, 8], 8: [0, 1, 2, 3, 5, 6, 7, 8], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
    };
    const DOT_COLORS = ['#2563eb', '#16a34a', '#dc2626'];

    const cfg = Object.assign({ level: 'easy' }, A.store.get('mahjong_cfg', {}));
    let els = {};
    let rows = 0, cols = 0, grid = [], tiles = [];
    let selected = null, busy = false;

    const saveCfg = () => A.store.set('mahjong_cfg', cfg);

    /* ---------- 牌面 ---------- */
    function faceHTML(t) {
        const suit = t[0], n = +t.slice(1);
        if (suit === 'm' && n) {
            return `<span class="mj-man"><b>${NUM[n]}</b><i>萬</i></span>`;
        }
        if ((suit === 'p' || suit === 's') && n) {
            const cells = Array(9).fill('<i></i>');
            LAYOUT[n].forEach((pos, k) => {
                const color = suit === 'p' ? DOT_COLORS[Math.floor(pos / 3)] : (n === 1 ? '#dc2626' : '#15803d');
                cells[pos] = `<i class="${suit === 'p' ? 'dot' : 'bar'}${n === 1 ? ' one' : ''}" style="--c:${color}"></i>`;
            });
            return `<span class="mj-grid">${cells.join('')}</span>`;
        }
        if (t === 'P') return '<span class="mj-white"></span>';
        return `<span class="mj-honor mj-${t}">${HONORS[t]}</span>`;
    }

    /* ---------- 畫面 ---------- */
    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="seg level-seg">
                    ${Object.entries(LEVELS).map(([k, v]) => `<button data-level="${k}">${v.label}</button>`).join('')}
                </div>
                <div class="status compact mj-status"></div>
                <div class="fit-grow mj-area">
                    <div class="mj-wrap">
                        <div class="mj-board"></div>
                        <svg class="mj-line" aria-hidden="true"><polyline points=""/></svg>
                    </div>
                </div>
                <div class="row">
                    <button class="btn grow hint-btn">💡 提示</button>
                    <button class="btn grow shuffle-btn">🔀 洗牌</button>
                    <button class="btn btn-sky grow new-btn">🔄 新局</button>
                    <button class="btn help-btn" aria-label="玩法說明">❓</button>
                </div>
            </div>`));

        els.board = el.querySelector('.mj-board');
        els.wrap = el.querySelector('.mj-wrap');
        els.line = el.querySelector('.mj-line polyline');
        els.svg = el.querySelector('.mj-line');
        els.status = el.querySelector('.mj-status');
        els.area = el.querySelector('.mj-area');
        els.levelBtns = [...el.querySelectorAll('.level-seg button')];

        els.levelBtns.forEach(b => b.onclick = () => { cfg.level = b.dataset.level; saveCfg(); newGame(); });
        el.querySelector('.hint-btn').onclick = hint;
        el.querySelector('.shuffle-btn').onclick = () => { if (!busy) { reshuffle(); A.buzz(20); } };
        el.querySelector('.new-btn').onclick = newGame;
        el.querySelector('.help-btn').onclick = showHelp;

        new ResizeObserver(layout).observe(els.area);
        newGame();
        if (!A.store.get('mahjong_seen_help', false)) {
            A.store.set('mahjong_seen_help', true);
            setTimeout(showHelp, 300);
        }
    }

    function showHelp() {
        A.modal({
            icon: '🀄', title: '怎麼玩',
            message: '點兩張一樣的牌。\n如果中間能用「最多轉兩個彎」的線連起來，兩張牌就會消失。\n線可以從牌桌外圍繞過去。\n\n找不到的時候按「💡 提示」。'
        });
    }

    // 依照可用空間算出每張牌多大，整個牌桌剛好塞進畫面，不用捲動
    const GAP = 4, PAD = 38; // 牌間距、牌桌內距＋邊框
    function layout() {
        if (!cols) return;
        const r = els.area.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const byW = (r.width - PAD - (cols - 1) * GAP) / cols;
        const byH = ((r.height - PAD - (rows - 1) * GAP) / rows) * 0.75;
        const tw = Math.max(24, Math.floor(Math.min(byW, byH, 72)));
        els.board.style.setProperty('--tw', tw + 'px');
        els.board.style.gridTemplateColumns = `repeat(${cols}, ${tw}px)`;
    }

    function newGame() {
        const lv = LEVELS[cfg.level];
        rows = lv.rows; cols = lv.cols;
        const pairs = rows * cols / 2;

        // 挑牌：每種牌一對，不夠就再從頭拿
        let kinds = [];
        while (kinds.length < pairs) kinds.push(...A.shuffle(lv.pool));
        kinds = kinds.slice(0, pairs);
        const deck = A.shuffle([...kinds, ...kinds]);

        grid = [];
        for (let r = 0; r < rows; r++) grid.push(deck.slice(r * cols, (r + 1) * cols));
        selected = null; busy = false;

        els.levelBtns.forEach(b => b.classList.toggle('on', b.dataset.level === cfg.level));
        els.board.style.setProperty('--cols', cols);
        layout();
        els.board.innerHTML = '';
        tiles = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                const b = document.createElement('button');
                b.className = 'mj-tile';
                b.addEventListener('click', () => tap(r, c));
                b.addEventListener('animationend', () => b.classList.remove('hinting', 'miss'));
                els.board.append(b);
                row.push(b);
            }
            tiles.push(row);
        }
        if (!findMove()) reshuffle(true);
        paintAll();
        updateStatus();
    }

    function paintAll() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const t = grid[r][c], b = tiles[r][c];
                b.classList.toggle('gone', t === null);
                b.classList.remove('sel', 'hinting');
                if (t !== null) b.innerHTML = faceHTML(t);
                b.setAttribute('aria-label', t === null ? '空' : tileName(t));
            }
        }
    }

    function tileName(t) {
        const n = +t.slice(1);
        if (t[0] === 'm' && n) return NUM[n] + '萬';
        if (t[0] === 'p' && n) return NUM[n] + '筒';
        if (t[0] === 's' && n) return NUM[n] + '條';
        return HONORS[t];
    }

    function remaining() {
        let n = 0;
        for (const row of grid) for (const t of row) if (t !== null) n++;
        return n;
    }

    function updateStatus(extra) {
        els.status.textContent = extra || `🀄 還剩 ${remaining() / 2} 對`;
    }

    /* ---------- 路徑判斷（外圍多一圈空位） ---------- */
    // 座標都用「加外圈」後的座標：牌 (r,c) → (r+1, c+1)
    function isEmpty(r, c) {
        if (r < 0 || c < 0 || r > rows + 1 || c > cols + 1) return false;
        if (r === 0 || c === 0 || r === rows + 1 || c === cols + 1) return true;
        return grid[r - 1][c - 1] === null;
    }

    function straight(r1, c1, r2, c2) {
        if (r1 === r2) {
            for (let c = Math.min(c1, c2) + 1; c < Math.max(c1, c2); c++) if (!isEmpty(r1, c)) return false;
            return true;
        }
        if (c1 === c2) {
            for (let r = Math.min(r1, r2) + 1; r < Math.max(r1, r2); r++) if (!isEmpty(r, c1)) return false;
            return true;
        }
        return false;
    }

    // 回傳路徑（轉折點陣列）或 null
    function findPath(a, b) {
        const [ar, ac] = [a[0] + 1, a[1] + 1];
        const [br, bc] = [b[0] + 1, b[1] + 1];

        if ((ar === br || ac === bc) && straight(ar, ac, br, bc)) return [[ar, ac], [br, bc]];

        for (const [cr, cc] of [[ar, bc], [br, ac]]) {
            if (isEmpty(cr, cc) && straight(ar, ac, cr, cc) && straight(cr, cc, br, bc)) {
                return [[ar, ac], [cr, cc], [br, bc]];
            }
        }

        // 兩個彎：從 A 往四個方向走，每一個空格都試著當第一個轉折點
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let bestPath = null;
        for (const [dr, dc] of dirs) {
            let r = ar + dr, c = ac + dc;
            while (isEmpty(r, c)) {
                const q = dr === 0 ? [br, c] : [r, bc]; // 第二個轉折點
                if (isEmpty(q[0], q[1]) && straight(r, c, q[0], q[1]) && straight(q[0], q[1], br, bc)) {
                    const p = [[ar, ac], [r, c], q, [br, bc]];
                    if (!bestPath || pathLen(p) < pathLen(bestPath)) bestPath = p;
                    break;
                }
                r += dr; c += dc;
            }
        }
        return bestPath;
    }

    function pathLen(p) {
        let s = 0;
        for (let i = 1; i < p.length; i++) s += Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]);
        return s;
    }

    function findMove() {
        const groups = {};
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const t = grid[r][c];
            if (t !== null) (groups[t] = groups[t] || []).push([r, c]);
        }
        for (const list of Object.values(groups)) {
            for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
                if (findPath(list[i], list[j])) return [list[i], list[j]];
            }
        }
        return null;
    }

    /* ---------- 操作 ---------- */
    function tap(r, c) {
        if (busy || grid[r][c] === null) return;
        const b = tiles[r][c];

        if (!selected) { selected = [r, c]; b.classList.add('sel'); A.buzz(8); return; }

        const [sr, sc] = selected;
        const sb = tiles[sr][sc];
        if (sr === r && sc === c) { sb.classList.remove('sel'); selected = null; return; }

        if (grid[sr][sc] !== grid[r][c]) {
            // 不同的牌：改選這一張
            sb.classList.remove('sel');
            selected = [r, c];
            b.classList.add('sel');
            A.buzz(8);
            return;
        }

        const path = findPath(selected, [r, c]);
        if (!path) {
            b.classList.remove('miss'); void b.offsetWidth; b.classList.add('miss');
            updateStatus('這兩張連不起來，換一對試試 🙂');
            A.buzz([20, 30, 20]);
            return;
        }

        // 消除
        busy = true;
        b.classList.add('sel');
        drawLine(path);
        A.buzz(25);
        setTimeout(() => {
            grid[sr][sc] = null;
            grid[r][c] = null;
            sb.classList.add('gone'); sb.classList.remove('sel', 'hinting');
            b.classList.add('gone'); b.classList.remove('sel', 'hinting');
            els.line.setAttribute('points', '');
            selected = null;
            busy = false;
            afterRemove();
        }, 320);
    }

    function afterRemove() {
        if (remaining() === 0) { win(); return; }
        updateStatus();
        if (!findMove()) {
            reshuffle();
            updateStatus('沒有可以連的牌了，已經自動幫你洗牌 🔀');
        }
    }

    // 把剩下的牌重新洗一次（位置不變），保證至少有一步可以走
    function reshuffle(silent) {
        const spots = [], kinds = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== null) { spots.push([r, c]); kinds.push(grid[r][c]); }
        }
        if (!spots.length) return;
        for (let tries = 0; tries < 50; tries++) {
            A.shuffle(kinds).forEach((t, i) => { grid[spots[i][0]][spots[i][1]] = t; });
            if (findMove()) break;
        }
        selected = null;
        if (!silent) { paintAll(); updateStatus(); }
    }

    function hint() {
        if (busy) return;
        const m = findMove();
        if (!m) return;
        els.board.querySelectorAll('.hinting').forEach(t => t.classList.remove('hinting'));
        m.forEach(([r, c]) => {
            const b = tiles[r][c];
            b.classList.remove('hinting'); void b.offsetWidth; b.classList.add('hinting');
        });
    }

    // 把格子座標換成畫面上的點（外圈用邊緣的空白區）
    function pointOf(pr, pc) {
        const wrap = els.wrap.getBoundingClientRect();
        const first = tiles[0][0].getBoundingClientRect();
        const last = tiles[rows - 1][cols - 1].getBoundingClientRect();
        const colX = c => {
            if (c === 0) return (first.left - wrap.left) / 2;
            if (c === cols + 1) return (last.right - wrap.left + wrap.width) / 2;
            const r = tiles[0][c - 1].getBoundingClientRect();
            return r.left - wrap.left + r.width / 2;
        };
        const rowY = r => {
            if (r === 0) return (first.top - wrap.top) / 2;
            if (r === rows + 1) return (last.bottom - wrap.top + wrap.height) / 2;
            const t = tiles[r - 1][0].getBoundingClientRect();
            return t.top - wrap.top + t.height / 2;
        };
        return `${colX(pc).toFixed(1)},${rowY(pr).toFixed(1)}`;
    }

    function drawLine(path) {
        const w = els.wrap.getBoundingClientRect();
        els.svg.setAttribute('viewBox', `0 0 ${w.width} ${w.height}`);
        els.line.setAttribute('points', path.map(([r, c]) => pointOf(r, c)).join(' '));
    }

    async function win() {
        const n = A.store.get('mahjong_cleared', 0) + 1;
        A.store.set('mahjong_cleared', n);
        updateStatus(`🎉 全部消除了！總共過關 ${n} 局`);
        A.buzz([50, 50, 120]);
        const again = await A.modal({
            icon: '🀄', message: '全部消除，太厲害了！',
            buttons: [{ label: '先看看', value: false }, { label: '再來一局', value: true, primary: true }]
        });
        if (again) newGame();
    }

    A.register({
        id: 'mahjong',
        name: '麻將連連看',
        icon: '🀄',
        desc: '找出相同的麻將牌，連線消除',
        tag: '動腦',
        color: '#a855f7',
        mount,
        stat: () => {
            const n = A.store.get('mahjong_cleared', 0);
            return n ? `🎉 過關 ${n} 局` : null;
        }
    });
})();
