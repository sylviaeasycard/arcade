/* ==========================================================================
   🔨 夜市打地鼠 — 蒸籠裡冒出包子，點它！
   - 3×3 大洞、每局 60 秒、點空不扣分
   - 普通 / 快速 會混入 🐱 小貓，打到扣 2 分（練判斷）
   - 遊戲時間用固定步長累加，切到背景自動暫停
   ========================================================================== */
(() => {
    const A = Arcade;
    const ROUND_MS = 60000;
    const STEP_MS = 1000 / 60;
    const SPEEDS = {
        slow:   { label: '🐢 慢速', show: 1700, gap: 1100, max: 1, cat: 0 },
        normal: { label: '🙂 普通', show: 1100, gap: 750,  max: 2, cat: 0.15 },
        fast:   { label: '🔥 快速', show: 750,  gap: 500,  max: 3, cat: 0.22 }
    };
    const GOOD = '🥟';
    const BAD = '🐱';

    const cfg = Object.assign({ speed: 'slow' }, A.store.get('whack_cfg', {}));
    let loop, els = {}, holes = [];
    let t = 0, nextSpawn = 0, score = 0, running = false, playing = false;
    let lastSec = -1;

    const saveCfg = () => A.store.set('whack_cfg', cfg);
    const bestKey = () => `whack_best_${cfg.speed}`;
    const lastKey = () => `whack_last_${cfg.speed}`;

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="seg speed-seg">
                    ${Object.entries(SPEEDS).map(([k, v]) => `<button data-speed="${k}">${v.label}</button>`).join('')}
                </div>
                <div class="stats three compact">
                    <div class="stat"><span class="stat-label">分數</span><span class="stat-value score" style="color:var(--amber)">0</span></div>
                    <div class="stat"><span class="stat-label">剩餘秒數</span><span class="stat-value time" style="color:var(--sky)">60</span></div>
                    <div class="stat"><span class="stat-label">最高</span><span class="stat-value best" style="color:var(--emerald)">0</span></div>
                </div>
                <div class="fit-grow whack-area"><div class="whack-board"></div></div>
                <p class="hint whack-hint" style="text-align:center"></p>
                <button class="btn btn-big btn-block btn-sunset start-btn">▶️ 開始</button>
            </div>`));

        els.board = el.querySelector('.whack-board');
        A.fitInto(el.querySelector('.whack-area'), 1, w => {
            const size = Math.min(w, 420);
            els.board.style.width = size + 'px';
            els.board.style.setProperty('--bs', size + 'px');
        });
        els.score = el.querySelector('.score');
        els.time = el.querySelector('.time');
        els.best = el.querySelector('.best');
        els.hint = el.querySelector('.whack-hint');
        els.start = el.querySelector('.start-btn');
        els.speedBtns = [...el.querySelectorAll('.speed-seg button')];

        for (let i = 0; i < 9; i++) {
            const hole = A.h(`<button class="hole" aria-label="第 ${i + 1} 個蒸籠"><span class="pop"></span></button>`);
            const h = { el: hole, pop: hole.firstElementChild, kind: null, until: 0, hitUntil: 0 };
            hole.addEventListener('pointerdown', e => { e.preventDefault(); whack(h); });
            els.board.append(hole);
            holes.push(h);
        }

        els.speedBtns.forEach(b => b.onclick = () => {
            if (playing) return;
            cfg.speed = b.dataset.speed; saveCfg(); reset();
        });
        els.start.onclick = () => {
            if (!playing) startRound();
            else if (running) pause();
            else resume();
        };

        loop = A.createLoop(step, render);
        reset();
    }

    function syncUI() {
        els.speedBtns.forEach(b => {
            b.classList.toggle('on', b.dataset.speed === cfg.speed);
            b.disabled = playing;
            b.style.opacity = playing && b.dataset.speed !== cfg.speed ? 0.4 : 1;
        });
        els.best.textContent = A.store.get(bestKey(), 0);
        els.hint.textContent = SPEEDS[cfg.speed].cat
            ? `點冒出來的 ${GOOD}，小心別打到 ${BAD}（扣 2 分）！`
            : `蒸籠裡冒出 ${GOOD} 就點它！點空不扣分。`;
    }

    function reset() {
        loop && loop.stop();
        playing = false; running = false;
        t = 0; nextSpawn = 400; score = 0; lastSec = -1;
        holes.forEach(h => { h.kind = null; h.hitUntil = 0; });
        els.score.textContent = '0';
        els.time.textContent = ROUND_MS / 1000;
        els.start.textContent = '▶️ 開始';
        syncUI();
        render();
    }

    function startRound() {
        reset();
        playing = true;
        syncUI();
        resume();
    }

    function resume() {
        running = true;
        els.start.textContent = '⏸️ 暫停';
        loop.start();
    }

    function pause() {
        if (!running) return;
        running = false;
        loop.stop();
        els.start.textContent = '▶️ 繼續';
    }

    // 每 1/60 秒一步（遊戲時間 t 只在進行中累加）
    function step() {
        if (!running) return;
        t += STEP_MS;
        const sp = SPEEDS[cfg.speed];

        holes.forEach(h => { if (h.kind && t >= h.until) h.kind = null; });

        if (t >= nextSpawn) {
            const up = holes.filter(h => h.kind).length;
            const free = holes.filter(h => !h.kind && t >= h.hitUntil);
            if (up < sp.max && free.length) {
                const h = free[Math.floor(Math.random() * free.length)];
                h.kind = Math.random() < sp.cat ? 'bad' : 'good';
                // 越到後面稍微快一點點
                const speedUp = 1 - 0.2 * (t / ROUND_MS);
                h.until = t + sp.show * speedUp;
            }
            nextSpawn = t + sp.gap * (0.7 + Math.random() * 0.6);
        }

        if (t >= ROUND_MS) endRound();
    }

    function render() {
        holes.forEach(h => {
            const hit = t < h.hitUntil;
            h.el.classList.toggle('up', !!h.kind || hit);
            h.el.classList.toggle('hit', hit);
            const face = hit ? h.hitFace : h.kind === 'bad' ? BAD : h.kind === 'good' ? GOOD : '';
            // 縮回去時保留原本的圖案，動畫才不會突然消失
            if (face && h.pop.textContent !== face) h.pop.textContent = face;
        });
        const sec = Math.max(0, Math.ceil((ROUND_MS - t) / 1000));
        if (sec !== lastSec) { els.time.textContent = sec; lastSec = sec; }
    }

    function whack(h) {
        if (!running || !h.kind) return;
        if (h.kind === 'good') {
            score += 1;
            h.hitFace = '💥';
            A.buzz(15);
        } else {
            score = Math.max(0, score - 2);
            h.hitFace = '😾';
            A.buzz([60, 40, 60]);
        }
        h.kind = null;
        h.hitUntil = t + 280;
        els.score.textContent = score;
        render();
    }

    function endRound() {
        running = false;
        playing = false;
        loop.stop();
        holes.forEach(h => { h.kind = null; h.hitUntil = 0; });
        render();

        const best = A.store.get(bestKey(), 0);
        const last = A.store.get(lastKey(), null);
        A.store.set(lastKey(), score);
        if (score > best) A.store.set(bestKey(), score);

        let msg = `時間到！這局打到 ${score} 分`;
        if (score > best && best > 0) msg += '\n🏆 刷新最高紀錄！';
        else if (last !== null && score > last) msg += `\n👍 比上一局進步 ${score - last} 分！`;
        else if (last !== null && score === last) msg += '\n跟上一局一樣，穩定發揮！';
        else if (last !== null) msg += '\n再來一局，一定可以更好！';

        els.start.textContent = '🔄 再玩一局';
        syncUI();
        A.buzz([50, 50, 120]);
        A.alert(msg, score > best ? '🏆' : '🥟');
    }

    A.register({
        id: 'whack',
        name: '打地鼠',
        icon: '🔨',
        desc: '蒸籠裡冒出包子，快點打下去！',
        tag: '反應',
        color: '#eab308',
        mount,
        enter: render,
        leave: pause,
        stat: () => {
            const b = Math.max(...Object.keys(SPEEDS).map(k => A.store.get(`whack_best_${k}`, 0)));
            return b ? `🏆 最高 ${b} 分` : null;
        }
    });
})();
