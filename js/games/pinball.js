/* ==========================================================================
   🔮 夜市彈珠台
   物理改用固定步長（每秒 60 步），120Hz 手機上速度也一樣
   ========================================================================== */
(() => {
    const A = Arcade;
    const W = 325, H = 380;
    const OFFSET = 30; // 畫面往上裁掉 30，頂部空白比較少（物理座標不變）
    const TOTAL_BALLS = 5;

    const PEGS = [
        { x: 60, y: 110 }, { x: 110, y: 110 }, { x: 160, y: 110 }, { x: 210, y: 110 },
        { x: 85, y: 150 }, { x: 135, y: 150 }, { x: 185, y: 150 }, { x: 235, y: 150 },
        { x: 60, y: 190 }, { x: 110, y: 190 }, { x: 160, y: 190 }, { x: 210, y: 190 },
        { x: 85, y: 230 }, { x: 135, y: 230 }, { x: 185, y: 230 },
        { x: 60, y: 270 }, { x: 110, y: 270 }, { x: 160, y: 270 }, { x: 210, y: 270 }
    ];
    const SLOTS = [
        { x: 10,  width: 52, score: 50,  label: '50分',  color: '#6366f1' },
        { x: 64,  width: 52, score: 100, label: '100分', color: '#38bdf8' },
        { x: 118, width: 52, score: 300, label: '300分', color: '#f59e0b' },
        { x: 172, width: 52, score: 100, label: '100分', color: '#38bdf8' },
        { x: 226, width: 52, score: 50,  label: '50分',  color: '#6366f1' }
    ];

    let ctx, loop, els = {}, canvasEl, dpr = 1;
    let score = 0, ballsLeft = TOTAL_BALLS, moving = false;
    const ball = { x: 297, y: 360, r: 7, vx: 0, vy: 0 };
    let landed = [];

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="fit-grow pb-area">
                    <div class="canvas-box"><canvas aria-label="彈珠台，點一下發射"></canvas></div>
                </div>
                <div class="stats three compact">
                    <div class="stat"><span class="stat-label">總分</span><span class="stat-value score" style="color:var(--amber)">0</span></div>
                    <div class="stat"><span class="stat-label">剩餘彈珠</span><span class="stat-value balls" style="color:var(--sky)">${TOTAL_BALLS}</span></div>
                    <div class="stat"><span class="stat-label">最高</span><span class="stat-value best" style="color:var(--emerald)">0</span></div>
                </div>
                <div class="row power-row">
                    <span class="label">🚀 力道</span>
                    <input type="range" class="range grow power" min="10" max="100" value="75" aria-label="發射力道">
                    <span class="label power-val" style="color:var(--rose);min-width:3em;text-align:right">75%</span>
                </div>
                <button class="btn btn-big btn-block btn-amber launch-btn">🚀 發射！</button>
            </div>`));

        const canvas = el.querySelector('canvas');
        canvasEl = canvas;
        ctx = A.setupCanvas(canvas, W, H, 420);
        dpr = canvas.width / W;
        loop = A.createLoop(step, draw);

        els.score = el.querySelector('.score');
        els.balls = el.querySelector('.balls');
        els.power = el.querySelector('.power');
        els.powerVal = el.querySelector('.power-val');
        els.launch = el.querySelector('.launch-btn');
        els.best = el.querySelector('.best');
        A.fitInto(el.querySelector('.pb-area'), W / H, (w) => { canvas.style.width = Math.max(160, w - 18) + 'px'; }, 18);

        els.power.oninput = () => { els.powerVal.textContent = els.power.value + '%'; };
        els.launch.onclick = launch;
        canvas.onclick = launch;
        showBest();
        draw();
    }

    function showBest() {
        const b = A.store.get('pinball_best', 0);
        els.best.textContent = b;
    }

    function drawBall(x, y) {
        const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, ball.r);
        g.addColorStop(0, '#e0f2fe');
        g.addColorStop(0.4, '#38bdf8');
        g.addColorStop(1, '#0369a1');
        ctx.beginPath();
        ctx.arc(x, y, ball.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function draw() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#1c1512';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, -OFFSET * dpr);

        // 發射通道
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(275, 80);
        ctx.lineTo(275, 400);
        ctx.stroke();

        // 頂部弧線
        ctx.strokeStyle = 'rgba(255,215,0,0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(160, 90, 155, Math.PI, 0, false);
        ctx.stroke();

        PEGS.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });

        ctx.font = 'bold 11px -apple-system, "PingFang TC", sans-serif';
        ctx.textAlign = 'center';
        SLOTS.forEach(s => {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(s.x, 320, s.width, 80);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(s.x, 320, s.width, 80);
            ctx.fillStyle = s.color;
            ctx.fillText(s.label, s.x + s.width / 2, 385);
        });

        landed.forEach(b => {
            const s = SLOTS[b.slot];
            drawBall(s.x + s.width / 2, 368 - b.stack * 14);
        });

        if (moving) drawBall(ball.x, ball.y);
        else if (ballsLeft > 0) drawBall(297, 360);
    }

    // 每 1/60 秒一步
    function step() {
        if (!moving) return;

        ball.vy += 0.28;
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x - ball.r < 5)   { ball.vx = Math.abs(ball.vx) * 0.8;  ball.x = 5 + ball.r; }
        if (ball.x + ball.r > 315) { ball.vx = -Math.abs(ball.vx) * 0.8; ball.x = 315 - ball.r; }
        if (ball.x + ball.r > 275 && ball.x < 278 && ball.y > 80) {
            ball.vx = -Math.abs(ball.vx) * 0.8;
            ball.x = 275 - ball.r;
        }
        if (ball.y - ball.r < 8 + OFFSET) {
            ball.vy = Math.abs(ball.vy) * 0.5;
            ball.y = 8 + OFFSET + ball.r;
            ball.vx = -(4 + Math.random() * 4);
        }

        PEGS.forEach(p => {
            const dx = ball.x - p.x, dy = ball.y - p.y;
            if (Math.hypot(dx, dy) < ball.r + 4) {
                const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
                const speed = Math.max(Math.hypot(ball.vx, ball.vy) * 0.85, 2.5);
                ball.vx = Math.cos(ang) * speed;
                ball.vy = Math.sin(ang) * speed;
                ball.x = p.x + Math.cos(ang) * (ball.r + 4.5);
                ball.y = p.y + Math.sin(ang) * (ball.r + 4.5);
                A.buzz(5);
            }
        });

        if (ball.y > 325) land();
    }

    function land() {
        let idx = SLOTS.findIndex(s => ball.x >= s.x && ball.x < s.x + s.width);
        if (idx === -1) idx = ball.x > 275 ? 4 : 0;

        score += SLOTS[idx].score;
        els.score.textContent = score;
        landed.push({ slot: idx, stack: landed.filter(b => b.slot === idx).length });
        A.buzz(SLOTS[idx].score >= 300 ? [30, 30, 60] : 20);

        moving = false;
        loop.stop();
        draw();

        if (ballsLeft === 0) {
            const best = A.store.get('pinball_best', 0);
            const isRecord = score > best;
            if (isRecord) A.store.set('pinball_best', score);
            showBest();
            els.launch.textContent = '🔄 再玩一次';
            setTimeout(() => A.alert(
                `本局結束！總得分：${score} 分${isRecord ? '\n🏆 刷新最高紀錄！' : ''}`,
                isRecord ? '🏆' : '🎉'), 200);
        }
    }

    function launch() {
        if (moving) return;

        if (ballsLeft <= 0) {
            score = 0; ballsLeft = TOTAL_BALLS; landed = [];
            els.score.textContent = score;
            els.balls.textContent = ballsLeft;
            els.launch.textContent = '🚀 強力發射！';
            draw();
            return;
        }

        ballsLeft--;
        els.balls.textContent = ballsLeft;

        const power = parseInt(els.power.value, 10);
        Object.assign(ball, { x: 297, y: 350, vx: -0.2, vy: -(18 + power / 100 * 10) });
        A.buzz(30);

        moving = true;
        loop.start();
    }

    A.register({
        id: 'pinball',
        name: '夜市彈珠台',
        icon: '🔮',
        desc: '傳統柏青哥風彈珠台，五顆彈珠拚高分',
        tag: '休閒',
        color: '#f59e0b',
        mount,
        enter() { draw(); if (moving) loop.start(); },
        leave() { loop.stop(); },
        stat: () => {
            const b = A.store.get('pinball_best', 0);
            return b ? `🏆 最高 ${b} 分` : null;
        }
    });
})();
