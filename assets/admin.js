'use strict';

/**
 * FabrikaAdmin — админ-панель.
 * Доступ: только если S.player.is_admin === true.
 */
window.FabrikaAdmin = (() => {

  const UI = window.FabrikaUI;
  const tg = window.Telegram?.WebApp;

  // ═══════════════════════════════════════════════
  //  СОСТОЯНИЕ
  // ═══════════════════════════════════════════════
  let ctx = null;        // ссылка на app.js (state, request, act, render)
  let A = null;          // данные админки
  let tab = 'players';   // активная вкладка
  let page = 0;          // страница списка игроков
  let search = '';       // поиск
  let loading = false;
  let error = '';

  // ═══════════════════════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════════════
  function init(context) {
    ctx = context;
  }

  // ═══════════════════════════════════════════════
  //  ЗАГРУЗКА ДАННЫХ
  // ═══════════════════════════════════════════════
  async function load(render = true) {
    if (!ctx.state()?.player.is_admin) return;

    loading = true;
    error = '';
    if (render) ctx.render();

    try {
      const r = await ctx.request({
        op: 'admin_state',
        data: { tab, page, search },
      });
      A = r.admin;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
      if (render) ctx.render();
    }
  }

  // ═══════════════════════════════════════════════
  //  ВНЕШНИЙ ВИД
  // ═══════════════════════════════════════════════
  function heading(title, subtitle) {
    return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div></div>`;
  }

  function stat(name, value) {
    return `<div><dt>${name}</dt><dd>${value}</dd></div>`;
  }

  // ═══════════════════════════════════════════════
  //  ВКЛАДКИ
  // ═══════════════════════════════════════════════
  const TABS = [
    ['players',   'Игроки'],
    ['treasury',  'Касса'],
    ['promos',    'Промокоды'],
    ['audit',     'Журнал'],
  ];

  function tabsView() {
    return `<div class="admin-tabs">
      ${TABS.map(([id, label]) =>
        `<button data-admin-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${label}</button>`
      ).join('')}
    </div>`;
  }

  // ═══════════════════════════════════════════════
  //  ГЛАВНЫЙ РЕНДЕР
  // ═══════════════════════════════════════════════
  function view() {
    if (!ctx.state()?.player.is_admin) {
      return `<section class="boot"><h1>Доступ ограничен</h1><p>Только для владельца фабрики.</p></section>`;
    }

    const title = heading('Админ-центр', 'Управление фабрикой');

    if (!A && loading) {
      return title + `<p>Загружаем данные…</p>`;
    }

    if (error) {
      return title + `<p class="warning-text">${UI.esc(error)}</p>`;
    }

    return title + tabsView() + `<div class="admin-content">${contentView()}</div>`;
  }

  function contentView() {
    if (tab === 'players')  return playersView();
    if (tab === 'treasury') return treasuryView();
    if (tab === 'promos')   return promosView();
    if (tab === 'audit')    return auditView();
    return '';
  }

  // ═══════════════════════════════════════════════
  //  ВКЛАДКА: ИГРОКИ
  // ═══════════════════════════════════════════════
  function playersView() {
    const list = A?.players?.list || [];
    return `
      <form id="admin-search" class="people-search">
        <label>Найти игрока
          <input name="search" value="${UI.esc(search)}" placeholder="Telegram ID, @ник или имя" maxlength="80">
        </label>
        <button class="button secondary" type="submit">Найти</button>
      </form>

      <div class="card">
        ${list.length
          ? list.map(p => `
            <div class="admin-row">
              ${UI.avatar(p)}
              <div class="admin-row__info">
                <strong>${UI.esc(p.name)}</strong>
                <small>${p.username ? '@' + UI.esc(p.username) : 'ID ' + UI.esc(p.telegram_id)}</small>
                <small>${UI.n(p.balance)} 🧻 · ${p.machines} станков · ${p.racks} стеллажей</small>
              </div>
              <button class="button danger compact" data-ban="${UI.esc(p.id)}" data-banned="${p.banned ? 'true' : 'false'}">
                ${p.banned ? 'Разбанить' : 'Забанить'}
              </button>
            </div>`).join('')
          : '<p>Игроков не найдено.</p>'}
      </div>`;
  }

  // ═══════════════════════════════════════════════
  //  ВКЛАДКА: КАССА (заглушка до Paper Scroll)
  // ═══════════════════════════════════════════════
  function treasuryView() {
    return `
      <div class="card">
        <h2>Касса сообщества</h2>
        <dl class="stats-grid">
          ${stat('Копилка', UI.n(A?.treasury?.score || 0) + ' 🧻')}
          ${stat('В резерве', UI.n(A?.treasury?.reserved || 0) + ' 🧻')}
        </dl>
        <p class="hint">Пополнение и выводы через Paper Scroll будут подключены позже.</p>
      </div>`;
  }

  // ═══════════════════════════════════════════════
  //  ВКЛАДКА: ПРОМОКОДЫ
  // ═══════════════════════════════════════════════
  function promosView() {
    return `
      <div class="card">
        <h2>Создать промокод</h2>
        <form id="admin-promo-form">
          <label class="field-label">Код
            <input name="code" minlength="3" maxlength="32" placeholder="PAPER2026" required>
          </label>
          <label class="field-label">Что даёт
            <select name="kind">
              <option value="machine">Станок</option>
              <option value="raw">Сырьё (кг)</option>
              <option value="balance">Рулоны</option>
            </select>
          </label>
          <label class="field-label">Значение
            <input name="value" type="number" min="1" value="1" required>
          </label>
          <label class="field-label">Всего активаций (0 — без лимита)
            <input name="max_uses" type="number" min="0" value="100" required>
          </label>
          <button class="button primary full" type="submit">Создать промокод</button>
        </form>
      </div>

      <div class="card">
        <h2>Существующие</h2>
        ${A?.promos?.length
          ? A.promos.map(p => `
            <div class="admin-row">
              <strong>${UI.esc(p.code)}</strong>
              <small>${p.kind} · ${p.used_count}/${p.max_uses || '∞'}</small>
              <button class="button secondary compact" data-promo-toggle="${UI.esc(p.id)}" data-active="${p.active ? 'true' : 'false'}">
                ${p.active ? 'Отключить' : 'Включить'}
              </button>
            </div>`).join('')
          : '<p>Промокодов нет.</p>'}
      </div>`;
  }

  // ═══════════════════════════════════════════════
  //  ВКЛАДКА: ЖУРНАЛ
  // ═══════════════════════════════════════════════
  function auditView() {
    return `
      <div class="card">
        <h2>Журнал действий</h2>
        ${A?.audit?.length
          ? A.audit.map(a => `
            <div class="admin-row">
              <strong>${UI.esc(a.action)}</strong>
              <small>${UI.esc(a.details || '')}</small>
            </div>`).join('')
          : '<p>Журнал пуст.</p>'}
      </div>`;
  }

  // ═══════════════════════════════════════════════
  //  ОБРАБОТКА СОБЫТИЙ
  // ═══════════════════════════════════════════════
  function bind() {
    // Вкладки
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.onclick = () => {
        tab = btn.dataset.adminTab;
        page = 0;
        search = '';
        load();
      };
    });

    // Поиск
    const searchForm = document.querySelector('#admin-search');
    if (searchForm) {
      searchForm.onsubmit = (e) => {
        e.preventDefault();
        search = new FormData(searchForm).get('search') || '';
        page = 0;
        load();
      };
    }

    // Бан / разбан
    document.querySelectorAll('[data-ban]').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.ban);
        const banned = btn.dataset.banned === 'true';
        if (!confirm(banned ? 'Разбанить игрока?' : 'Забанить игрока?')) return;
        ctx.act('admin_ban', { player_id: id, banned: !banned });
      };
    });

    // Создание промокода
    const promoForm = document.querySelector('#admin-promo-form');
    if (promoForm) {
      promoForm.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(promoForm);
        ctx.act('admin_promo_create', {
          code: String(f.get('code')),
          kind: String(f.get('kind')),
          value: Number(f.get('value')),
          max_uses: Number(f.get('max_uses')),
        });
      };
    }

    // Вкл/выкл промокод
    document.querySelectorAll('[data-promo-toggle]').forEach(btn => {
      btn.onclick = () => {
        ctx.act('admin_promo_toggle', {
          id: Number(btn.dataset.promoToggle),
          active: btn.dataset.active !== 'true',
        });
      };
    });
  }

  // ═══════════════════════════════════════════════
  //  ЭКСПОРТ
  // ═══════════════════════════════════════════════
  return {
    init,
    load,
    view,
    bind,
  };
})();
