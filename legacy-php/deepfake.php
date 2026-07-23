<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

vt_require_post();

$modelKey = strtolower(trim((string) ($_POST['model'] ?? 'pixel')));
if (!array_key_exists($modelKey, VT_DEEPFAKE_MODELS)) {
    vt_error('Unknown deepfake model.', 400);
}

$upload = vt_uploaded_image_info('image');
$model = VT_DEEPFAKE_MODELS[$modelKey];
$result = vt_hf_binary_inference($model['provider'], $model['hf_model'], $upload['tmp_name'], $upload['mime']);

if (!$result['ok']) {
    vt_error('Hugging Face deepfake inference failed.', 502, [
        'status' => $result['status'],
        'details' => $result['json'] ?? $result['raw'] ?? $result['error'],
    ]);
}

$scores = vt_flatten_scores($result['json']);
if (!$scores) {
    vt_error('The deepfake model returned an unexpected response.', 502, [
        'raw' => vt_public_raw($result['json']),
    ]);
}

$realScore = null;
$fakeScore = null;
$normalized = [];

foreach ($scores as $item) {
    $label = (string) ($item['label'] ?? '');
    $score = (float) ($item['score'] ?? 0);
    $lower = strtolower($label);
    $normalized[] = vt_score_item($label, $score);

    if (vt_contains($lower, 'real')) {
        $realScore = max($realScore ?? 0.0, $score);
    }
    if (vt_contains($lower, 'fake')) {
        $fakeScore = max($fakeScore ?? 0.0, $score);
    }
}

if ($realScore === null || $fakeScore === null) {
    usort($normalized, fn($a, $b) => $b['score'] <=> $a['score']);
    $top = $normalized[0] ?? ['label' => 'Unknown', 'score' => 0.0];
    $topLabel = strtolower((string) $top['label']);
    if (vt_contains($topLabel, 'fake') || vt_contains($topLabel, '1')) {
        $fakeScore = (float) $top['score'];
        $realScore = 1.0 - $fakeScore;
    } else {
        $realScore = (float) $top['score'];
        $fakeScore = 1.0 - $realScore;
    }
}

$label = $fakeScore >= $realScore ? 'Fake' : 'Real';
$confidence = max($fakeScore, $realScore);
$riskLevel = $fakeScore >= 0.75 ? 'High' : ($fakeScore >= 0.45 ? 'Medium' : 'Low');

vt_json([
    'ok' => true,
    'type' => 'deepfake',
    'model' => [
        'key' => $modelKey,
        'name' => $model['display_name'],
    ],
    'result' => [
        'label' => $label,
        'confidence' => round($confidence, 5),
        'fake_score' => round($fakeScore, 5),
        'real_score' => round($realScore, 5),
        'risk_level' => $riskLevel,
        'explanation' => $label === 'Fake'
            ? 'The selected model found stronger synthetic-media evidence than real-media evidence.'
            : 'The selected model found stronger real-media evidence than synthetic-media evidence.',
    ],
    'scores' => $normalized,
]);
