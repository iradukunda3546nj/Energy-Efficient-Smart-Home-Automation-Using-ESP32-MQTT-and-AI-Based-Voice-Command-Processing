<?php
/**
 * Urugo Management System — Database Connection
 * Uses PDO with prepared statements for security
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'zolilabs_urugo_bms_auth');
define('DB_USER', 'zolilabs_urugo_auth'); // ← change in production
define('DB_PASS', '*9-q0GQ=NsCdR@QC'); // ← change in production
define('DB_CHARSET', 'utf8mb4');


function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(503);
            echo json_encode(['success' => false, 'message' => 'Database connection failed']);
            exit;
        }
    }
    return $pdo;
}
