/* ==========================================================================
   🏓 彈跳對打球
   - 固定步長物理、球速有上限、先得 7 分獲勝
   - 慢速 / 普通 / 快速 三段（慢速時 AI 也比較弱）
   ========================================================================== */
(() => {
    const A = Arcade;
    const W = 300, H = 360;
    const PW = 70, PH = 10;          // 擋板寬高
    const P1_Y = 345, P2_Y = 5;      // 擋板位置（上緣）
    const WIN_SCORE = 7;
    const SPEEDS = {
        slow:   { label: '🐢 慢速', mult: 0.7, ai: 0.05 },
        normal: { label: '🙂 普通', mult: 1.0, ai: 0.085 },
        fast:   { label: '🔥 快速', mult: 1.3, ai: 0.12 }
    };
    const MAX_VY = 8;                // 未乘倍率前的最高縱向速度

    const cfg = Object.assign({ mode: 'AI', speed: 'normal' }, A.store.get('pong_cfg', {}));
    let canvas, ctx, loop, els = {};
    let p1 = 0, p2 = 0, p1X = (W - PW) / 2, p2X = (W - PW) / 2;
    let running = false;
    const ball = { x: W / 2, y: H / 2, vx: 3, vy: 4, r: 6 };

    const saveCfg = () => A.store.set('pong_cfg', cfg);
    const mult = () => SPEEDS[cfg.speed].mult;
    const clampX = x => Math.max(0, Math.min(W - PW, x));

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                    <div class="seg mode-seg">
                        <button data-mode="AI">🤖 人機對戰</button>
                        <button data-mode="PVP">👥 雙人對打</button>
                    </div>
                    <div class="seg speed-seg">
                        ${Object.entries(SPEEDS).map(([k, v]) => `<button data-speed="${k}">${v.label}</button>`).join('')}
                    </div>
                    <div class="fit-grow pong-area">
                        <div class="canvas-box"><canvas class="pong-canvas" aria-label="乒乓球場"></canvas></div>
                    </div>
                    <div class="row" style="flex-wrap:nowrap">
                        <div class="stat grow"><span class="stat-label" style="color:var(--sky)">你（下）</span><span class="stat-value s1" style="color:var(--sky)">0</span></div>
                        <div class="stat grow"><span class="stat-label p2-label" style="color:var(--rose)">AI（上）</span><span class="stat-value s2" style="color:var(--rose)">0</span></div>
                        <button class="btn btn-rose start-btn" style="flex:1.4;align-self:stretch;font-size:1.05rem">🏓 開始</button>
                    </div>
            </div>`));

        canvas = el.querySelector('canvas');
        ctx = A.setupCanvas(canvas, W, H, 420);
        A.fitInto(el.querySelector('.pong-area'), W / H, w => { canvas.style.width = Math.max(160, w - 18) + 'px'; }, 18);
        loop = A.createLoop(step, draw);

        els.s1 = el.querySelector('.s1');
        els.s2 = el.querySelector('.s2');
        els.p2Label = el.querySelector('.p2-label');
        els.start = el.querySelector('.start-btn');
        els.modeBtns = [...el.querySelectorAll('.mode-seg button')];
        els.speedBtns = [...el.querySelectorAll('.speed-seg button')];

        els.modeBtns.forEach(b => b.onclick = () => { cfg.mode = b.dataset.mode; saveCfg(); resetMatch(); });
        els.speedBtns.forEach(b => b.onclick = () => { cfg.speed = b.dataset.speed; saveCfg(); resetMatch(); });
        els.start.onclick = toggle;

        // 觸控：支援多指（雙人模式兩人同時滑）
        const onTouch = e => {
            e.preventDefault();
            for (const t of e.touches) {
                const p = A.toLocal(canvas, t.clientX, t.clientY, W, H);
                if (p.y > H / 2) p1X = clampX(p.x - PW / 2);
                else if (cfg.mode === 'PVP') p2X = clampX(p.x - PW / 2);
            }
            if (!running) draw();
        };
        canvas.addEventListener('touchstart', onTouch, { passive: false });
        canvas.addEventListener('touchmove', onTouch, { passive: false });
        canvas.addEventListener('mousemove', e => {
            p1X = clampX(A.toLocal(canvas, e.clientX, e.clientY, W, H).x - PW / 2);
            if (!running) draw();
        });

        resetMatch();
    }

    function syncUI() {
        els.modeBtns.forEach(b => b.classList.toggle('on', b.dataset.mode === cfg.mode));
        els.speedBtns.forEach(b => b.classList.toggle('on', b.dataset.speed === cfg.speed));
        els.p2Label.textContent = cfg.mode === 'AI' ? 'AI（上）' : '玩家 2（上）';
        els.s1.previousElementSibling.textContent = cfg.mode === 'AI' ? '你（下）' : '玩家 1（下）';
        els.s1.textContent = p1;
        els.s2.textContent = p2;
    }

    function draw() {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(p1X, P1_Y, PW, PH, 5);
        ctx.fill();

        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.roundRect(p2X, P2_Y, PW, PH, 5);
        ctx.fill();

        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();

        if (!running) {
            ctx.fillStyle = 'rgba(148,163,184,0.9)';
            ctx.font = 'bold 14px -apple-system, "PingFang TC", sans-serif';
            ctx.textAlign = 'center';
            const tip = cfg.mode === 'AI' ? '👆 手指在下半部左右滑，控制藍色擋板' : '上下兩人各滑自己那一半';
            ctx.fillText(tip, W / 2, H * 0.75);
            ctx.fillText(`先拿到 ${WIN_SCORE} 分獲勝`, W / 2, H * 0.75 + 22);
        }
    }

    function hitPaddle(paddleX, dir) {
        const hitPos = (ball.x - (paddleX + PW / 2)) / (PW / 2);
        const m = mult();
        ball.vy = dir * Math.min(Math.abs(ball.vy) * 1.03, MAX_VY * m); // 加速但有上限
        ball.vx = hitPos * 5 * m;
        A.buzz(10);
    }

    function step() {
        if (!running) return;
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
        if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }

        if (cfg.mode === 'AI') {
            p2X = clampX(p2X + (ball.x - PW / 2 - p2X) * SPEEDS[cfg.speed].ai);
        }

        const inX = px => ball.x >= px - ball.r * 0.5 && ball.x <= px + PW + ball.r * 0.5;
        const top = P2_Y + PH;

        // 上方擋板：只在「剛穿過擋板面」的那一步判定，不會被球從背後打到
        if (ball.vy < 0 && ball.y - ball.r <= top && ball.y - ball.r > top + ball.vy - 1 && inX(p2X)) {
            ball.y = top + ball.r;
            hitPaddle(p2X, 1);
        }
        // 下方擋板
        if (ball.vy > 0 && ball.y + ball.r >= P1_Y && ball.y + ball.r < P1_Y + ball.vy + 1 && inX(p1X)) {
            ball.y = P1_Y - ball.r;
            hitPaddle(p1X, -1);
        }

        if (ball.y < -ball.r * 2) point(1);
        else if (ball.y > H + ball.r * 2) point(2);
    }

    function point(who) {
        if (who === 1) p1++; else p2++;
        syncUI();
        A.buzz(40);
        if (p1 >= WIN_SCORE || p2 >= WIN_SCORE) { matchOver(); return; }
        serve(who === 1 ? -1 : 1); // 球朝失分方發過去
    }

    function serve(dirY) {
        const m = mult();
        ball.x = W / 2;
        ball.y = H / 2;
        ball.vx = (Math.random() > 0.5 ? 1 : -1) * (2.5 + Math.random() * 2) * m;
        ball.vy = (dirY || (Math.random() > 0.5 ? 1 : -1)) * 3.5 * m;
    }

    function matchOver() {
        pause();
        const p1Won = p1 > p2;
        let msg, icon;
        if (cfg.mode === 'AI') {
            if (p1Won) {
                A.store.set('pong_wins', A.store.get('pong_wins', 0) + 1);
                msg = `你贏了！${p1} : ${p2}`; icon = '🏆';
            } else {
                msg = `AI 獲勝 ${p2} : ${p1}，再接再厲！`; icon = '🤖';
            }
        } else {
            msg = `${p1Won ? '玩家 1' : '玩家 2'} 獲勝！${Math.max(p1, p2)} : ${Math.min(p1, p2)}`; icon = '🏆';
        }
        A.buzz([60, 40, 120]);
        A.alert(msg, icon).then(resetMatch);
    }

    function resetMatch() {
        pause();
        p1 = 0; p2 = 0;
        p1X = p2X = (W - PW) / 2;
        serve();
        syncUI();
        els.start.textContent = '🏓 開始';
        draw();
    }

    function toggle() {
        if (running) {
            pause();
            els.start.textContent = '▶️ 繼續';
        } else {
            running = true;
            loop.start();
            els.start.textContent = '⏸️ 暫停';
        }
    }

    function pause() {
        running = false;
        if (loop) loop.stop();
    }

    A.register({
        id: 'pong',
        name: '彈跳對打球',
        icon: '🏓',
        desc: '人機或雙人對打，先拿 7 分獲勝',
        tag: '反應',
        color: '#f43f5e',
        mount,
        enter: () => draw(),
        leave() {
            if (running) { pause(); els.start.textContent = '▶️ 繼續'; }
        },
        onKey(e) {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                p1X = clampX(p1X + (e.key === 'ArrowLeft' ? -24 : 24));
                if (!running) draw();
            } else if (e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        },
        stat: () => {
            const w = A.store.get('pong_wins', 0);
            return w ? `🏆 贏 AI ${w} 場` : null;
        }
    });
})();
