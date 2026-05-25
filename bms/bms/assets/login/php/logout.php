<?php
/**
 * POST /php/logout.php
 * Destroys session and clears cookies
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
startSecureSession();

// Delete remember-me token from DB if present
if (!empty($_COOKIE['urugo_remember'])) {
    try {
        $pdo = getDB();
        $hash = hash('sha256', $_COOKIE['urugo_remember']);
        $pdo->prepare("DELETE FROM remember_tokens WHERE token_hash=?")->execute([$hash]);
    } catch (Exception $e) { /* silent */ }
    setcookie('urugo_remember', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => isset($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $params['path'],
        'domain'   => $params['domain'],
        'secure'   => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => 'Strict',
    ]);
}
session_destroy();

ok(['redirect' => 'assets/login/login.html']);
