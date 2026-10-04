<?php
/**
 * callback.php — приём уведомлений о пополнениях от Paper Scroll.
 *
 * Paper Scroll отправляет POST при каждом пополнении в копилку сообщества.
 * Мы должны:
 *   1. Проверить secret
 *   2. Обработать data._id ровно один раз (idempotency)
 *   3. Ответить HTTP 200 и телом "OK"
 *
 * Пока: только логируем. Начисление рулонов — включим позже.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Отвечаем всегда OK, чтобы Paper Scroll не повторял доставку
function respondOk(): void {
    http_response_code(200);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'OK';
    exit;
}

function respondFail(string $msg, int $code = 400): void {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $msg;
    exit;
}

// ═══════════════════════════════════════════════
//  ТОЛЬКО POST
// ═══════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondFail('Method not allowed', 405);
}

// ═══════════════════════════════════════════════
//  ЧИТАЕМ ТЕЛО
// ═══════════════════════════════════════════════
$raw = file_get_contents('php://input');
if (!$raw) {
    respondFail('Empty body');
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    respondFail('Invalid JSON');
}

// ═══════════════════════════════════════════════
//  ПРОВЕРКА ТИПА
// ═══════════════════════════════════════════════
if (($payload['type'] ?? '') !== 'newTransfer') {
    // Не наш тип — игнорируем, но отвечаем OK
    respondOk();
}

$data   = $payload['data']   ?? [];
$secret = $payload['secret'] ?? '';

// ═══════════════════════════════════════════════
//  ПРОВЕРКА SECRET
// ═══════════════════════════════════════════════
$expectedSecret = env('PAPER_SCROLL_SECRET');
if (!$expectedSecret) {
    // В разработке — просто логируем и отвечаем OK
    logCallback('SECRET_NOT_SET', $payload);
    respondOk();
}

if (!hash_equals((string)$expectedSecret, (string)$secret)) {
    logCallback('SECRET_MISMATCH', $payload);
    respondFail('Invalid secret', 403);
}

// ═══════════════════════════════════════════════
//  ДАННЫЕ ПЕРЕВОДА
// ═══════════════════════════════════════════════
$transferId = (string)($data['_id']        ?? '');   // внутренний ID перевода
$amount     = (int)   ($data['amount']     ?? 0);    // зачислено после комиссии (1 рулон = 1000)
$userSnid   = (int)   ($data['userSnid']   ?? 0);    // Telegram ID отправителя
$currency   = (string)($data['currency']   ?? '');   // "paper"

if (!$transferId || $amount <= 0 || !$userSnid) {
    logCallback('BAD_DATA', $payload);
    respondFail('Bad data');
}

// ═══════════════════════════════════════════════
//  ЛОГ (пока просто файл, потом — в БД)
// ═══════════════════════════════════════════════
logCallback('INCOMING', [
    'transfer_id' => $transferId,
    'amount'      => $amount,
    'user_snid'   => $userSnid,
    'currency'    => $currency,
]);

// ═══════════════════════════════════════════════
//  ОБРАБОТКА (ПОЗЖЕ)
// ═══════════════════════════════════════════════
//
// Здесь будет:
//   1. Проверка что $transferId ещё не обрабатывался (таблица transfers)
//   2. Поиск игрока по telegram_id = $userSnid
//   3. Начисление рулонов на его баланс
//   4. Запись в history
//   5. Отметка $transferId как обработанного
//
// Пока — только логируем и отвечаем OK.

respondOk();


// ═══════════════════════════════════════════════
//  ЛОГИРОВАНИЕ
// ═══════════════════════════════════════════════
function logCallback(string $event, array $payload): void {
    $dir = __DIR__ . '/logs';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);

    $file = $dir . '/callback.log';
    $line = sprintf(
        "[%s] %s | %s\n",
        date('Y-m-d H:i:s'),
        $event,
        json_encode($payload, JSON_UNESCAPED_UNICODE)
    );
    @file_put_contents($file, $line, FILE_APPEND);
}
