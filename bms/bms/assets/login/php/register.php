<?php
/**
 * POST /php/register.php
 * Body: { full_name, email, phone, password, confirm_password }
 * Response: { success, user_id } | { success, message, field }
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Method not allowed', 405);

$body = getJsonBody();

// ── Extract & sanitize ────────────────────────────────────────────────────────
$fullName = clean($body['full_name'] ?? '');
$email    = strtolower(clean($body['email'] ?? ''));
$phone    = clean($body['phone'] ?? '');
$password = $body['password'] ?? '';
$confirm  = $body['confirm_password'] ?? '';

// ── Validate ──────────────────────────────────────────────────────────────────
if (strlen($fullName) < 3)       fail('Full name must be at least 3 characters', 422, ['field' => 'fullName']);
if (!isValidEmail($email))        fail('Enter a valid email address', 422, ['field' => 'email']);
if (!isValidPhone($phone))        fail('Enter a valid phone number', 422, ['field' => 'phone']);
if (!isStrongPassword($password)) fail('Password is too weak', 422, ['field' => 'password']);
if ($password !== $confirm)       fail('Passwords do not match', 422, ['field' => 'confirmPassword']);

// ── Rate limit by IP ──────────────────────────────────────────────────────────
rateLimit('register_' . ($_SERVER['REMOTE_ADDR'] ?? ''), 5, 300);

$pdo = getDB();

// ── Check uniqueness ──────────────────────────────────────────────────────────
$stmt = $pdo->prepare("SELECT id, email, phone FROM users WHERE email=? OR phone=? LIMIT 1");
$stmt->execute([$email, $phone]);
$existing = $stmt->fetch();

if ($existing) {
    if ($existing['email'] === $email) fail('Email is already registered', 409, ['field' => 'email']);
    if ($existing['phone'] === $phone) fail('Phone number is already registered', 409, ['field' => 'phone']);
}

// ── Create user ───────────────────────────────────────────────────────────────
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

$stmt = $pdo->prepare(
    "INSERT INTO users (full_name, email, phone, password_hash, is_verified, created_at)
     VALUES (?, ?, ?, ?, 0, NOW())"
);
$stmt->execute([$fullName, $email, $phone, $hash]);
$userId = (int) $pdo->lastInsertId();

// ── Generate & send OTP ───────────────────────────────────────────────────────
$otp = generateOtp();
storeOtp($userId, $otp, 'signup');
sendSmsOtp($phone, $otp);

ok(['user_id' => $userId, 'message' => 'Account created. Please verify your phone number.']);
