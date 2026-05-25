<?php
/**
 * POST /php/reset_password.php
 * Body: { user_id, token, new_password }
 * Response: { success } | { success, message }
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body        = getJsonBody();
$userId      = (int)($body['user_id'] ?? 0);
$token       = clean($body['token'] ?? '');
$newPassword = $body['new_password'] ?? '';

if (!$userId || !$token || !$newPassword) fail('Invalid request', 422);
if (!isStrongPassword($newPassword)) fail('Password does not meet strength requirements', 422);

rateLimit('reset_pw_' . $userId, 5, 300);

$pdo = getDB();

// Verify the reset token
$tokenHash = hash('sha256', $token);
$stmt = $pdo->prepare(
    "SELECT id FROM password_resets WHERE user_id=? AND token_hash=? AND expires_at > NOW() LIMIT 1"
);
$stmt->execute([$userId, $tokenHash]);
$resetRow = $stmt->fetch();

if (!$resetRow) fail('Reset link has expired or is invalid. Please start over.', 401);

// Ensure new password isn't the same as the current one
$userStmt = $pdo->prepare("SELECT password_hash FROM users WHERE id=? LIMIT 1");
$userStmt->execute([$userId]);
$user = $userStmt->fetch();
if ($user && password_verify($newPassword, $user['password_hash'])) {
    fail('New password must be different from your current password', 422);
}

// Update password
$newHash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
$pdo->prepare("UPDATE users SET password_hash=? WHERE id=?")->execute([$newHash, $userId]);

// Invalidate all reset tokens for this user
$pdo->prepare("DELETE FROM password_resets WHERE user_id=?")->execute([$userId]);

// Destroy any active sessions for this user (optional: add session table for multi-device)

ok(['message' => 'Password reset successfully. You can now sign in.']);
