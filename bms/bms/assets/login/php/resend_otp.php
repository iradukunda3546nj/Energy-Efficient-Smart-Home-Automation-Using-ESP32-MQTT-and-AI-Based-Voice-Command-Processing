<?php
/**
 * POST /php/resend_otp.php
 * Body: { user_id, type }
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body   = getJsonBody();
$userId = (int)($body['user_id'] ?? 0);
$type   = in_array($body['type'] ?? 'signup', ['signup', 'reset']) ? ($body['type'] ?? 'signup') : 'signup';

if (!$userId) fail('Invalid request', 422);

rateLimit('resend_otp_' . $userId, 3, 600);

$pdo  = getDB();
$stmt = $pdo->prepare("SELECT phone FROM users WHERE id=? LIMIT 1");
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user) fail('User not found', 404);

$otp = generateOtp();
storeOtp($userId, $otp, $type);
sendSmsOtp($user['phone'], $otp);

ok(['message' => 'New code sent']);
