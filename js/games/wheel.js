/* ==========================================================================
   🍕 美食輪盤
   ========================================================================== */
(() => {
    const A = Arcade;
    const COLORS = ['#f43f5e', '#f97316', '#eab308', '#10b981', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
    const DEFAULTS = ['🍕 披薩', '🍜 熱湯麵', '🍱 便當', '🍔 漢堡', '🍲 火鍋', '🍣 壽司'];
    const SIZE = 600; // canvas 內部解析度
    const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

    let options = A.store.get('food_options', null) || DEFAULTS.slice();
    let ctx, chipsEl, resultEl, inputEl;
    let angle = 0;
    let spinning = false;

    function save() { A.store.set('food_options', options); }

    function mount(el) {
        el.append(A.h(`
            <div class="panel fit-panel">
                <div class="fit-grow wheel-area">
                    <div class="wheel-wrap">
                        <div class="wheel-pointer"></div>
                        <canvas class="wheel-canvas" width="${SIZE}" height="${SIZE}" aria-label="美食輪盤，點一下旋轉"></canvas>
                    </div>
                </div>
                <div class="wheel-result">🔮 晚餐吃什麼？轉轉看！</div>
                <div class="row" style="flex-wrap:nowrap">
                    <button class="btn btn-big btn-sunset grow spin-btn">🎯 旋轉！</button>
                    <button class="btn edit-btn" style="align-self:stretch">✏️ 改菜單</button>
                </div>
            </div>`));

        const canvas = el.querySelector('canvas');
        ctx = canvas.getContext('2d');
        resultEl = el.querySelector('.wheel-result');
        const wrap = el.querySelector('.wheel-wrap');
        A.fitInto(el.querySelector('.wheel-area'), 1, w => { wrap.style.width = Math.min(w - 12, 420) + 'px'; });

        el.querySelector('.spin-btn').onclick = spin;
        el.querySelector('.edit-btn').onclick = openEditor;
        canvas.onclick = spin;
        draw();
    }

    // 菜單編輯改成對話框，平常畫面比較乾淨
    function openEditor() {
        if (spinning) return;
        const body = A.h(`
            <div class="stack" style="text-align:left">
                <form class="row add-form" style="flex-wrap:nowrap">
                    <input class="input" maxlength="12" placeholder="例如：🧋 珍珠奶茶" enterkeyhint="done">
                    <button class="btn btn-emerald" type="submit">新增</button>
                </form>
                <div class="chips"></div>
            </div>`);
        chipsEl = body.querySelector('.chips');
        inputEl = body.querySelector('.input');
        body.querySelector('.add-form').onsubmit = e => { e.preventDefault(); addOption(); };
        renderChips();
        A.modal({ icon: '✏️', title: '編輯菜單', body, buttons: [{ label: '完成', value: true, primary: true }] });
    }

    function renderChips() {
        chipsEl.innerHTML = '';
        options.forEach((opt, i) => {
            const chip = A.h(`<span class="chip"><span></span><button class="chip-remove" aria-label="移除">✕</button></span>`);
            chip.firstElementChild.textContent = opt;
            chip.querySelector('.chip-remove').onclick = () => removeOption(i);
            chipsEl.append(chip);
        });
    }

    function addOption() {
        const val = inputEl.value.trim();
        if (!val) return;
        options.push(val);
        inputEl.value = '';
        save(); renderChips(); draw();
    }

    function removeOption(i) {
        if (spinning) return;
        if (options.length <= 2) { A.alert('至少需要保留 2 個選項喔！'); return; }
        options.splice(i, 1);
        save(); renderChips(); draw();
    }

    function draw() {
        const c = SIZE / 2;
        const n = options.length;
        const arc = (Math.PI * 2) / n;
        ctx.clearRect(0, 0, SIZE, SIZE);

        ctx.beginPath();
        ctx.arc(c, c, 295, 0, Math.PI * 2);
        ctx.fillStyle = '#1e293b';
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.stroke();

        for (let i = 0; i < n; i++) {
            const a = angle + i * arc;
            ctx.beginPath();
            ctx.moveTo(c, c);
            ctx.arc(c, c, 280, a, a + arc);
            // 避免最後一格跟第一格同色
            let color = COLORS[i % COLORS.length];
            if (i === n - 1 && n % COLORS.length === 1 && n > 1) color = COLORS[3];
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.save();
            ctx.translate(c + Math.cos(a + arc / 2) * 175, c + Math.sin(a + arc / 2) * 175);
            ctx.rotate(a + arc / 2 + Math.PI / 2);
            const fs = n > 10 ? 22 : (n > 6 ? 26 : 30);
            ctx.font = `900 ${fs}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(options[i], 0, 0, 200);
            ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(c, c, 45, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(c, c, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
    }

    function spin() {
        if (spinning || options.length < 2) return;
        spinning = true;
        resultEl.textContent = '🔮 命運旋轉中...';

        const startAngle = angle % (Math.PI * 2);
        const total = Math.PI * 10 + Math.random() * Math.PI * 4;
        const duration = 4000;
        let t0 = null;

        // 以「經過時間」計算角度，任何更新率都一樣快
        function animate(t) {
            if (t0 === null) t0 = t;
            const p = Math.min((t - t0) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3.5);
            angle = startAngle + ease * total;
            draw();
            if (p < 1) requestAnimationFrame(animate);
            else { spinning = false; showResult(); }
        }
        requestAnimationFrame(animate);
    }

    function showResult() {
        const n = options.length;
        const arc = (Math.PI * 2) / n;
        const norm = (1.5 * Math.PI - (angle % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2);
        const idx = Math.floor(norm / arc) % n;
        resultEl.textContent = `🎉 今晚就吃：${options[idx]}！`;
        A.buzz([40, 40, 80]);
    }

    A.register({
        id: 'wheel',
        name: '美食輪盤',
        icon: '🍕',
        desc: '晚餐吃什麼？讓幸運大輪盤替你決定',
        tag: '休閒',
        color: '#f97316',
        mount,
        enter: draw
    });
})();
