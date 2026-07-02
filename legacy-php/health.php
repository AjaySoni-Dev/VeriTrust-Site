<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$tokenConfigured = vt_find_hf_token() !== null;

vt_json([
    'ok' => true,
    'service' => 'VeriTrust domain proxy',
    'token_configured' => $tokenConfigured,
    'deepfake_models' => array_values(array_map(function ($item) {
        return $item['display_name'];
    }, VT_DEEPFAKE_MODELS)),
    'phishing_models' => array_values(array_map(function ($item) {
        return $item['display_name'];
    }, VT_PHISHING_MODELS)),
    'php_version' => PHP_VERSION,
]);
