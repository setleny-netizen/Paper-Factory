'use strict';

/**
 * FabrikaApp — главный модуль игры.
 * Стейт + роутинг + рендер + действия.
 */
(() => {

  const UI   = window.FabrikaUI;
  const Load = window.FabrikaLoading;
  const tg   = window.Telegram?.WebApp;

  // ═══════════════════════════════════════════════
  //  ЭЛЕМЕНТЫ
  // ═══════════════════════════════════════════════
  const main     = document.querySelector('#main');
  const nav      = document.querySelector('#navigation');
  const dialog   = document.querySelector('#dialog');
  const dlgBody  = document.querySelector('#dialog-content');
  const notice   = document.querySelector('#notice');
  const wallet   = document.querySelector('#wallet');
  const walletEl = document.querySelector('[data-wallet-balance]');

  // ═══════════════════════════════════════════════
  //  СОСТОЯНИЕ
  // ═══════════════════════════════════════════════
  let S = null;             // стейт с сервера
  let token = '';           // токен сессии
  let page = 'farm';        // текущая вкладка
  let busy = false;         // идёт ли операция
  let pending = null;       // незавершённая операция (для retry)
  let noticeTimer = null;
  let snapshotAt = Date.now();
  let selectedRack = null;
  let deviceId = '';

  // deviceId (для мультиаккаунт-детекта)
  try {
    deviceId = localStorage.getItem('fabrika-device') || crypto.randomUUID();
    localStorage.setItem('fabrika-device', deviceId);
  } catch {
    deviceId = crypto.randomUUID();
  }

  // ═══════════════════════════════════════════════
  //  TELEGRAM
  // ═══════════════════════════════════════════════
  tg?.ready();
  tg?.expand();
  tg?.setHeaderColor?.('#141a20');
  tg?.setBackgroundColor?.('#141a20');

  // ═══════════════════════════════════════════════
  //  API-ЗАПРОСЫ
  // ═══════════════════════════════════════════════
  async function request(body) {
    const response = await fetch('api.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ ...body, device_id: deviceId }),
      signal: AbortSignal.timeout(20000),
    });

    let r;
    try { r = await response.json(); }
    catch { throw Error('Сервер не ответил. Попробуй ещё раз.'); }

    if (!response.ok || !r.ok) {
      const e = Error(r.message || 'Не удалось выполнить действие.');
      e.definitive = response.status >= 400 && response.status < 500;
      throw e;
    }
    return r;
  }

  /**
   * Действие с защитой от двойного клика и повторов.
   */
  async function act(op, data = {}) {
    if (busy) return;

    // Если уже есть незавершённая операция с другими параметрами — блокируем
    if (pending && (pending.op !== op || JSON.stringify(pending.data) !== JSON.stringify(data))) {
      toast('Сначала дождись завершения предыдущей операции.');
      return;
    }

    pending ??= { op, data, request_id: crypto.randomUUID() };
    busy = true;
    document.body.classList.add('is-busy');

    try {
      const r = await request(pending);
      pending = null;
      S = r.state;
      snapshotAt = Date.now();
      dialog.close();
      render();
      toast(r.message || 'Готово');
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch (e) {
      toast(e.message);
      if (e.definitive) pending = null;
    } finally {
      busy = false;
      document.body.classList.remove('is-busy');
    }
  }

  // ═══════════════════════════════════════════════
  //  УТИЛИТЫ
  // ═══════════════════════════════════════════════
  function toast(msg) {
    if (!notice) return;
    notice.textContent = msg;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.hidden = true, 4500);
  }

  function openDialog(html) {
    if (!dialog || !dlgBody) return;
    dlgBody.innerHTML = html;
    if (!dialog.open) dialog.showModal();
  }

  function heading(title, subtitle, action = '') {
    return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }

  function stat(name, value, unit = '') {
    return `<div><dt>${name}</dt><dd>${value}${unit ? ` <small>${unit}</small>` : ''}</dd></div>`;
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: НАВИГАЦИЯ
  // ═══════════════════════════════════════════════
  const TABS = [
    ['farm',    'Фабрика'],
    ['shop',    'Магазин'],
    ['income',  'Аналитика'],
    ['top',     'Топ'],
    ['profile', 'Профиль'],
  ];

  function renderNav() {
    if (!nav) return;
    nav.innerHTML = TABS.map(([id, label]) =>
      `<button data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>
         ${UI.icon(id)}<span>${label}</span>
       </button>`
    ).join('');
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: ФАБРИКА
  // ═══════════════════════════════════════════════
  function farmView() {
    const m = S.metrics, f = S.farm;
    const warn =
      m.status === 'overload' ? 'Потребление выше лимита. Улучши электросеть или выключи часть станков.' :
      m.status === 'noraw'    ? 'Закончилось сырьё. Пополни запас, чтобы продолжить производство.' : '';

    return `
      <div class="page-heading">
        <div><h1>Фабрика</h1><p>${f.machines.length ? 'Станки на месте. Производство идёт.' : 'Установи первый станок, чтобы начать.'}</p></div>
        <span class="status ${UI.status[m.status]?.[1] || 'muted'}">
          <i></i>${UI.status[m.status]?.[0] || '—'}
        </span>
      </div>

      <div class="farm-grid">
        <section class="card">
          <h2>Готово к сбору</h2>
          <p class="big-number">${UI.short(f.pending)} <small>🧻</small></p>
          <div class="rate-line"><span>В час</span><b>+${UI.short(m.hourly)} 🧻</b></div>
          <div class="rate-line"><span>В сутки</span><b>+${UI.short(m.hourly * 24)} 🧻</b></div>
          <button class="button primary full" data-action="collect" ${f.pending < 1 ? 'disabled' : ''}>
            ${UI.icon('down')} Собрать рулоны
          </button>
        </section>

        <section class="card">
          <h2>Сырьё и питание</h2>
          <div class="rate-line"><span>Сырьё</span><b>${UI.short(f.raw)} кг</b></div>
          <div class="rate-line"><span>Хватит на</span><b>${m.raw_seconds ? UI.duration(m.raw_seconds) : '—'}</b></div>
          <div class="progress ${m.watts > m.capacity ? 'overloaded' : ''}">
            <span style="width:${Math.min(100, m.watts / m.capacity * 100)}%"></span>
          </div>
          <div class="rate-line"><span>Питание</span><b>${m.watts} / ${m.capacity} кВт</b></div>
          ${warn ? `<p class="warning-text">${UI.icon('warn')} ${warn}</p>` : ''}
          <button class="button secondary full" data-page="shop">Управлять сырьём</button>
        </section>
      </div>

      ${warehouseView()}
      ${racksView()}
    `;
  }

  function warehouseView() {
    const items = S.farm.machines.filter(m => !m.rack);
    if (!items.length) return '';
    return `
      <section class="card">
        <h2>Склад (${items.length})</h2>
        <div class="warehouse-list">
          ${items.map(m => `
            <button class="warehouse-item" data-machine="${UI.esc(m.id)}">
              <img src="icons/${modelFile(m.model)}" width="48" height="36" alt="">
              <span>${UI.esc(S.catalog.machines[m.model].name)}</span>
            </button>`).join('')}
        </div>
      </section>`;
  }

  function racksView() {
    if (!S.farm.racks.length) return '';
    if (!S.farm.racks.some(r => r.id === selectedRack)) selectedRack = S.farm.racks[0].id;
    const rack = S.farm.racks.find(r => r.id === selectedRack);
    const cards = S.farm.machines.filter(m => m.rack === rack.id);

    return `
      <section class="card">
        <div class="section-line">
          <h2>Стеллажи</h2>
          <span>${S.farm.racks.length} / ${S.catalog.max_racks}</span>
        </div>
        <div class="rack-tabs">
          ${S.farm.racks.map((r, i) => {
            const cnt = S.farm.machines.filter(m => m.rack === r.id).length;
            return `<button data-rack="${UI.esc(r.id)}" ${r.id === selectedRack ? 'aria-pressed="true"' : ''}>
              №${i + 1} · ${cnt}/${r.slots}
            </button>`;
          }).join('')}
          ${S.farm.racks.length < S.catalog.max_racks
            ? `<button data-buy-rack>${UI.icon('plus')} Стеллаж</button>` : ''}
        </div>
        <div class="rack-slots">
          ${Array.from({ length: rack.slots }, (_, slot) => {
            const m = cards.find(x => x.slot === slot);
            if (m) {
              const model = S.catalog.machines[m.model];
              return `<button class="rack-slot" data-machine="${UI.esc(m.id)}">
                <img src="icons/${modelFile(m.model)}" alt="">
                <strong>${UI.esc(model.name)}</strong>
                <small>${m.enabled ? 'Вкл' : 'Выкл'}</small>
              </button>`;
            }
            return `<button class="rack-slot vacant" data-page="shop">${UI.icon('plus')}<small>Свободно</small></button>`;
          }).join('')}
        </div>
      </section>`;
  }

  function modelFile(modelKey) {
    const map = {
      'papyrus-p100': 'papyrus-p100.svg',
      'papyrus-p500': 'papyrus-p500.svg',
      'cellumax-c1500': 'cellumax-c1500.svg',
      'cellumax-c3000': 'cellumax-c3000.svg',
      'fibergiant-f6000': 'fibergiant-f6000.svg',
      'titan-tpx': 'titan-tpx.svg',
    };
    return map[modelKey] || 'papyrus-p100.svg';
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: МАГАЗИН
  // ═══════════════════════════════════════════════
  let shopTab = 'machines';

  function shopView() {
    return heading('Магазин', 'Оборудование, сырьё и электросеть') + `
      <div class="shop-tabs">
        ${[['machines','Станки'],['racks','Стеллажи'],['raw','Сырьё'],['power','Электросеть']]
          .map(([id, label]) => `<button data-shop-tab="${id}" ${shopTab === id ? 'aria-selected="true"' : ''}>${label}</button>`).join('')}
      </div>
      <div>${shopTab === 'machines' ? machinesShop()
             : shopTab === 'racks'   ? racksShop()
             : shopTab === 'raw'     ? rawShop()
             :                         powerShop()}</div>
    `;
  }

  function machinesShop() {
    return `<div class="product-grid">${Object.entries(S.catalog.machines).map(([key, m]) => `
      <article class="product">
        <div class="product-art"><img src="icons/${modelFile(key)}" alt=""></div>
        <div class="product-body">
          <div class="product-name"><h2>${UI.esc(m.name)}</h2><span>${UI.esc(m.class)}</span></div>
          <dl class="product-specs">
            ${stat('Производство / час', UI.short(m.hourly), '🧻')}
            ${stat('Производство / сутки', UI.short(m.hourly * 24), '🧻')}
            ${stat('Потребление', m.watts, 'кВт')}
          </dl>
          <button class="button primary full" data-buy-machine="${key}"
                  ${S.player.balance < m.price ? 'disabled' : ''}>
            ${UI.short(m.price)} 🧻 · Купить
          </button>
        </div>
      </article>`).join('')}</div>`;
  }

  function racksShop() {
    return `<div class="product-grid">${Object.entries(S.catalog.racks).map(([slots, r]) => `
      <article class="product">
        <div class="product-art"><img src="assets/rack.svg" alt=""></div>
        <div class="product-body">
          <div class="product-name"><h2>${UI.esc(r.name)}</h2><span>${slots} мест</span></div>
          <button class="button primary full" data-buy-rack="${slots}"
                  ${S.player.balance < r.price || S.farm.racks.length >= S.catalog.max_racks ? 'disabled' : ''}>
            ${UI.short(r.price)} 🧻 · Купить
          </button>
        </div>
      </article>`).join('')}</div>`;
  }

  function rawShop() {
    return `
      <div class="card">
        <h2>Запас сырья</h2>
        <p>Сейчас: <b>${UI.short(S.farm.raw)} кг</b>. Цена — 2 🧻 за кг. 1 кг = 10 рулонов.</p>
        <div class="raw-packages">
          ${[100, 1000, 10000, 100000].map(kg => `
            <button class="button secondary" data-buy-raw="${kg}">
              +${UI.n(kg)} кг · ${UI.n(kg * 2)} 🧻
            </button>`).join('')}
        </div>
      </div>`;
  }

  function powerShop() {
    const next = S.catalog.power[S.farm.power_level + 1];
    return `
      <div class="card">
        <h2>Электросеть</h2>
        <p>Текущая мощность: <b>${UI.n(S.catalog.power[S.farm.power_level].watts)} кВт</b></p>
        <div class="power-ladder">
          ${S.catalog.power.map((p, i) => `
            <div class="${i === S.farm.power_level ? 'current' : i < S.farm.power_level ? 'complete' : ''}">
              <span>${i <= S.farm.power_level ? UI.icon('check') : UI.icon('power2')}</span>
              <b>${UI.n(p.watts)} кВт</b>
              <small>${i === S.farm.power_level ? 'Текущая' : i < S.farm.power_level ? 'Открыта' : UI.short(p.price) + ' 🧻'}</small>
            </div>`).join('')}
        </div>
        ${next
          ? `<button class="button primary full" data-upgrade-power>Улучшить за ${UI.short(next.price)} 🧻</button>`
          : `<p class="success-text">Максимальная мощность открыта.</p>`}
      </div>`;
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: АНАЛИТИКА
  // ═══════════════════════════════════════════════
  function incomeView() {
    const m = S.metrics;
    return heading('Аналитика', 'Производство и история') + `
      <section class="card">
        <h2>Производство</h2>
        <dl class="stats-grid">
          ${stat('В час', UI.short(m.hourly), '🧻')}
          ${stat('В сутки', UI.short(m.hourly * 24), '🧻')}
        </dl>
      </section>
      <section class="card">
        <h2>История операций</h2>
        ${S.history?.length
          ? S.history.map(h => `
            <div class="history-row">
              <strong>${UI.esc(h.note)}</strong>
              <b class="${h.amount > 0 ? 'positive' : ''}">${h.amount > 0 ? '+' : ''}${UI.short(h.amount)} 🧻</b>
            </div>`).join('')
          : '<p>История пока пуста.</p>'}
      </section>`;
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: ТОП
  // ═══════════════════════════════════════════════
  let topData = null;

  function topView() {
    if (!topData) return heading('Топ', 'Загружаем…') + '<p>Подожди…</p>';
    return heading('Топ фабрик', 'Самые производительные') + `
      <div class="card">
        ${topData.players.map((p, i) => `
          <div class="top-row ${p.id === S.player.id ? 'is-mine' : ''}">
            <span class="top-place">${i + 1}</span>
            ${UI.avatar(p)}
            <div class="top-info">
              <strong>${UI.esc(p.name)}</strong>
              <small>${UI.short(p.hourly)} 🧻 / час</small>
            </div>
            <b>${UI.short(p.hourly * 24)} 🧻 / сут</b>
          </div>`).join('')}
      </div>`;
  }

  async function loadTop() {
    try {
      const r = await request({ op: 'leaderboard' });
      topData = r.leaderboard;
      render();
    } catch (e) { toast(e.message); }
  }

  // ═══════════════════════════════════════════════
  //  РЕНДЕР: ПРОФИЛЬ
  // ═══════════════════════════════════════════════
  function profileView() {
    const f = S.farm;
    const level = 1 + Math.floor(f.runtime / 86400);
    return heading('Профиль', 'Твоя история производства') + `
      <section class="card profile-card">
        ${UI.avatar(S.player)}
        <div>
          <h2>${UI.esc(S.player.name)}</h2>
          <p>${S.player.username ? '@' + UI.esc(S.player.username) : 'Игрок #' + S.player.id}</p>
          <span class="badge">Уровень ${level}</span>
        </div>
      </section>

      <section class="card">
        <h2>Баланс</h2>
        <p class="big-number">${UI.n(S.player.balance)} <small>🧻</small></p>
        <div class="row-2">
          <button class="button primary" data-action="deposit" disabled>Пополнить</button>
          <button class="button secondary" data-action="withdraw" disabled>Вывести</button>
        </div>
        <p class="hint">Пополнение и вывод через Paper Scroll — скоро.</p>
      </section>

      <section class="card">
        <h2>Промокод</h2>
        <div class="row-2">
          <input type="text" id="promo-input" placeholder="Введи код" maxlength="32">
          <button class="button primary" data-action="promo">Активировать</button>
        </div>
      </section>

      <section class="card">
        <h2>Статистика</h2>
        <dl class="stats-grid">
          ${stat('Всего произведено', UI.short(f.produced_total), '🧻')}
          ${stat('Станков', f.machines.length)}
          ${stat('Стеллажей', f.racks.length)}
          ${stat('Время работы', UI.duration(f.runtime))}
        </dl>
      </section>`;
  }

  // ═══════════════════════════════════════════════
  //  ГЛАВНЫЙ РЕНДЕР
  // ═══════════════════════════════════════════════
  function render() {
    if (!S) return;

    main.innerHTML = ({
      farm:    farmView,
      shop:    shopView,
      income:  incomeView,
      top:     topView,
      profile: profileView,
    }[page])();

    renderNav();

    if (wallet && walletEl) {
      wallet.disabled = false;
      walletEl.textContent = UI.n(S.player.balance);
    }
  }

  // ═══════════════════════════════════════════════
  //  ДЕЙСТВИЯ
  // ═══════════════════════════════════════════════
  async function doAction(op, data) {
    if (op === 'collect')           return act('collect');
    if (op === 'buy_rack')          return act('buy_rack', { slots: data });
    if (op === 'buy_machine')       return confirmBuy('machine', data);
    if (op === 'buy_raw')           return act('buy_raw', { kg: data });
    if (op === 'upgrade_power')     return act('upgrade_power');
    if (op === 'promo')             return promoRedeem();
  }

  function confirmBuy(kind, key) {
    const item = kind === 'machine' ? S.catalog.machines[key] : S.catalog.racks[key];
    if (!item) return;
    openDialog(`
      <h2>Купить «${UI.esc(item.name)}»?</h2>
      <p>Спишется <b>${UI.n(item.price)} 🧻</b>.</p>
      <button class="button primary full" data-confirm="buy_${kind}" data-key="${UI.esc(key)}">
        Подтвердить
      </button>
    `);
  }

  function promoRedeem() {
    const input = document.querySelector('#promo-input');
    if (!input) return;
    const code = input.value.trim();
    if (code.length < 3) return toast('Слишком короткий код.');
    act('promo_redeem', { code });
  }

  // ═══════════════════════════════════════════════
  //  ОБРАБОТКА КЛИКОВ (делегирование)
  // ═══════════════════════════════════════════════
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a');
    if (!el) return;

    // Навигация
    if (el.dataset.page) { page = el.dataset.page; render(); if (page === 'top') loadTop(); return; }

    // Вкладки магазина
    if (el.dataset.shopTab) { shopTab = el.dataset.shopTab; render(); return; }

    // Выбор стеллажа
    if (el.dataset.rack) { selectedRack = el.dataset.rack; render(); return; }

    // Действия
    if (el.dataset.action) {
      const map = {
        collect: 'collect',
        deposit: 'deposit',
        withdraw: 'withdraw',
        promo: 'promo',
      };
      const op = map[el.dataset.action];
      if (op) doAction(op);
      return;
    }

    // Покупки
    if (el.dataset.buyRack)     return doAction('buy_rack', Number(el.dataset.buyRack));
    if (el.dataset.buyMachine)  return doAction('buy_machine', el.dataset.buyMachine);
    if (el.dataset.buyRaw)      return doAction('buy_raw', Number(el.dataset.buyRaw));
    if (el.hasAttribute('data-upgrade-power')) return doAction('upgrade_power');

    // Подтверждение
    if (el.dataset.confirm === 'buy_machine') return act('buy_machine', { model: el.dataset.key });
    if (el.dataset.confirm === 'buy_rack')    return act('buy_rack', { slots: Number(el.dataset.key) });

    // Клик по станку
    if (el.dataset.machine) return openMachine(el.dataset.machine);

    // Внешние ссылки
    if (el.dataset.href && tg?.openLink) { e.preventDefault(); tg.openLink(el.dataset.href); }
  });

  // ═══════════════════════════════════════════════
  //  КАРТОЧКА СТАНКА
  // ═══════════════════════════════════════════════
  function openMachine(id) {
    const m = S.farm.machines.find(x => x.id === id);
    if (!m) return;
    const model = S.catalog.machines[m.model];

    openDialog(`
      <img src="icons/${modelFile(m.model)}" alt="" style="width:120px;display:block;margin:0 auto 12px">
      <h2 style="text-align:center">${UI.esc(model.name)}</h2>
      <dl class="stats-grid">
        ${stat('В час', UI.short(model.hourly), '🧻')}
        ${stat('В сутки', UI.short(model.hourly * 24), '🧻')}
        ${stat('Питание', model.watts, 'кВт')}
      </dl>
      <button class="button secondary full" data-toggle-machine="${UI.esc(m.id)}">
        ${m.enabled ? 'Выключить' : 'Включить'}
      </button>
      ${m.rack ? `<button class="button secondary full" data-uninstall="${UI.esc(m.id)}">Убрать на склад</button>` : ''}
    `);
  }

  // Обработка toggle и uninstall — отдельный listener
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.toggleMachine) return act('toggle_machine', { machine_id: el.dataset.toggleMachine });
    if (el.dataset.uninstall)     return act('uninstall', { machine_id: el.dataset.uninstall });
  });

  // ═══════════════════════════════════════════════
  //  ЗАГРУЗКА / BOOT
  // ═══════════════════════════════════════════════
  async function boot() {
    try {
      Load.setProgress(35);
      Load.setStatus('Подключаем профиль…');

      const r = await request({ op: 'login', init_data: tg?.initData || '' });
      token = r.token;
      S = r.state;
      snapshotAt = Date.now();

      Load.setProgress(70);
      Load.setStatus('Рендерим фабрику…');

      render();
      await Load.complete();

      // Периодическое обновление
      setInterval(refresh, 30000);
      setInterval(updateLive, 1000);
    } catch (e) {
      Load.fail(e.message);
    }
  }

  // ═══════════════════════════════════════════════
  //  LIVE-ОБНОВЛЕНИЕ (проекция между запросами)
  // ═══════════════════════════════════════════════
  function updateLive() {
    if (!S || document.hidden) return;
    // простая проекция: + hourly * sec / 3600 к pending
    const elapsed = (Date.now() - snapshotAt) / 1000;
    const projected = S.farm.pending + Math.floor(S.metrics.hourly * elapsed / 3600);
    document.querySelectorAll('.big-number').forEach(el => {
      if (page === 'farm') el.innerHTML = `${UI.short(projected)} <small>🧻</small>`;
    });
  }

  async function refresh() {
    if (!token || busy || document.hidden) return;
    try {
      const r = await request({ op: 'state' });
      S = r.state;
      snapshotAt = Date.now();
      if (!dialog.open) render();
    } catch {}
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  // ═══════════════════════════════════════════════
  //  СТАРТ
  // ═══════════════════════════════════════════════
  boot();

})();
