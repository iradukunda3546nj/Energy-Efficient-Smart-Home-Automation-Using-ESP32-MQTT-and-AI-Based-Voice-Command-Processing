<?php
/**
 * Urugo Auth — Shared Helpers
 */

require_once __DIR__ . '/db.php';

// ── CORS + JSON headers ──────────────────────────────────────────────────────
function jsonHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('X-XSS-Protection: 1; mode=block');
    // Only accept XHR
    if (
        empty($_SERVER['HTTP_X_REQUESTED_WITH']) ||
        strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) !== 'xmlhttprequest'
    ) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Direct access not allowed']);
        exit;
    }
}

// ── JSON body parser ─────────────────────────────────────────────────────────
function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

// ── JSON response helpers ────────────────────────────────────────────────────
function ok(array $data = []): void {
    echo json_encode(array_merge(['success' => true], $data));
    exit;
}

function fail(string $message, int $code = 400, array $extra = []): void {
    http_response_code($code);
    echo json_encode(array_merge(['success' => false, 'message' => $message], $extra));
    exit;
}

// ── Input sanitization ───────────────────────────────────────────────────────
function clean(string $val): string {
    return trim(htmlspecialchars($val, ENT_QUOTES, 'UTF-8'));
}

// ── Validation helpers ───────────────────────────────────────────────────────
function isValidEmail(string $email): bool {
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

function isValidPhone(string $phone): bool {
    return (bool) preg_match('/^\+?[0-9]{9,15}$/', preg_replace('/\s/', '', $phone));
}

function isStrongPassword(string $pw): bool {
    return strlen($pw) >= 8
        && preg_match('/[A-Z]/', $pw)
        && preg_match('/[a-z]/', $pw)
        && preg_match('/\d/',    $pw)
        && preg_match('/[!@#$%^&*()\-_=+\[\]{};:\'"\\|,.<>\/?`~]/', $pw);
}

// ── Session management ───────────────────────────────────────────────────────
function startSecureSession(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => isset($_SERVER['HTTPS']),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }
}

function requireAuth(): void {
    startSecureSession();
    if (empty($_SESSION['user_id'])) {
        fail('Authentication required', 401);
    }
    // Session fixation protection
    if (empty($_SESSION['_fingerprint'])) {
        fail('Invalid session', 401);
    }
    $fp = md5($_SERVER['HTTP_USER_AGENT'] . $_SERVER['REMOTE_ADDR']);
    if ($_SESSION['_fingerprint'] !== $fp) {
        session_destroy();
        fail('Session hijacking detected', 401);
    }
}

function loginUser(int $userId): void {
    startSecureSession();
    session_regenerate_id(true);
    $_SESSION['user_id']     = $userId;
    $_SESSION['login_time']  = time();
    $_SESSION['_fingerprint'] = md5($_SERVER['HTTP_USER_AGENT'] . $_SERVER['REMOTE_ADDR']);
}

// ── OTP helpers ──────────────────────────────────────────────────────────────
function generateOtp(): string {
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function storeOtp(int $userId, string $otp, string $type = 'signup'): void {
    $pdo = getDB();
    // Invalidate old OTPs for this user+type
    $pdo->prepare("UPDATE otps SET used=1 WHERE user_id=? AND type=? AND used=0")
        ->execute([$userId, $type]);

    $pdo->prepare(
        "INSERT INTO otps (user_id, otp_code, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))"
    )->execute([$userId, password_hash($otp, PASSWORD_BCRYPT), $type]);
}

function verifyOtp(int $userId, string $otp, string $type = 'signup'): bool {
    $pdo  = getDB();
    $stmt = $pdo->prepare(
        "SELECT id, otp_code FROM otps
         WHERE user_id=? AND type=? AND used=0 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1"
    );
    $stmt->execute([$userId, $type]);
    $row = $stmt->fetch();

    if (!$row) return false;
    if (!password_verify($otp, $row['otp_code'])) return false;

    $pdo->prepare("UPDATE otps SET used=1 WHERE id=?")->execute([$row['id']]);
    return true;
}

// ── SMS sender stub (plug in Twilio / Africa's Talking) ──────────────────────
function sendSmsOtp(string $phone, string $otp): bool {
    // ── PRODUCTION: uncomment and configure Twilio ──
    // require_once __DIR__ . '/vendor/autoload.php';
    // $twilio = new \Twilio\Rest\Client(TWILIO_SID, TWILIO_TOKEN);
    // $twilio->messages->create($phone, [
    //     'from' => TWILIO_FROM,
    //     'body' => "Your Urugo verification code is: $otp. Expires in 5 minutes."
    // ]);
    // return true;

    // ── DEVELOPMENT: log OTP to file ──
    $log = date('[Y-m-d H:i:s]') . " OTP for $phone: $otp\n";
    file_put_contents(__DIR__ . '/otp_log.txt', $log, FILE_APPEND);
    return true;
}

// ── Rate limiter (simple file-based, swap for Redis in production) ────────────
function rateLimit(string $key, int $maxAttempts = 5, int $windowSeconds = 300): void {
    $file = sys_get_temp_dir() . '/urugo_rl_' . md5($key) . '.json';
    $data = file_exists($file) ? json_decode(file_get_contents($file), true) : ['count' => 0, 'until' => 0];

    if (time() > $data['until']) {
        $data = ['count' => 0, 'until' => time() + $windowSeconds];
    }

    $data['count']++;
    file_put_contents($file, json_encode($data));

    if ($data['count'] > $maxAttempts) {
        fail("Too many attempts. Please wait " . ceil(($data['until'] - time()) / 60) . " minute(s).", 429);
    }
}
