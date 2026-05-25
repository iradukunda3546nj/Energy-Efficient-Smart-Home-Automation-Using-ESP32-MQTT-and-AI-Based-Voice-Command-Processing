<?php
/**
 * POST /php/login.php
 * Body: { email, password, remember_me }
 * Response: { success, redirect } | { success, message }
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body = getJsonBody();

$email      = strtolower(clean($body['email'] ?? ''));
$password   = $body['password'] ?? '';
$rememberMe = !empty($body['remember_me']);

if (!$email || !$password) fail('Email and password are required', 422);

// ── Rate limit per IP ─────────────────────────────────────────────────────────
rateLimit('login_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 10, 300);

$pdo  = getDB();
$stmt = $pdo->prepare("SELECT id, password_hash, is_verified, full_name FROM users WHERE email=? LIMIT 1");
$stmt->execute([$email]);
$user = $stmt->fetch();

// ── Constant-time invalid credential message (no user enumeration) ────────────
if (!$user || !password_verify($password, $user['password_hash'])) {
    // Simulate hash time to prevent timing attacks
    password_verify('dummy', '$2y$12$' . str_repeat('x', 53));
    fail('Invalid email or password', 401);
}

if (!$user['is_verified']) {
    fail('Please verify your phone number first. Check your SMS.', 403, [
        'unverified' => true,
        'user_id' => $user['id']
    ]);
}

// ── Re-hash if needed ─────────────────────────────────────────────────────────
if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
    $newHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $pdo->prepare("UPDATE users SET password_hash=? WHERE id=?")
        ->execute([$newHash, $user['id']]);
}

// ── Start session ─────────────────────────────────────────────────────────────
loginUser((int) $user['id']);
$_SESSION['user_name'] = $user['full_name'];

// ── Optional: set long-lived remember cookie ──────────────────────────────────
if ($rememberMe) {
    $token = bin2hex(random_bytes(32));

    $pdo->prepare(
        "INSERT INTO remember_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))"
    )->execute([
        (int) $user['id'],
        hash('sha256', $token)
    ]);

    setcookie('urugo_remember', $token, [
        'expires'  => time() + 86400 * 30,
        'path'     => '/',
        'secure'   => isset($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

// ── Final response (FIXED REDIRECT) ───────────────────────────────────────────
ok([
    'success'  => true,
    'redirect' => '/bms/dashboard.html',
    'name'     => $user['full_name']
]);