/* ==========================================================================
   🔮 夜市彈珠台
   物理改用固定步長（每秒 60 步），120Hz 手機上速度也一樣
   ========================================================================== */
(() => {
    const A = Arcade;
    const W = 325, H = 380;
    const OFFSET = 30; // 畫面往上裁掉 30，頂部空白比較少（物理座標不變）
    const TOTAL_BALLS = 5;
    // 頂部圓弧軌道：彈珠從右邊發射通道衝上來，沿著圓弧滑過頂端，在左上方離開軌道落進釘陣
    const ARC = { x: 160, y: 195, r: 155 };
    const RAIL_END_X = 90;   // 軌道在左上方結束的位置（彈珠中心 x）
    const LANE_TOP = 115;    // 發射通道隔板的上緣
    // 拉桿：在台子下半部往下拉，放開發射
    const IDLE_Y = 350;      // 彈珠待發位置
    const PULL_PX = 40;      // 拉到底時彈珠往下移多少
    const PULL_FULL = 110;   // 手指往下拉多少（邏輯座標）算 100%
    const MIN_PULL = 0.08;   // 拉太少就放開 → 不發射（避免誤觸）

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
    let pull = 0, dragging = false, dragStartY = 0, lastPower = A.store.get('pinball_last_power', 60);

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="fit-grow pb-area">
                    <div class="canvas-box"><canvas class="pb-canvas" aria-label="彈珠台，在下半部往下拉再放開就發射"></canvas></div>
                </div>
                <div class="stats three compact">
                    <div class="stat"><span class="stat-label">總分</span><span class="stat-value score" style="color:var(--amber)">0</span></div>
                    <div class="stat"><span class="stat-label">剩餘彈珠</span><span class="stat-value balls" style="color:var(--sky)">${TOTAL_BALLS}</span></div>
                    <div class="stat"><span class="stat-label">最高</span><span class="stat-value best" style="color:var(--emerald)">0</span></div>
                </div>
                <div class="row" style="flex-wrap:nowrap">
                    <div class="pb-tip grow">👇 <b>往下拉</b>，放開發射</div>
                    <button class="btn launch-btn" style="flex:none">🚀 發射</button>
                </div>
            </div>`));

        const canvas = el.querySelector('canvas');
        canvasEl = canvas;
        ctx = A.setupCanvas(canvas, W, H, 420);
        dpr = canvas.width / W;
        loop = A.createLoop(step, draw);

        els.score = el.querySelector('.score');
        els.balls = el.querySelector('.balls');
        els.launch = el.querySelector('.launch-btn');
        els.best = el.querySelector('.best');
        A.fitInto(el.querySelector('.pb-area'), W / H, (w) => { canvas.style.width = Math.max(160, w - 18) + 'px'; }, 18);

        els.launch.onclick = () => launch(lastPower); // 備用：用上一次的力道發射
        bindPull(canvas);
        syncButton();
        showBest();
        draw();
    }

    /* ---------- 拉桿操作 ---------- */
    const powerOf = p => Math.round(10 + p * 90); // 拉 0~100% → 力道 10~100

    function bindPull(canvas) {
        const localY = e => A.toLocal(canvas, e.clientX, e.clientY, W, H).y;
        let lastStep = 0;

        canvas.addEventListener('pointerdown', e => {
            if (moving || ballsLeft <= 0) return;
            if (localY(e) < H * 0.45) return; // 只有下半部可以拉
            dragging = true;
            dragStartY = localY(e);
            pull = 0; lastStep = 0;
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            draw();
        });
        canvas.addEventListener('pointermove', e => {
            if (!dragging) return;
            pull = Math.max(0, Math.min(1, (localY(e) - dragStartY) / PULL_FULL));
            const stepN = Math.floor(pull * 4); // 每拉 25% 震一下（Android）
            if (stepN !== lastStep) { lastStep = stepN; A.buzz(6); }
            draw();
        });
        const release = () => {
            if (!dragging) return;
            dragging = false;
            const p = pull;
            pull = 0;
            if (p >= MIN_PULL) {
                lastPower = powerOf(p);
                A.store.set('pinball_last_power', lastPower);
                launch(lastPower, p);
            } else draw();
        };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
    }

    function syncButton() {
        els.launch.textContent = ballsLeft <= 0 ? '🔄 再玩一次' : `🚀 發射 ${lastPower}%`;
    }

    // 畫發射通道裡的彈簧和把手
    function drawPlunger(ballY) {
        const x = 297, top = ballY + ball.r + 2, bottom = 408;
        // 推板
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(x - 10, top, 20, 4);
        // 彈簧（鋸齒線，越拉越密）
        const coils = 7, len = bottom - (top + 4);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, top + 4);
        for (let i = 1; i <= coils * 2; i++) {
            ctx.lineTo(x + (i % 2 ? 7 : -7), top + 4 + len * i / (coils * 2));
        }
        ctx.stroke();
    }

    // 拉的時候在台子中間顯示力道
    function drawPowerMeter() {
        const pw = powerOf(pull);
        const x = 40, y = 286, w = 200, h = 26;
        ctx.fillStyle = 'rgba(2,6,23,0.85)';
        ctx.beginPath(); ctx.roundRect(x - 6, y - 24, w + 12, h + 32, 10); ctx.fill();
        ctx.fillStyle = '#334155';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
        const hue = 130 - pull * 130; // 綠 → 紅
        ctx.fillStyle = `hsl(${hue}, 85%, 50%)`;
        ctx.beginPath(); ctx.roundRect(x, y, Math.max(8, w * pull), h, 8); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px -apple-system, "PingFang TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pull < MIN_PULL ? '往下拉…' : `力道 ${pw}%`, x + w / 2, y - 6);
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

        // 發射通道隔板
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(275, LANE_TOP);
        ctx.lineTo(275, 400);
        ctx.stroke();

        // 頂部圓弧軌道（從右邊一路彎到左上方）
        const endAng = 2 * Math.PI - Math.acos((RAIL_END_X - ARC.x) / (ARC.r - ball.r));
        ctx.strokeStyle = '#d4a017';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ARC.x, ARC.y, ARC.r, endAng, 2 * Math.PI, false);
        ctx.lineTo(ARC.x + ARC.r, 400);
        ctx.stroke();
        // 軌道盡頭的小擋點
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(ARC.x + ARC.r * Math.cos(endAng), ARC.y + ARC.r * Math.sin(endAng), 4, 0, Math.PI * 2);
        ctx.fill();

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

        if (moving) {
            drawBall(ball.x, ball.y);
            drawPlunger(IDLE_Y);
        } else if (ballsLeft > 0) {
            const y = IDLE_Y + pull * PULL_PX;
            drawBall(297, y);
            drawPlunger(y);
        } else {
            drawPlunger(IDLE_Y);
        }
        if (dragging) drawPowerMeter();
    }

    // 每 1/60 秒一步
    function step() {
        if (!moving) return;

        ball.vy += 0.28;
        ball.x += ball.vx;
        ball.y += ball.vy;

        if (ball.x - ball.r < 5)   { ball.vx = Math.abs(ball.vx) * 0.8;  ball.x = 5 + ball.r; }
        if (ball.x + ball.r > 315) { ball.vx = -Math.abs(ball.vx) * 0.8; ball.x = 315 - ball.r; }
        if (ball.x + ball.r > 275 && ball.x < 278 && ball.y > LANE_TOP) {
            ball.vx = -Math.abs(ball.vx) * 0.8;
            ball.x = 275 - ball.r;
        }

        // 圓弧軌道：彈珠碰到弧線就沿著它滑（去掉往外的速度，保留沿著軌道的速度）
        if (ball.y < ARC.y && ball.x > RAIL_END_X) {
            const dx = ball.x - ARC.x, dy = ball.y - ARC.y;
            const d = Math.hypot(dx, dy), lim = ARC.r - ball.r;
            if (d > lim) {
                const nx = dx / d, ny = dy / d;
                ball.x = ARC.x + nx * lim;
                ball.y = ARC.y + ny * lim;
                const vn = ball.vx * nx + ball.vy * ny;
                if (vn > 0) { ball.vx -= 1.3 * vn * nx; ball.vy -= 1.3 * vn * ny; }
            }
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

        if (ball.y > 325 && ball.vy > 0) land(); // 往下掉時才算落袋（修正：力道小時一發射就直接算分）
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
            syncButton();
            setTimeout(() => A.alert(
                `本局結束！總得分：${score} 分${isRecord ? '\n🏆 刷新最高紀錄！' : ''}`,
                isRecord ? '🏆' : '🎉'), 200);
        }
    }

    // power：10~100；fromPull：拉桿放開時彈珠的位置（0~1）
    function launch(power, fromPull = 0) {
        if (moving) return;

        if (ballsLeft <= 0) {
            score = 0; ballsLeft = TOTAL_BALLS; landed = [];
            els.score.textContent = score;
            els.balls.textContent = ballsLeft;
            syncButton();
            draw();
            return;
        }

        ballsLeft--;
        els.balls.textContent = ballsLeft;

        // 每次發射力道有 ±3% 的小誤差，跟真的彈珠台一樣
        const jitter = 1 + (Math.random() - 0.5) * 0.06;
        Object.assign(ball, { x: 297, y: IDLE_Y + fromPull * PULL_PX, vx: -0.2, vy: -(14 + power / 100 * 12) * jitter });
        A.buzz(30);

        moving = true;
        syncButton();
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
        leave() { loop.stop(); dragging = false; pull = 0; },
        stat: () => {
            const b = A.store.get('pinball_best', 0);
            return b ? `🏆 最高 ${b} 分` : null;
        }
    });
})();
