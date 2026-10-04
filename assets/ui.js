'use strict';

/**
 * FabrikaUI — общие функции для всех модулей игры.
 * Доступ: window.FabrikaUI.icon('bolt'), FabrikaUI.fmt(12345), ...
 */
window.FabrikaUI = (() => {

  /* ─────────────────────────────────────────
     ИКОНКИ (SVG-пути для <svg><path d="...">)
     ───────────────────────────────────────── */
  const paths = {
    // Навигация
    farm:    'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h8',
    shop:    'M3 8l2-5h14l2 5 M4 8v13h16V8 M9 21v-7h6v7 M3 8h18',
    income:  'M3 19h18 M6 15v-4 M12 15V5 M18 15V8',
    top:     'M8 3h8v5a4 4 0 0 1-8 0V3 M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 12v6 M8 21h8 M9 18h6v3',
    profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3',

    // Действия
    plus:  'M12 5v14 M5 12h14',
    check: 'M4 12l5 5L20 6',
    close: 'M6 6l12 12 M18 6L6 18',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    down:  'M12 3v18 M6 15l6 6 6-6',
    up:    'M12 21V3 M6 9l6-6 6 6',
    refresh: 'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M18 18a8 8 0 0 1-14-6',
    power: 'M12 2v9 M7 5a9 9 0 1 0 10 0',

    // Оборудование
    machine: 'M3 8h18v10H3z M7 12h2 M11 12h2 M15 12h2 M3 18h18',
    rack:    'M4 4h16v16H4z M4 9h16 M4 14h16 M4 19h16',
    raw:     'M4 18h16 M6 14l3-4 3 3 4-6 2 3',
    power2:  'M13 2L4 14h7l-1 8 10-13h-7z',

    // Разное
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    info:  'M12 11v6 M12 7v1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    gift:  'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
    warn:  'M12 9v4 M12 17v.5 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  };

  /**
   * Возвращает SVG-иконку по имени.
   * @param {string} name — имя иконки
   * @returns {string} HTML
   */
  const icon = (name) => `
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true"><path d="${paths[name] || paths.machine}"/></svg>`;

  /* ─────────────────────────────────────────
     БЕЗОПАСНАЯ ВСТАВКА ТЕКСТА
     ───────────────────────────────────────── */
  /**
   * Экранирует HTML-символы. Использовать для ЛЮБОГО текста из БД.
   * @param {*} v
   * @returns {string}
   */
  const esc = (v) => String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

  /* ─────────────────────────────────────────
     ФОРМАТИРОВАНИЕ ЧИСЕЛ
     ───────────────────────────────────────── */
  /**
   * Форматирует число с разделителями тысяч (ru-RU).
   * @param {number} value
   * @param {number} digits — знаков после запятой
   */
  const n = (value, digits = 0) => new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);

  /**
   * Сокращает большие числа: 1234 → «1,2 тыс.», 5_000_000 → «5 млн».
   */
  const short = (value) => {
    const v = Number(value) || 0;
    const abs = Math.abs(v);
    if (abs >= 1e9) return n(v / 1e9, 2) + ' млрд';
    if (abs >= 1e6) return n(v / 1e6, 2) + ' млн';
    if (abs >= 1e3) return n(v / 1e3, 1) + ' тыс.';
    return n(v);
  };

  /**
   * Человеко-читаемое время: 3661 → «1 ч 1 мин».
   */
  const duration = (seconds) => {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);

    if (d > 0) return `${d} д ${h} ч`;
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  };

  /* ─────────────────────────────────────────
     АВАТАРКА
     ───────────────────────────────────────── */
  /**
   * Возвращает HTML аватарки: первая буква имени + фото (если есть).
   * @param {object} player — {name, photo_url}
   * @param {string} extraClass
   */
  const avatar = (player, extraClass = '') => {
    const initial = Array.from(String(player?.name || 'Ф').trim())[0] || 'Ф';
    const photo = player?.photo_url
      ? `<img src="${esc(player.photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-profile-photo>`
      : '';
    return `<div class="avatar ${extraClass}" aria-hidden="true">${esc(initial.toUpperCase())}${photo}</div>`;
  };

  // Если фото не загрузилось — убираем <img>, остаётся буква
  document.addEventListener('error', (e) => {
    if (e.target.matches?.('[data-profile-photo]')) e.target.remove();
  }, true);

  /* ─────────────────────────────────────────
     СТАТУСЫ (для отображения)
     ───────────────────────────────────────── */
  const status = {
    working:  ['Работает',          'online'],
    paused:   ['Пауза',             'muted'],
    empty:    ['Нет станков',       'muted'],
    overload: ['Не хватает питания','warning'],
    noraw:    ['Закончилось сырьё', 'warning'],
  };

  /* ─────────────────────────────────────────
     ЭКСПОРТ
     ───────────────────────────────────────── */
  return {
    icon,
    esc,
    n,
    short,
    duration,
    avatar,
    status,
  };
})();
