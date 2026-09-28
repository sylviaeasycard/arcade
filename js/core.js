/* ==========================================================================
   core.js — 大廳、路由、共用工具
   每個遊戲檔案呼叫 Arcade.register({...}) 註冊自己，格式見 js/games/_template.js
   ========================================================================== */
'use strict';

window.Arcade = (() => {
    const games = [];
    const byId = {};
    let current = null;        // 目前開啟中的遊戲
    let cameFromLobby = false; // 是否從大廳點進來（決定返回鍵要 history.back 還是直接回大廳）
    let pendingFromLobby = false;

    /* ---------- 儲存（localStorage，前綴 arcade_） ---------- */
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem('arcade_' + key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem('arcade_' + key, JSON.stringify(value)); } catch (e) {}
        }
    };

    /* ---------- 小工具 ---------- */
    // 震動回饋（iPhone 不支援，會安靜略過）
    function buzz(pattern) {
        try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
    }

    // 由 HTML 字串建立元素
    function h(html) {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    }

    // 跳脫使用者輸入，避免插入 HTML
    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Fisher–Yates 洗牌（均勻），回傳新陣列
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /* ---------- 對話框 ---------- */
    // buttons: [{label, value, primary}]；value 可以是函式，按下時才計算
    const openModals = new Set();
    function closeAllModals() { [...openModals].forEach(close => close(undefined)); }

    function modal({ icon = '🎮', title = '', message = '', body = null,
                     buttons = [{ label: '確定', value: true, primary: true }] } = {}) {
        return new Promise(resolve => {
            const back = h(`
                <div class="modal-backdrop" role="dialog" aria-modal="true">
                    <div class="modal">
                        <div class="modal-icon"></div>
                        <h3 class="modal-title"></h3>
                        <p class="modal-msg"></p>
                        <div class="modal-body"></div>
                        <div class="modal-actions"></div>
                    </div>
                </div>`);
            const q = s => back.querySelector(s);
            q('.modal-icon').textContent = icon;
            q('.modal-title').textContent = title;
            q('.modal-msg').textContent = message;
            if (!title) q('.modal-title').remove();
            if (!message) q('.modal-msg').remove();
            if (body) q('.modal-body').append(body);

            const close = v => { openModals.delete(close); back.remove(); resolve(v); };
            openModals.add(close);
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = 'btn' + (b.primary ? ' btn-sky' : '');
                btn.textContent = b.label;
                btn.onclick = () => close(typeof b.value === 'function' ? b.value() : b.value);
                q('.modal-actions').append(btn);
            });
            document.body.append(back);
            const primary = back.querySelector('.btn-sky');
            if (primary) primary.focus({ preventScroll: true });
        });
    }
    const alert = (message, icon) => modal({ message, icon });

    function toast(text, onClick) {
        const t = h('<button class="toast"></button>');
        t.textContent = text;
        t.onclick = () => { t.remove(); if (onClick) onClick(); };
        document.body.append(t);
        return t;
    }

    /* ---------- 遊戲迴圈：固定 60 步/秒，跟螢幕更新率無關 ---------- */
    // step() 每 1/60 秒呼叫一次（處理物理），draw() 每個畫面呼叫一次
    function createLoop(step, draw) {
        const STEP = 1000 / 60;
        let id = null, last = 0, acc = 0;

        function frame(t) {
            if (!last) last = t;
            const dt = Math.min(t - last, 100); // 切回來時不要一次補跑太多
            last = t;
            acc += dt;
            while (acc >= STEP && id !== null) {
                step();
                acc -= STEP;
            }
            draw();
            if (id !== null) id = requestAnimationFrame(frame);
        }

        return {
            start() {
                if (id !== null) return;
                last = 0; acc = 0;
                id = requestAnimationFrame(frame);
            },
            stop() {
                if (id !== null) cancelAnimationFrame(id);
                id = null;
            },
            get running() { return id !== null; }
        };
    }

    /* ---------- Canvas：依裝置像素比放大，手機上不糊 ---------- */
    // w, h 是遊戲邏輯座標；回傳已縮放好的 ctx，繪圖時照舊用邏輯座標
    function setupCanvas(canvas, w, h, maxCssWidth = w * 1.3) {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.aspectRatio = `${w} / ${h}`;
        canvas.style.maxWidth = maxCssWidth + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }

    // 把螢幕上的觸控 / 滑鼠座標換算成 canvas 邏輯座標（CSS 縮放後也準）
    function toLocal(canvas, clientX, clientY, w, h) {
        const r = canvas.getBoundingClientRect();
        return { x: (clientX - r.left) * w / r.width, y: (clientY - r.top) * h / r.height };
    }

    /* ---------- 註冊與路由 ---------- */
    function register(game) {
        games.push(game);
        byId[game.id] = game;
    }

    function ensureView(g) {
        if (g._view) return g._view;
        const v = h(`
            <section class="view game-view" id="view-${g.id}">
                <div class="game-bar">
                    <button class="back-btn" aria-label="返回大廳">← 大廳</button>
                    <h2 class="game-title"></h2>
                </div>
                <div class="game-body"></div>
            </section>`);
        v.querySelector('.game-title').textContent = `${g.icon} ${g.name}`;
        v.querySelector('.back-btn').onclick = goLobby;
        document.getElementById('gameViews').append(v);
        g.mount(v.querySelector('.game-body'));
        g._view = v;
        return v;
    }

    function goLobby() {
        if (cameFromLobby) history.back();
        else location.replace('#');
    }

    function route() {
        closeAllModals(); // 切換畫面時收掉還開著的對話框
        const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
        const g = byId[id];
        const target = g && !g.comingSoon ? g : null;

        if (current && current !== target) {
            if (current.leave) current.leave();
            current._view.classList.remove('active');
        }

        document.getElementById('lobby').classList.toggle('active', !target);

        if (target) {
            cameFromLobby = pendingFromLobby;
            pendingFromLobby = false;
            const v = ensureView(target);
            v.classList.add('active');
            if (current !== target) {
                current = target;
                if (target.enter) target.enter();
            }
            document.title = `${target.name}・Arcade`;
        } else {
            current = null;
            cameFromLobby = false;
            renderLobby();
            document.title = '精於勤 • Arcade • 荒於嬉';
        }
        window.scrollTo(0, 0);
    }

    function renderLobby() {
        const grid = document.getElementById('lobbyGrid');
        grid.innerHTML = '';
        games.forEach(g => {
            let stat = null;
            try { stat = g.stat ? g.stat() : null; } catch (e) {}
            const card = h(`
                <button class="game-card${g.comingSoon ? ' soon' : ''}" style="--accent:${g.color || '#38bdf8'}">
                    ${g.comingSoon ? '<span class="badge-soon">施工中</span>' : ''}
                    <span class="card-icon">${g.icon}</span>
                    <span class="card-name">${esc(g.name)}</span>
                    <span class="card-desc">${esc(g.desc || '')}</span>
                    <span class="card-meta">
                        ${g.tag ? `<span class="tag">${esc(g.tag)}</span>` : ''}
                        ${stat ? `<span class="card-stat">${esc(stat)}</span>` : ''}
                    </span>
                </button>`);
            card.onclick = () => {
                if (g.comingSoon) {
                    alert(`「${g.name}」正在施工中，敬請期待！`, g.icon);
                    return;
                }
                pendingFromLobby = true;
                location.hash = g.id;
            };
            grid.append(card);
        });
    }

    /* ---------- 全域事件 ---------- */
    // App 切到背景 → 暫停；切回來 → 通知遊戲（遊戲自己決定是否恢復）
    document.addEventListener('visibilitychange', () => {
        if (!current) return;
        if (document.hidden) { if (current.leave) current.leave(); }
        else if (current.enter) current.enter();
    });

    // 鍵盤只交給目前開啟的遊戲處理
    window.addEventListener('keydown', e => {
        if (!current || !current.onKey) return;
        if (e.target.closest && e.target.closest('input, textarea')) return;
        if (document.querySelector('.modal-backdrop')) return;
        current.onKey(e);
    });

    document.addEventListener('DOMContentLoaded', () => {
        window.addEventListener('hashchange', route);
        route();
    });

    /* ---------- Service Worker ---------- */
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        const hadController = !!navigator.serviceWorker.controller;
        let notified = false;
        // 新版 SW 接手時提示，而不是遊戲玩到一半突然重新整理
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || notified) return;
            notified = true;
            toast('🆕 有新版本，點這裡重新載入', () => location.reload());
        });
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .catch(err => console.warn('Service Worker 註冊失敗：', err));
        });
    }

    return {
        register, store, buzz, h, esc, shuffle,
        modal, alert, toast,
        createLoop, setupCanvas, toLocal,
        get current() { return current; }
    };
})();
