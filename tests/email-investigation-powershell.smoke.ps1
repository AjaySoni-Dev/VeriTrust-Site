$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

. (Join-Path $PSScriptRoot '..\assets\powershell\VeriTrust.EmailInvestigation.ps1')

$script:Requests = @()
function Invoke-RestMethod {
    param(
        [string] $Method,
        [string] $Uri,
        [hashtable] $Headers,
        [string] $ContentType,
        [string] $InFile,
        [string] $Body,
        [string] $ErrorAction
    )
    $script:Requests += [PSCustomObject]@{ Uri = $Uri; ContentType = $ContentType; InFile = $InFile; Body = $Body }
    [PSCustomObject]@{
        ok = $true
        scan_id = 'scan-smoke-123'
        evidence = [PSCustomObject]@{ state = 'LIKELY_PHISHING'; input_mode = if ($InFile) { 'eml' } else { 'text' }; limitations = @() }
        gateway_decision = [PSCustomObject]@{ risk = 0.91; recommendation = 'quarantine' }
    }
}

$TestApiKey = 'vtg_test_123456789012345678901234'
$TextResult = Invoke-VeriTrustEmailInvestigation -Subject 'Action required' -Body 'Verify your password now.' -ApiKey $TestApiKey -BaseUrl 'https://example.test'
if ($TextResult.Result -ne 'Likely phishing' -or $TextResult.RiskPercent -ne 91) { throw 'Text result mapping failed.' }
if ($script:Requests[0].Uri -ne 'https://example.test/api/v1/gateway/email/analyze-text') { throw 'Text endpoint routing failed.' }

$EmlPath = Join-Path ([IO.Path]::GetTempPath()) ("veritrust-email-{0}.eml" -f [Guid]::NewGuid())
try {
    Set-Content -LiteralPath $EmlPath -Value "From: sender@example.test`r`nSubject: Test`r`n`r`nMessage" -Encoding Ascii
    $EmlResult = Invoke-VeriTrustEmailInvestigation -EmlPath $EmlPath -ApiKey $TestApiKey -BaseUrl 'https://example.test/'
    if ($EmlResult.InputType -ne 'eml') { throw 'EML result mapping failed.' }
    if ($script:Requests[1].Uri -ne 'https://example.test/api/v1/gateway/email/analyze-eml') { throw 'EML endpoint routing failed.' }
    if ($script:Requests[1].ContentType -ne 'message/rfc822') { throw 'EML content type failed.' }
    if ($script:Requests[1].InFile -ne $EmlPath) { throw 'EML file forwarding failed.' }
}
finally {
    Remove-Item -LiteralPath $EmlPath -Force -ErrorAction SilentlyContinue
}

Write-Output 'PowerShell email investigation smoke test passed.'
