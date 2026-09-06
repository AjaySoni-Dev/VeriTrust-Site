$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot '..\assets\powershell\VeriTrust.EmailInvestigation.ps1')
$script:Calls = @()
$script:Failures = 0
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$TimeoutSec,$MaximumRedirection,$ErrorAction,$DisableKeepAlive,$ContentType,$InFile,$Body)
    $script:Calls += @{Uri=$Uri;Headers=$Headers.Clone();Body=$Body;InFile=$InFile;DisableKeepAlive=$DisableKeepAlive}
    if ($script:Failures -gt 0) { $script:Failures--; throw [Net.WebException]::new('Connection closed') }
    if ($Uri -match '/uploads$') { return [PSCustomObject]@{ok=$true;upload_id='upload-test';signed_upload=[PSCustomObject]@{url='https://storage.example.test/signed'}} }
    if ($Uri -match '/signed$|/complete$') { return [PSCustomObject]@{ok=$true} }
    if ($Uri -match 'limit=1') { return [PSCustomObject]@{ok=$true;scans=@()} }
    return [PSCustomObject]@{ok=$true;scan_id='c220adad-4cd5-4fa6-9654-e71272cf3ff1';status='completed';decision=[PSCustomObject]@{risk=$null;verdict='unknown';recommendation='review'}}
}
$Key = [Security.SecureString]::new()
foreach ($Character in 'vtg_test_123456789012345678901234'.ToCharArray()) { $Key.AppendChar($Character) }
Connect-VeriTrust -BaseUrl 'https://example.test' -ApiKey $Key
$script:Calls = @()
$script:Failures = 1
$Result = vt link 'https://example.com' -IdempotencyKey 'same-request'
if ($script:Calls.Count -ne 2) { throw 'Transient request did not retry exactly once.' }
if ($script:Calls[0].Headers['Idempotency-Key'] -ne $script:Calls[1].Headers['Idempotency-Key']) { throw 'Retry changed identity.' }
if (-not $script:Calls[0].DisableKeepAlive) { throw 'Keep-alive mitigation missing.' }
if ($null -ne $Result.RiskPercent) { throw 'Missing score became a numeric result.' }
$Payload = [Text.Encoding]::UTF8.GetString($script:Calls[1].Body) | ConvertFrom-Json
if ($Payload.content.urls[0] -ne 'https://example.com') { throw 'Link routing failed.' }
$script:Failures = 2
$Caught = $false
try { vt link 'https://example.com' } catch { $Caught = $_.Exception.Message -match 'request failed' }
if (-not $Caught) { throw 'Persistent connection failure did not terminate clearly.' }
$TempImage = Join-Path ([IO.Path]::GetTempPath()) ('vt-test-' + [Guid]::NewGuid() + '.png')
try {
    [IO.File]::WriteAllBytes($TempImage, [byte[]]@(137,80,78,71))
    $script:Calls = @()
    $null = vt image $TempImage
    if ($script:Calls.Count -ne 4) { throw 'Image upload flow is incomplete.' }
    if ($script:Calls[1].Headers.ContainsKey('Authorization')) { throw 'Gateway credential sent to storage.' }
    if ($script:Calls[1].InFile -ne $TempImage) { throw 'Image bytes not forwarded.' }
    $Payload = [Text.Encoding]::UTF8.GetString($script:Calls[3].Body) | ConvertFrom-Json
    if ($Payload.content.media[0].upload_id -ne 'upload-test') { throw 'Scan did not reference registered upload.' }
} finally { Remove-Item -LiteralPath $TempImage -Force }
$Pending = ConvertTo-VeriTrustScanSummary ([PSCustomObject]@{status='queued';scan_id='pending'})
if ($Pending.Result -ne 'No decision available') { throw 'Pending scan invented a decision.' }
vt logout
$Rejected = $false
try { vt link 'https://example.com' } catch { $Rejected = $_.Exception.Message -match 'login' }
if (-not $Rejected) { throw 'Logout left an authenticated session.' }
Write-Output 'Gateway PowerShell smoke tests passed.'
