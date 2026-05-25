<?php
/**
 * POST /php/session_check.php
 * Returns whether user is authenticated
 */

require_once __DIR__ . '/helpers.php';

jsonHeaders();
startSecureSession();

$authenticated = !empty($_SESSION['user_id']);
ok([
    'authenticated' => $authenticated,
    'user_name'     => $_SESSION['user_name'] ?? null,
]);
