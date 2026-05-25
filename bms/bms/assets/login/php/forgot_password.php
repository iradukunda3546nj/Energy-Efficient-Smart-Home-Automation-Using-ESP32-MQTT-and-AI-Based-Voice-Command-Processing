<?php
/**
 * POST /php/forgot_password.php
 * Body: { identifier }   identifier = email OR phone
 * Response: { success, user_id } | { success, message }
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body       = getJsonBody();
$identifier = clean($body['identifier'] ?? '');

if (!$identifier) fail('Please enter your email or phone number', 422);

rateLimit('forgot_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 5, 600);

$pdo = getDB();

// Look up by email OR phone
$stmt = $pdo->prepare("SELECT id, phone, email FROM users WHERE email=? OR phone=? LIMIT 1");
$stmt->execute([strtolower($identifier), $identifier]);
$user = $stmt->fetch();

// Always return success to prevent user enumeration
if (!$user) {
    ok(['message' => 'If that account exists, a reset code has been sent.']);
}

$otp = generateOtp();
storeOtp((int) $user['id'], $otp, 'reset');
sendSmsOtp($user['phone'], $otp);

ok(['user_id' => $user['id'], 'message' => 'Reset code sent']);
