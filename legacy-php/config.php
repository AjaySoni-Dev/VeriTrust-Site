<?php
declare(strict_types=1);

const VT_DEEPFAKE_MODELS = [
    'pixel' => [
        'display_name' => 'VeriTrust Pixel',
        'hf_model' => getenv('HF_DEEPFAKE_PIXEL_MODEL') ?: '',
        'provider' => 'hf-inference',
    ],
    'prism' => [
        'display_name' => 'VeriTrust Prism',
        'hf_model' => getenv('HF_DEEPFAKE_PRISM_MODEL') ?: '',
        'provider' => 'hf-inference',
    ],
];

const VT_PHISHING_MODELS = [
    'mailguard' => [
        'display_name' => 'VeriTrust MailGuard',
        'hf_model' => getenv('HF_PHISHING_MAILGUARD_MODEL') ?: '',
        'provider' => 'hf-inference',
    ],
    'cortex' => [
        'display_name' => 'VeriTrust Cortex',
        'hf_model' => getenv('HF_PHISHING_CORTEX_MODEL') ?: '',
        'provider' => 'featherless-ai',
    ],
];

function vt_bootstrap_api(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Content-Type: application/json; charset=utf-8');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function vt_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function vt_error(string $message, int $status = 400, array $extra = []): void
{
    vt_json(array_merge(['ok' => false, 'error' => $message], $extra), $status);
}

function vt_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        vt_error('Use POST for this endpoint.', 405);
    }
}

function vt_contains(string $haystack, string $needle): bool
{
    return strpos($haystack, $needle) !== false;
}

function vt_find_hf_token(): ?string
{
    $envToken = getenv('HF_ACCESS_TOKEN') ?: getenv('HF_TOKEN');
    if (is_string($envToken) && trim($envToken) !== '') {
        return trim($envToken);
    }

    return null;
}

function vt_read_hf_token(): string
{
    $token = vt_find_hf_token();
    if ($token !== null) {
        return $token;
    }

    vt_error('Hugging Face API token is not configured on the server.', 500);
}

function vt_curl_request(string $url, array $headers, $body, int $timeout = 90): array
{
    if (!function_exists('curl_init')) {
        vt_error('PHP cURL extension is required on this hosting account.', 500);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
    ]);

    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($errno !== 0) {
        return [
            'ok' => false,
            'status' => 0,
            'raw' => '',
            'json' => null,
            'error' => $error ?: 'Network request failed.',
        ];
    }

    $json = json_decode((string) $raw, true);
    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'raw' => (string) $raw,
        'json' => $json,
        'error' => null,
    ];
}

function vt_hf_model_urls(string $provider, string $modelId): array
{
    $encodedModel = implode('/', array_map('rawurlencode', explode('/', $modelId)));
    $urls = [
        "https://router.huggingface.co/{$provider}/models/{$encodedModel}",
    ];

    if ($provider === 'hf-inference') {
        $urls[] = "https://api-inference.huggingface.co/models/{$encodedModel}";
    }

    return $urls;
}

function vt_hf_binary_inference(string $provider, string $modelId, string $filePath, string $mimeType): array
{
    $token = vt_read_hf_token();
    $body = file_get_contents($filePath);
    if ($body === false) {
        vt_error('Unable to read uploaded image.', 400);
    }

    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: ' . $mimeType,
    ];

    $last = null;
    foreach (vt_hf_model_urls($provider, $modelId) as $url) {
        $result = vt_curl_request($url, $headers, $body, 120);
        if ($result['ok']) {
            return $result;
        }
        $last = $result;
    }

    return $last ?? ['ok' => false, 'status' => 0, 'json' => null, 'raw' => '', 'error' => 'No endpoint attempted.'];
}

function vt_hf_json_inference(string $provider, string $modelId, array $payload, int $timeout = 120): array
{
    $token = vt_read_hf_token();
    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: application/json',
    ];
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);

    $last = null;
    foreach (vt_hf_model_urls($provider, $modelId) as $url) {
        $result = vt_curl_request($url, $headers, $body, $timeout);
        if ($result['ok']) {
            return $result;
        }
        $last = $result;
    }

    return $last ?? ['ok' => false, 'status' => 0, 'json' => null, 'raw' => '', 'error' => 'No endpoint attempted.'];
}

function vt_hf_chat_completion(string $modelId, array $messages): array
{
    $token = vt_read_hf_token();
    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: application/json',
    ];

    $payload = [
        'model' => $modelId,
        'messages' => $messages,
        'temperature' => 0,
        'max_tokens' => 256,
    ];

    return vt_curl_request(
        'https://router.huggingface.co/featherless-ai/v1/chat/completions',
        $headers,
        json_encode($payload, JSON_UNESCAPED_SLASHES),
        150
    );
}

function vt_flatten_scores($raw): array
{
    if (!is_array($raw)) {
        return [];
    }
    if (isset($raw['error'])) {
        return [];
    }
    if (isset($raw[0]) && is_array($raw[0]) && isset($raw[0][0]) && is_array($raw[0][0])) {
        return $raw[0];
    }
    if (isset($raw[0]) && is_array($raw[0]) && array_key_exists('label', $raw[0])) {
        return $raw;
    }
    return [];
}

function vt_score_item(string $label, float $score): array
{
    return ['label' => $label, 'score' => max(0.0, min(1.0, $score))];
}

function vt_public_raw($raw)
{
    return $raw;
}

function vt_uploaded_image_info(string $field = 'image'): array
{
    if (!isset($_FILES[$field])) {
        vt_error("Upload an image using the '{$field}' field.", 400);
    }

    $file = $_FILES[$field];
    if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        vt_error('Image upload failed.', 400);
    }

    $tmp = (string) $file['tmp_name'];
    if (!is_uploaded_file($tmp)) {
        vt_error('Invalid uploaded file.', 400);
    }

    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > 12 * 1024 * 1024) {
        vt_error('Image must be smaller than 12 MB.', 400);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file($tmp);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'], true)) {
        vt_error('Unsupported image type. Use JPG, PNG, WEBP, or BMP.', 400);
    }

    return [
        'tmp_name' => $tmp,
        'mime' => $mime,
        'name' => (string) ($file['name'] ?? 'uploaded-image'),
        'size' => $size,
    ];
}

vt_bootstrap_api();
