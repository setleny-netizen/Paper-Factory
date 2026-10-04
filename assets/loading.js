'use strict';

/**
 * FabrikaLoading — управление экраном загрузки.
 *
 * Как использовать из app.js:
 *   await FabrikaLoading.complete(catalog);  // скрыть лоадер
 *   FabrikaLoading.fail('Ошибка сети');       // показать ошибку
 */
window.FabrikaLoading = (() => {

  const screen   = document.querySelector('#loader');
  const body     = document.body;
  const title    = screen?.querySelector('[data-loading-title]');
  const message  = screen?.querySelector('[data-loading-message]');
  const statusEl = screen?.querySelector('[data-loading-status]');
  const actions  = screen?.querySelector('[data-loading-actions]');
  const progress = screen?.querySelector('[role="progressbar"] span');
  const retryBtn = screen?.querySelector('[data-loading-retry]');
  const openLink = screen?.querySelector('[data-loading-open]');

  let finished = false;
  let failed   = false;

  // Минимальное время показа лоадера (чтобы не мигал)
  const MIN_SHOW_MS = 1200;
  const startedAt   = performance.now();

  // Кнопка «Попробовать снова» — перезагрузка
  retryBtn?.addEventListener('click', () => location.reload());

  /**
   * Обновляет прогресс-бар (0..100).
   */
  function setProgress(percent) {
    if (!progress) return;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    progress.style.width = p + '%';
    screen?.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(p));
  }

  /**
   * Ставит текст статуса под прогресс-баром.
   */
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  /**
   * Завершает загрузку. Скрывает лоадер через fade.
   * Ждёт минимальное время MIN_SHOW_MS.
   */
  async function complete() {
    if (finished || failed) return;

    const elapsed = performance.now() - startedAt;
    const wait    = Math.max(0, MIN_SHOW_MS - elapsed);

    setProgress(100);
    setStatus('Готово. Запускаем фабрику');
    await new Promise(r => setTimeout(r, wait));

    if (failed) return;
    finished = true;

    body.classList.remove('is-loading');
    screen?.classList.add('is-ready');

    // Полностью убираем лоадер после анимации
    setTimeout(() => screen?.remove(), 300);
  }

  /**
   * Показывает ошибку. Игрок может повторить или открыть бота.
   */
  function fail(text) {
    if (finished || failed) return;
    failed = true;

    screen?.classList.add('is-error');
    if (title)   title.textContent = 'Фабрика пока недоступна';
    if (message) message.textContent = text || 'Не удалось загрузить игру. Попробуй ещё раз.';
    setStatus('Можно попробовать снова');
    if (actions) actions.hidden = false;
    setProgress(0);
  }

  /**
   * Ставит произвольный текст во время загрузки.
   * @param {string} msg
   */
  function setMessage(msg) {
    if (message) message.textContent = msg;
  }

  // Ставим начальный прогресс
  setProgress(15);

  return {
    complete,
    fail,
    setProgress,
    setStatus,
    setMessage,
  };
})();
