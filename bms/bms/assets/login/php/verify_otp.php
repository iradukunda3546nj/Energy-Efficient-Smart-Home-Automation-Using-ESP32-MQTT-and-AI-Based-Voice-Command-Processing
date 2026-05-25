<?php
/**
 * POST /php/verify_otp.php
 * Body: { user_id, otp_code, type }   type = 'signup' | 'reset'
 * Response: { success } | { success, token } for reset type
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body   = getJsonBody();
$userId = (int)($body['user_id'] ?? 0);
$otp    = clean($body['otp_code'] ?? '');
$type   = in_array($body['type'] ?? '', ['signup', 'reset']) ? $body['type'] : 'signup';

if (!$userId || !preg_match('/^\d{6}$/', $otp)) fail('Invalid request', 422);

rateLimit('otp_' . $userId, 5, 300);

$pdo = getDB();

// Ensure user exists
$userStmt = $pdo->prepare("SELECT id, is_verified FROM users WHERE id=? LIMIT 1");
$userStmt->execute([$userId]);
$user = $userStmt->fetch();
if (!$user) fail('User not found', 404);

// Verify OTP
if (!verifyOtp($userId, $otp, $type)) {
    fail('Invalid or expired code. Please try again or request a new one.', 401);
}

if ($type === 'signup') {
    // Activate account
    $pdo->prepare("UPDATE users SET is_verified=1 WHERE id=?")->execute([$userId]);
    ok(['message' => 'Account verified successfully']);
}

if ($type === 'reset') {
    // Issue a short-lived reset token (stored in password_resets)
    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
         ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash), expires_at=VALUES(expires_at)"
    )->execute([$userId, hash('sha256', $token)]);
    ok(['token' => $token, 'message' => 'OTP verified']);
}
