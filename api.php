<?php
/**
 * Fabrika — единый API-эндпоинт.
 * Все запросы: POST с JSON-телом {op, data, request_id, device_id}.
 * Ответ: JSON {ok: true, ...} или {ok: false, message}.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ═══════════════════════════════════════════════
//  КОНФИГ
// ═══════════════════════════════════════════════
require_once __DIR__ . '/config.php';   // .env загрузка (создашь сам)

// ═══════════════════════════════════════════════
//  БАЗА
// ═══════════════════════════════════════════════
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        'mysql:host=' . env('DB_HOST') . ';dbname=' . env('DB_NAME') . ';charset=utf8mb4',
        env('DB_USER'),
        env('DB_PASS'),
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
    return $pdo;
}

// ═══════════════════════════════════════════════
//  ХЕЛПЕРЫ
// ═══════════════════════════════════════════════
function ok(array $data = []): void {
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => true, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function input(): array {
    static $in = null;
    if ($in === null) {
        $raw = file_get_contents('php://input');
        $in = json_decode($raw ?: '{}', true) ?: [];
    }
    return $in;
}

function data(): array  { return input()['data'] ?? []; }
function op(): string   { return (string)(input()['op'] ?? ''); }
function deviceId(): string { return (string)(input()['device_id'] ?? ''); }

// ═══════════════════════════════════════════════
//  АВТОРИЗАЦИЯ (Telegram initData)
// ═══════════════════════════════════════════════
function verifyTelegram(string $initData): array {
    parse_str($initData, $params);
    $hash = $params['hash'] ?? '';
    unset($params['hash']);

    ksort($params);
    $checkString = implode("\n", array_map(fn($k) => "$k=$params[$k]", array_keys($params)));
    $secretKey = hash_hmac('sha256', env('BOT_TOKEN'), 'WebAppData', true);
    $calcHash = hash_hmac('sha256', $checkString, $secretKey);

    if (!hash_equals($calcHash, $hash)) {
        // В разработке можно временно отключить
        if (env('DEBUG') !== 'true') fail('Неверная подпись Telegram', 401);
    }

    $user = json_decode($params['user'] ?? '{}', true);
    if (!$user || empty($user['id'])) fail('Нет данных пользователя', 401);
    return $user;
}

function currentPlayer(): array {
    static $player = null;
    if ($player) return $player;

    $initData = (string)(input()['init_data'] ?? '');

    // Если есть Bearer-токен — берём из сессии
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (str_starts_with($auth, 'Bearer ')) {
        $token = substr($auth, 7);
        $pdo = db();
        $stmt = $pdo->prepare('SELECT * FROM players WHERE session_token = ? LIMIT 1');
        $stmt->execute([$token]);
        $player = $stmt->fetch();
        if (!$player) fail('Сессия истекла', 401);
        return $player;
    }

    // Иначе — логинимся по init_data
    if (!$initData) fail('Нужна авторизация', 401);
    $tgUser = verifyTelegram($initData);
    $player = getOrCreatePlayer($tgUser);
    return $player;
}

function getOrCreatePlayer(array $tgUser): array {
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM players WHERE telegram_id = ? LIMIT 1');
    $stmt->execute([$tgUser['id']]);
    $p = $stmt->fetch();

    if ($p) {
        $pdo->prepare('UPDATE players SET last_seen = ? WHERE id = ?')
            ->execute([time(), $p['id']]);
        return $p;
    }

    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO players (telegram_id, name, username, photo_url, session_token, joined_at, last_seen)
                   VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $tgUser['id'],
            $tgUser['first_name'] . (isset($tgUser['last_name']) ? ' ' . $tgUser['last_name'] : ''),
            $tgUser['username'] ?? null,
            $tgUser['photo_url'] ?? null,
            $token,
            time(),
            time(),
        ]);

    $stmt = $pdo->prepare('SELECT * FROM players WHERE telegram_id = ? LIMIT 1');
    $stmt->execute([$tgUser['id']]);
    return $stmt->fetch();
}

// ═══════════════════════════════════════════════
//  КАТАЛОГ (станки, стеллажи, питание)
// ═══════════════════════════════════════════════
function catalog(): array {
    return [
        'machines' => [
            'papyrus-p100'     => ['name' => 'Papyrus P-100',    'class' => 'Кустарная',       'hourly' => 59524,      'watts' => 35,  'price' => 20_000_000],
            'papyrus-p500'     => ['name' => 'Papyrus P-500',    'class' => 'Базовая',         'hourly' => 208333,     'watts' => 80,  'price' => 150_000_000],
            'cellumax-c1500'   => ['name' => 'CelluMax C-1500',  'class' => 'Продвинутая',     'hourly' => 606061,     'watts' => 160, 'price' => 800_000_000],
            'cellumax-c3000'   => ['name' => 'CelluMax C-3000',  'class' => 'Профессиональная','hourly' => 1470588,    'watts' => 320, 'price' => 3_000_000_000],
            'fibergiant-f6000' => ['name' => 'FiberGiant F-6000','class' => 'Промышленная',    'hourly' => 2564103,    'watts' => 560, 'price' => 8_000_000_000],
            'titan-tpx'        => ['name' => 'Titan Paper TP-X', 'class' => 'Легендарная',     'hourly' => 4504505,    'watts' => 925, 'price' => 20_000_000_000],
        ],
        'racks' => [
            1 => ['name' => 'Rack R-1', 'price' => 200_000_000],
            2 => ['name' => 'Rack R-2', 'price' => 290_000_000],
            3 => ['name' => 'Rack R-3', 'price' => 420_000_000],
            4 => ['name' => 'Rack R-4', 'price' => 610_000_000],
            5 => ['name' => 'Rack R-5', 'price' => 885_000_000],
            6 => ['name' => 'Rack R-6', 'price' => 1_280_000_000],
            7 => ['name' => 'Rack R-7', 'price' => 1_860_000_000],
            8 => ['name' => 'Rack R-8', 'price' => 2_700_000_000],
            9 => ['name' => 'Rack R-9', 'price' => 4_000_000_000],
        ],
        'power' => [
            ['watts' => 500,    'price' => 0],
            ['watts' => 1500,   'price' => 200_000_000],
            ['watts' => 3500,   'price' => 600_000_000],
            ['watts' => 7500,   'price' => 1_500_000_000],
            ['watts' => 15000,  'price' => 3_500_000_000],
            ['watts' => 50000,  'price' => 10_000_000_000],
        ],
        'raw_price'  => 2,       // 🧻 за 1 кг
        'raw_per_kg' => 10,      // рулонов из 1 кг
        'max_racks'  => 6,
    ];
}

// ═══════════════════════════════════════════════
//  СТЕЙТ ИГРОКА
// ═══════════════════════════════════════════════
function buildState(array $player): array {
    $pdo = db();
    $cat = catalog();

    // Станки
    $stmt = $pdo->prepare('SELECT id, model, rack_id, slot, enabled, purchase_price FROM machines WHERE player_id = ?');
    $stmt->execute([$player['id']]);
    $machines = array_map(fn($m) => [
        'id'             => (string)$m['id'],
        'model'          => $m['model'],
        'rack'           => $m['rack_id'] ? (string)$m['rack_id'] : null,
        'slot'           => $m['slot'] !== null ? (int)$m['slot'] : null,
        'enabled'        => (bool)$m['enabled'],
        'purchase_price' => (int)$m['purchase_price'],
    ], $stmt->fetchAll());

    // Стеллажи
    $stmt = $pdo->prepare('SELECT id, slots FROM racks WHERE player_id = ?');
    $stmt->execute([$player['id']]);
    $racks = array_map(fn($r) => [
        'id'    => (string)$r['id'],
        'slots' => (int)$r['slots'],
    ], $stmt->fetchAll());

    // Если нет ни одного стеллажа — создаём стартовый
    if (!$racks) {
        $pdo->prepare('INSERT INTO racks (player_id, slots) VALUES (?, 1)')->execute([$player['id']]);
        $rid = (int)$pdo->lastInsertId();
        $racks[] = ['id' => (string)$rid, 'slots' => 1];
    }

    // Метрики
    $watts = 0;
    $hourly = 0;
    foreach ($machines as $m) {
        if (!$m['enabled'] || !$m['rack']) continue;
        $model = $cat['machines'][$m['model']] ?? null;
        if (!$model) continue;
        $watts += $model['watts'];
        $hourly += $model['hourly'];
    }

    $capacity = $cat['power'][$player['power_level']]['watts'];
    $status = 'paused';

    if (!$machines)               $status = 'empty';
    elseif ($player['raw'] <= 0)  $status = 'noraw';
    elseif ($watts > $capacity)   $status = 'overload';
    elseif ($player['running'] && $hourly > 0) $status = 'working';

    // Расход сырья в час
    $rawPerHour = 0;
    foreach ($machines as $m) {
        if (!$m['enabled'] || !$m['rack']) continue;
        $model = $cat['machines'][$m['model']] ?? null;
        if (!$model) continue;
        $rawPerHour += $model['hourly'] / $cat['raw_per_kg'];
    }

    // История
    $stmt = $pdo->prepare('SELECT amount, note, created_at FROM history WHERE player_id = ? ORDER BY id DESC LIMIT 20');
    $stmt->execute([$player['id']]);
    $history = $stmt->fetchAll();

    return [
        'player' => [
            'id'         => (int)$player['id'],
            'name'       => $player['name'],
            'username'   => $player['username'],
            'photo_url'  => $player['photo_url'],
            'balance'    => (int)$player['balance'],
            'is_admin'   => (bool)$player['is_admin'],
        ],
        'farm' => [
            'machines'       => $machines,
            'racks'          => $racks,
            'raw'            => (float)$player['raw'],
            'power_level'    => (int)$player['power_level'],
            'running'        => (bool)$player['running'],
            'pending'        => (float)$player['pending'],
            'produced_total' => (int)$player['produced_total'],
            'runtime'        => time() - (int)$player['joined_at'],
            'theme'          => $player['theme'] ?: 'dark',
        ],
        'catalog' => $cat,
        'metrics' => [
            'status'      => $status,
            'watts'       => $watts,
            'capacity'    => $capacity,
            'hourly'      => $hourly,
            'raw_seconds' => $rawPerHour > 0 ? (int)floor($player['raw'] / $rawPerHour * 3600) : 0,
        ],
        'history' => array_map(fn($h) => [
            'amount'     => (int)$h['amount'],
            'note'       => $h['note'],
            'created_at' => $h['created_at'],
        ], $history),
    ];
}

// ═══════════════════════════════════════════════
//  ГЛАВНЫЙ РОУТЕР
// ═══════════════════════════════════════════════
$op = op();

try {
    // ─── Логин ───
    if ($op === 'login') {
        $player = currentPlayer();
        ok([
            'token' => $player['session_token'],
            'state' => buildState($player),
        ]);
    }

    // ─── Все остальные — требуют авторизации ───
    $player = currentPlayer();

    // ─── Стейт ───
    if ($op === 'state') {
        ok(['state' => buildState($player)]);
    }

    // ─── Собрать рулоны ───
    if ($op === 'collect') {
        $pdo = db();
        $amount = (int)$player['pending'];
        if ($amount < 1) fail('Нечего собирать');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE players SET balance = balance + ?, pending = 0, produced_total = produced_total + ? WHERE id = ?')
            ->execute([$amount, $amount, $player['id']]);
        $pdo->prepare('INSERT INTO history (player_id, amount, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], $amount, 'Сбор продукции', date('Y-m-d H:i:s')]);
        $pdo->commit();

        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => "Собрано: $amount 🧻"]);
    }

    // ─── Купить станок ───
    if ($op === 'buy_machine') {
        $modelKey = (string)(data()['model'] ?? '');
        $cat = catalog();
        if (!isset($cat['machines'][$modelKey])) fail('Такого станка нет');

        $m = $cat['machines'][$modelKey];
        if ($player['balance'] < $m['price']) fail('Не хватает рулонов');

        $pdo = db();
        $pdo->beginTransaction();

        $pdo->prepare('UPDATE players SET balance = balance - ? WHERE id = ?')
            ->execute([$m['price'], $player['id']]);

        // Ищем свободный слот в стеллажах
        $stmt = $pdo->prepare('SELECT id, slots FROM racks WHERE player_id = ?');
        $stmt->execute([$player['id']]);
        $racks = $stmt->fetchAll();

        $rackId = null; $slot = null;
        foreach ($racks as $r) {
            $stmt2 = $pdo->prepare('SELECT slot FROM machines WHERE player_id = ? AND rack_id = ?');
            $stmt2->execute([$player['id'], $r['id']]);
            $used = array_column($stmt2->fetchAll(), 'slot');
            for ($i = 0; $i < $r['slots']; $i++) {
                if (!in_array($i, $used, true)) { $rackId = $r['id']; $slot = $i; break 2; }
            }
        }

        $pdo->prepare('INSERT INTO machines (player_id, model, rack_id, slot, enabled, purchase_price, created_at)
                       VALUES (?, ?, ?, ?, 1, ?, ?)')
            ->execute([$player['id'], $modelKey, $rackId, $slot, $m['price'], date('Y-m-d H:i:s')]);

        $pdo->prepare('INSERT INTO history (player_id, amount, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], -$m['price'], 'Покупка: ' . $m['name'], date('Y-m-d H:i:s')]);

        $pdo->commit();
        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Станок установлен']);
    }

    // ─── Купить стеллаж ───
    if ($op === 'buy_rack') {
        $slots = (int)(data()['slots'] ?? 0);
        $cat = catalog();
        if (!isset($cat['racks'][$slots])) fail('Такого стеллажа нет');

        $pdo = db();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM racks WHERE player_id = ?');
        $stmt->execute([$player['id']]);
        if ($stmt->fetchColumn() >= $cat['max_racks']) fail('Достигнут лимит стеллажей');

        $r = $cat['racks'][$slots];
        if ($player['balance'] < $r['price']) fail('Не хватает рулонов');

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE players SET balance = balance - ? WHERE id = ?')->execute([$r['price'], $player['id']]);
        $pdo->prepare('INSERT INTO racks (player_id, slots, purchase_price, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], $slots, $r['price'], date('Y-m-d H:i:s')]);
        $pdo->prepare('INSERT INTO history (player_id, amount, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], -$r['price'], 'Покупка: ' . $r['name'], date('Y-m-d H:i:s')]);
        $pdo->commit();

        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Стеллаж куплен']);
    }

    // ─── Купить сырьё ───
    if ($op === 'buy_raw') {
        $kg = (int)(data()['kg'] ?? 0);
        if ($kg < 1 || $kg > 1_000_000) fail('Неверное количество');

        $cat = catalog();
        $cost = $kg * $cat['raw_price'];
        if ($player['balance'] < $cost) fail('Не хватает рулонов');

        $pdo = db();
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE players SET balance = balance - ?, raw = raw + ? WHERE id = ?')
            ->execute([$cost, $kg, $player['id']]);
        $pdo->prepare('INSERT INTO history (player_id, amount, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], -$cost, "Закупка: $kg кг", date('Y-m-d H:i:s')]);
        $pdo->commit();

        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => "Куплено $kg кг"]);
    }

    // ─── Улучшить питание ───
    if ($op === 'upgrade_power') {
        $cat = catalog();
        $next = $player['power_level'] + 1;
        if (!isset($cat['power'][$next])) fail('Максимальная мощность');

        $p = $cat['power'][$next];
        if ($player['balance'] < $p['price']) fail('Не хватает рулонов');

        $pdo = db();
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE players SET balance = balance - ?, power_level = ? WHERE id = ?')
            ->execute([$p['price'], $next, $player['id']]);
        $pdo->prepare('INSERT INTO history (player_id, amount, note, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$player['id'], -$p['price'], 'Апгрейд сети: ' . $p['watts'] . ' кВт', date('Y-m-d H:i:s')]);
        $pdo->commit();

        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Сеть усилена']);
    }

    // ─── Вкл/выкл станок ───
    if ($op === 'toggle_machine') {
        $id = (int)(data()['machine_id'] ?? 0);
        $pdo = db();
        $pdo->prepare('UPDATE machines SET enabled = 1 - enabled WHERE id = ? AND player_id = ?')
            ->execute([$id, $player['id']]);
        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Переключено']);
    }

    // ─── Снять со стеллажа ───
    if ($op === 'uninstall') {
        $id = (int)(data()['machine_id'] ?? 0);
        $pdo = db();
        $pdo->prepare('UPDATE machines SET rack_id = NULL, slot = NULL WHERE id = ? AND player_id = ?')
            ->execute([$id, $player['id']]);
        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Убрано на склад']);
    }

    // ─── Топ ───
    if ($op === 'leaderboard') {
        $pdo = db();
        $stmt = $pdo->query('SELECT id, name, username, photo_url FROM players WHERE banned = 0 ORDER BY produced_total DESC LIMIT 50');
        $rows = $stmt->fetchAll();

        $cat = catalog();
        $players = [];
        foreach ($rows as $i => $p) {
            $stmt2 = $pdo->prepare('SELECT model FROM machines WHERE player_id = ? AND enabled = 1 AND rack_id IS NOT NULL');
            $stmt2->execute([$p['id']]);
            $hourly = 0;
            foreach ($stmt2->fetchAll() as $m) {
                $hourly += $cat['machines'][$m['model']]['hourly'] ?? 0;
            }
            $players[] = [
                'id'       => (int)$p['id'],
                'name'     => $p['name'],
                'username' => $p['username'],
                'photo_url'=> $p['photo_url'],
                'hourly'   => $hourly,
            ];
        }

        ok(['leaderboard' => ['players' => $players, 'total' => count($players)]]);
    }

    // ─── Промокод ───
    if ($op === 'promo_redeem') {
        $code = strtoupper(trim((string)(data()['code'] ?? '')));
        if (strlen($code) < 3) fail('Слишком короткий код');

        $pdo = db();
        $stmt = $pdo->prepare('SELECT * FROM promos WHERE code = ? AND active = 1 LIMIT 1');
        $stmt->execute([$code]);
        $promo = $stmt->fetch();

        if (!$promo) fail('Промокод не найден');
        if ($promo['max_uses'] > 0 && $promo['used_count'] >= $promo['max_uses']) fail('Лимит активаций');

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM promo_uses WHERE promo_id = ? AND player_id = ?');
        $stmt->execute([$promo['id'], $player['id']]);
        if ($stmt->fetchColumn() > 0) fail('Уже активирован');

        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO promo_uses (promo_id, player_id, used_at) VALUES (?, ?, ?)')
            ->execute([$promo['id'], $player['id'], date('Y-m-d H:i:s')]);
        $pdo->prepare('UPDATE promos SET used_count = used_count + 1 WHERE id = ?')
            ->execute([$promo['id']]);

        if ($promo['kind'] === 'balance') {
            $pdo->prepare('UPDATE players SET balance = balance + ? WHERE id = ?')
                ->execute([$promo['value'], $player['id']]);
        } elseif ($promo['kind'] === 'raw') {
            $pdo->prepare('UPDATE players SET raw = raw + ? WHERE id = ?')
                ->execute([$promo['value'], $player['id']]);
        }

        $pdo->commit();
        $player = db()->query('SELECT * FROM players WHERE id = ' . (int)$player['id'])->fetch();
        ok(['state' => buildState($player), 'message' => 'Промокод активирован']);
    }

    // ─── Заглушки ───
    if ($op === 'deposit' || $op === 'withdraw') {
        fail('Пополнение и вывод будут подключены позже', 501);
    }

    // ─── Админка ───
    if (str_starts_with($op, 'admin_')) {
        if (!$player['is_admin']) fail('Доступ запрещён', 403);

        if ($op === 'admin_state') {
            // TODO: реализовать полноценный admin_state
            ok(['admin' => [
                'players'  => ['list' => [], 'has_more' => false],
                'treasury' => ['score' => 0, 'reserved' => 0],
                'promos'   => [],
                'audit'    => [],
            ]]);
        }

        if ($op === 'admin_ban') {
            $id = (int)(data()['player_id'] ?? 0);
            $banned = (bool)(data()['banned'] ?? false);
            db()->prepare('UPDATE players SET banned = ? WHERE id = ?')->execute([$banned ? 1 : 0, $id]);
            db()->prepare('INSERT INTO audit (admin_id, action, details, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$player['id'], $banned ? 'ban' : 'unban', 'player_id=' . $id, date('Y-m-d H:i:s')]);
            ok(['message' => $banned ? 'Забанен' : 'Разбанен']);
        }

        fail('Неизвестная админ-операция');
    }

    fail('Неизвестная операция: ' . $op);
} catch (Throwable $e) {
    if (env('DEBUG') === 'true') {
        fail($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine(), 500);
    }
    fail('Ошибка сервера', 500);
}
