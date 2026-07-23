<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

vt_require_post();

$modelKey = strtolower(trim((string) ($_POST['model'] ?? 'mailguard')));
if (!array_key_exists($modelKey, VT_PHISHING_MODELS)) {
    vt_error('Unknown phishing model.', 400);
}

$text = trim((string) ($_POST['text'] ?? ''));
if ($text === '') {
    vt_error('Paste an email, SMS, URL, or message to analyze.', 400);
}
if (strlen($text) > 12000) {
    vt_error('Text payload is too long. Keep it under 12,000 characters.', 400);
}

$model = VT_PHISHING_MODELS[$modelKey];

if ($modelKey === 'mailguard') {
    $result = vt_hf_json_inference($model['provider'], $model['hf_model'], [
        'inputs' => $text,
        'options' => ['wait_for_model' => true],
    ]);

    if (!$result['ok']) {
        vt_error('Hugging Face phishing classifier failed.', 502, [
            'status' => $result['status'],
            'details' => $result['json'] ?? $result['raw'] ?? $result['error'],
        ]);
    }

    $scores = vt_flatten_scores($result['json']);
    if (!$scores) {
        vt_error('The phishing classifier returned an unexpected response.', 502, [
            'raw' => vt_public_raw($result['json']),
        ]);
    }

    $legitimate = 0.0;
    $phishing = 0.0;
    $normalized = [];

    foreach ($scores as $item) {
        $label = (string) ($item['label'] ?? '');
        $score = max(0.0, min(1.0, (float) ($item['score'] ?? 0)));
        $lower = strtolower($label);
        $normalized[] = vt_score_item($label, $score);

        if (in_array($lower, ['label_0', 'legitimate_email', 'label_2', 'legitimate_url'], true) || vt_contains($lower, 'legitimate')) {
            $legitimate += $score;
        } elseif (in_array($lower, ['label_1', 'phishing_url', 'label_3', 'phishing_url_alt'], true) || vt_contains($lower, 'phishing')) {
            $phishing += $score;
        }
    }

    $total = $legitimate + $phishing;
    if ($total <= 0 && $normalized) {
        usort($normalized, function ($a, $b) {
            return $b['score'] <=> $a['score'];
        });
        $topLabel = strtolower((string) ($normalized[0]['label'] ?? ''));
        $topScore = (float) ($normalized[0]['score'] ?? 0.0);
        if (vt_contains($topLabel, 'phish') || vt_contains($topLabel, 'label_1') || vt_contains($topLabel, 'label_3')) {
            $phishing = $topScore;
            $legitimate = 1.0 - $topScore;
        } else {
            $legitimate = $topScore;
            $phishing = 1.0 - $topScore;
        }
        $total = $legitimate + $phishing;
    }

    $total = max(0.00001, $total);
    $legitimate = $legitimate / $total;
    $phishing = $phishing / $total;
    $label = $phishing >= $legitimate ? 'Phishing' : 'Legitimate';
    $confidence = max($phishing, $legitimate);
    $riskLevel = $phishing >= 0.75 ? 'High' : ($phishing >= 0.45 ? 'Medium' : 'Low');

    vt_json([
        'ok' => true,
        'type' => 'phishing',
        'model' => [
            'key' => $modelKey,
            'name' => $model['display_name'],
        ],
        'result' => [
            'label' => $label,
            'confidence' => round($confidence, 5),
            'phishing_score' => round($phishing, 5),
            'legitimate_score' => round($legitimate, 5),
            'risk_level' => $riskLevel,
            'explanation' => $label === 'Phishing'
                ? 'MailGuard found stronger phishing-related evidence after merging the four source labels into two classes.'
                : 'MailGuard found stronger legitimate-message evidence after merging the four source labels into two classes.',
        ],
        'scores' => $normalized,
    ]);
}

$messages = [
    [
        'role' => 'system',
        'content' => 'You are VeriTrust Cortex, a strict phishing detection analyst. Return only compact JSON with keys: label, confidence, risk_level, explanation, indicators. The label must be either Phishing or Legitimate. Confidence must be a number from 0 to 1.',
    ],
    [
        'role' => 'user',
        'content' => "Analyze this message for phishing, smishing, scam, credential theft, impersonation, malicious links, urgency pressure, and financial fraud:\n\n" . $text,
    ],
];

$result = vt_hf_chat_completion($model['hf_model'], $messages);
if (!$result['ok']) {
    vt_error('Hugging Face Cortex inference failed.', 502, [
        'status' => $result['status'],
        'details' => $result['json'] ?? $result['raw'] ?? $result['error'],
    ]);
}

$content = (string) ($result['json']['choices'][0]['message']['content'] ?? '');
$jsonText = $content;
if (preg_match('/\{.*\}/s', $content, $matches)) {
    $jsonText = $matches[0];
}
$parsed = json_decode($jsonText, true);

if (!is_array($parsed)) {
    $parsed = [
        'label' => vt_contains(strtolower($content), 'phishing') ? 'Phishing' : 'Legitimate',
        'confidence' => 0.5,
        'risk_level' => 'Medium',
        'explanation' => trim($content) ?: 'Cortex returned an unstructured response.',
        'indicators' => [],
    ];
}

$rawLabel = (string) ($parsed['label'] ?? 'Legitimate');
$label = vt_contains(strtolower($rawLabel), 'phish') ? 'Phishing' : 'Legitimate';
$confidence = (float) ($parsed['confidence'] ?? 0.5);
if ($confidence > 1) {
    $confidence = $confidence / 100;
}
$confidence = max(0.0, min(1.0, $confidence));
$riskLevel = (string) ($parsed['risk_level'] ?? ($label === 'Phishing' ? 'High' : 'Low'));
$explanation = (string) ($parsed['explanation'] ?? 'Cortex completed the phishing analysis.');
$indicators = $parsed['indicators'] ?? [];
if (!is_array($indicators)) {
    $indicators = [$indicators];
}

vt_json([
    'ok' => true,
    'type' => 'phishing',
    'model' => [
        'key' => $modelKey,
        'name' => $model['display_name'],
    ],
    'result' => [
        'label' => $label,
        'confidence' => round($confidence, 5),
        'phishing_score' => $label === 'Phishing' ? round($confidence, 5) : round(1 - $confidence, 5),
        'legitimate_score' => $label === 'Legitimate' ? round($confidence, 5) : round(1 - $confidence, 5),
        'risk_level' => $riskLevel,
        'explanation' => $explanation,
        'indicators' => array_values($indicators),
    ],
]);
