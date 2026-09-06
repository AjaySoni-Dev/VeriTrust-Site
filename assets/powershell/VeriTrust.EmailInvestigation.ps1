#requires -Version 5.1

function Invoke-VeriTrustRequest {
    [CmdletBinding()]
    param([string] $Method = 'Get', [string] $Uri, [hashtable] $Headers = @{},
        [string] $ContentType, [string] $InFile, $Body, [int] $TimeoutSec = 90,
        [int] $MaximumRedirection = 0)
    $Request = @{ Method = $Method; Uri = $Uri; Headers = $Headers; TimeoutSec = $TimeoutSec;
        MaximumRedirection = 0; ErrorAction = 'Stop'; DisableKeepAlive = $true }
    if ($ContentType) { $Request.ContentType = $ContentType }
    if ($InFile) { $Request.InFile = $InFile }
    if ($null -ne $Body) { $Request.Body = $Body }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    for ($Attempt = 0; $Attempt -lt 2; $Attempt++) {
        try { return Invoke-RestMethod @Request }
        catch {
            $Status = 0
            if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response) { $Status = [int] $_.Exception.Response.StatusCode }
            $TransportError = $_.Exception -is [Net.WebException] -or $_.Exception.GetType().Name -in @('HttpRequestException','TaskCanceledException')
            $Transient = ($TransportError -and $Status -eq 0) -or $Status -in @(502,503,504)
            if ($Attempt -eq 0 -and $Transient -and ($Method -eq 'Get' -or $Headers['Idempotency-Key'])) {
                Write-Verbose 'Connection interrupted; retrying the same request once.'
                Start-Sleep -Seconds 1
                continue
            }
            if ($Status -in @(401,403)) { throw 'VeriTrust access denied. Run vt login and check your API key permissions.' }
            $Reference = if ($Headers['Idempotency-Key']) { " Request ID: $($Headers['Idempotency-Key'])." } else { '' }
            throw "VeriTrust request failed$(if ($Status) { " (HTTP $Status)" }). The server may still be processing the request; check scan history before submitting again.$Reference"
        }
    }
}

function Invoke-VeriTrustEmailInvestigation {
    <#
    .SYNOPSIS
    Investigates pasted email text or an original .eml file through the VeriTrust Unified Gateway.

    .DESCRIPTION
    Returns a concise PowerShell object while retaining the complete Gateway response in
    TechnicalReport. Compatible with Windows PowerShell 5.1 and PowerShell 7.

    .EXAMPLE
    Invoke-VeriTrustEmailInvestigation -Subject "Action required" -Body $EmailText

    .EXAMPLE
    Invoke-VeriTrustEmailInvestigation -EmlPath "C:\SecurityTests\suspicious-email.eml"
    #>
    [CmdletBinding(DefaultParameterSetName = 'Text')]
    param(
        [Parameter(Mandatory, ParameterSetName = 'Text')]
        [ValidateLength(1, 12000)]
        [string] $Body,

        [Parameter(ParameterSetName = 'Text')]
        [ValidateLength(0, 998)]
        [string] $Subject = '',

        [Parameter(Mandatory, ParameterSetName = 'Eml')]
        [ValidateNotNullOrEmpty()]
        [string] $EmlPath,

        [Parameter()]
        [AllowEmptyString()]
        [string] $ApiKey = '',

        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string] $BaseUrl = 'https://www.veritrustlab.in',

        [ValidateRange(1, 300)]
        [int] $TimeoutSec = 90,

        [ValidateNotNullOrEmpty()]
        [string] $IdempotencyKey = [Guid]::NewGuid().ToString()
    )

    if ([string]::IsNullOrWhiteSpace($ApiKey) -and (Get-Variable VeriTrustSession -Scope Script -ErrorAction SilentlyContinue) -and $script:VeriTrustSession) {
        $ApiKey = $script:VeriTrustSession.Credential.GetNetworkCredential().Password
        if (-not $PSBoundParameters.ContainsKey('BaseUrl')) { $BaseUrl = $script:VeriTrustSession.BaseUrl }
    }
    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        $SessionKey = Get-Variable -Name ApiKey -Scope Global -ValueOnly -ErrorAction SilentlyContinue
        if ($null -ne $SessionKey) {
            $ApiKey = [string] $SessionKey
        }
    }

    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        throw 'No API key is available. Run the secure setup block or pass -ApiKey.'
    }

    if ($ApiKey -notmatch '^vtg_(live|test)_[A-Za-z0-9_-]{20,}$') {
        throw 'The API key format is invalid. Create a new key from VeriTrust API Access.'
    }

    $BaseUrl = $BaseUrl.TrimEnd('/')
    $ParsedBaseUrl = $null
    if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref] $ParsedBaseUrl) -or
        $ParsedBaseUrl.Scheme -ne 'https' -or $ParsedBaseUrl.UserInfo -or
        $ParsedBaseUrl.Query -or $ParsedBaseUrl.Fragment -or $ParsedBaseUrl.AbsolutePath -ne '/') {
        throw 'BaseUrl must be an HTTPS origin without credentials, a path, a query, or a fragment.'
    }
    $RequestHeaders = @{
        Authorization     = "Bearer $ApiKey"
        'Idempotency-Key' = $IdempotencyKey
    }

    if ($PSCmdlet.ParameterSetName -eq 'Eml') {
        if (-not (Test-Path -LiteralPath $EmlPath -PathType Leaf)) {
            throw "Email file not found: $EmlPath"
        }

        $EmailFile = Get-Item -LiteralPath $EmlPath -ErrorAction Stop
        if ($EmailFile.Extension -ine '.eml') {
            throw 'Choose a file with the .eml extension.'
        }
        if ($EmailFile.Length -lt 1 -or $EmailFile.Length -gt 10MB) {
            throw 'The .eml file must contain data and must not exceed 10 MB.'
        }

        $Response = Invoke-VeriTrustRequest `
            -Method Post `
            -Uri "$BaseUrl/api/v1/gateway/email/analyze-eml" `
            -Headers $RequestHeaders `
            -ContentType 'message/rfc822' `
            -InFile $EmailFile.FullName `
            -TimeoutSec $TimeoutSec `
            -MaximumRedirection 0 `
            -ErrorAction Stop
    }
    else {
        if ([string]::IsNullOrWhiteSpace($Body)) { throw 'Provide a non-empty email body.' }
        $Payload = @{
            subject          = $Subject
            body             = $Body
            channel          = 'email'
            retention_policy = 'metadata_only'
        }

        $Response = Invoke-VeriTrustRequest `
            -Method Post `
            -Uri "$BaseUrl/api/v1/gateway/email/analyze-text" `
            -Headers $RequestHeaders `
            -ContentType 'application/json; charset=utf-8' `
            -Body ([Text.Encoding]::UTF8.GetBytes(($Payload | ConvertTo-Json -Compress))) `
            -TimeoutSec $TimeoutSec `
            -MaximumRedirection 0 `
            -ErrorAction Stop
    }

    if ($null -eq $Response -or $Response.ok -ne $true) {
        throw 'VeriTrust returned an incomplete email investigation response.'
    }
    if ($Response.PSObject.Properties['status'] -and $Response.status -eq 'processing' -and $Response.scan_id) {
        return ConvertTo-VeriTrustScanSummary $Response
    }
    if (-not $Response.PSObject.Properties['evidence'] -or -not $Response.evidence -or
        -not $Response.PSObject.Properties['gateway_decision'] -or -not $Response.gateway_decision -or
        -not $Response.PSObject.Properties['scan_id'] -or -not $Response.scan_id) {
        throw 'VeriTrust did not return the evidence, policy decision, and report ID required for a complete report.'
    }

    $Evidence = $Response.evidence
    $Decision = $Response.gateway_decision
    $ResultLabel = switch ([string] $Evidence.state) {
        'LIKELY_PHISHING' { 'Likely phishing' }
        'LIKELY_BENIGN'   { 'No strong phishing signs found' }
        'UNCERTAIN'       { 'Needs a closer look' }
        'UNSUPPORTED'     { 'Could not fully check this email' }
        default           { 'Check could not be completed' }
    }

    $RiskPercent = $null
    if ($null -ne $Decision -and $null -ne $Decision.risk) {
        $RiskValue = [double] $Decision.risk
        if ([double]::IsNaN($RiskValue) -or [double]::IsInfinity($RiskValue) -or $RiskValue -lt 0 -or $RiskValue -gt 1) {
            throw 'VeriTrust returned an invalid risk score.'
        }
        $RiskPercent = [Math]::Round(($RiskValue * 100), 1)
    }

    $Report = [PSCustomObject] @{
        Result            = $ResultLabel
        RiskPercent       = $RiskPercent
        RecommendedAction = [string] $Decision.recommendation
        InputType         = [string] $Evidence.input_mode
        MissingChecks     = @($Evidence.limitations).Count
        ReportId          = [string] $Response.scan_id
        TechnicalReport   = $Response
    }
    $DisplayProperties = [System.Management.Automation.PSPropertySet]::new(
        'DefaultDisplayPropertySet',
        [string[]] @('Result', 'RiskPercent', 'RecommendedAction', 'InputType', 'MissingChecks', 'ReportId')
    )
    $StandardMembers = [System.Management.Automation.PSMemberInfo[]] @($DisplayProperties)
    $Report | Add-Member -MemberType MemberSet -Name PSStandardMembers -Value $StandardMembers
    $Report
}

function Connect-VeriTrust {
    [CmdletBinding()]
    param([string] $BaseUrl = 'https://www.veritrustlab.in', [Security.SecureString] $ApiKey)
    $script:VeriTrustSession = $null
    $Origin = $null
    if (-not [Uri]::TryCreate($BaseUrl, [UriKind]::Absolute, [ref] $Origin) -or
        $Origin.Scheme -ne 'https' -or $Origin.UserInfo -or $Origin.Query -or $Origin.Fragment -or $Origin.AbsolutePath -ne '/') {
        throw 'Use a plain HTTPS origin, for example https://www.veritrustlab.in (without Markdown brackets).'
    }
    if (-not $ApiKey) { $ApiKey = Read-Host 'VeriTrust API key' -AsSecureString }
    $Credential = [Management.Automation.PSCredential]::new('VeriTrust', $ApiKey)
    $Key = $Credential.GetNetworkCredential().Password
    if ($Key -notmatch '^vtg_(live|test)_[A-Za-z0-9_-]{20,}$') { throw 'Invalid VeriTrust API key format.' }
    $BaseUrl = $Origin.GetLeftPart([UriPartial]::Authority)
    $Auth = Invoke-VeriTrustRequest -Uri "$BaseUrl/api/v1/gateway/scans?limit=1" -Headers @{ Authorization = "Bearer $Key" }
    if ($Auth.ok -ne $true) { throw 'VeriTrust authentication was not confirmed.' }
    $script:VeriTrustSession = @{ BaseUrl = $BaseUrl; Credential = $Credential }
    Write-Host 'Connected to VeriTrust.' -ForegroundColor Green
}

function ConvertTo-VeriTrustScanSummary {
    param($Response)
    $Risk = $null
    $Decision = $null
    if ($Response.PSObject.Properties['decision']) { $Decision = $Response.decision }
    if ($Decision -and $null -ne $Decision.risk) {
        $Value = [double] $Decision.risk
        if ([double]::IsNaN($Value) -or [double]::IsInfinity($Value) -or $Value -lt 0 -or $Value -gt 1) { throw 'Invalid risk score returned.' }
        $Risk = [Math]::Round(100 * $Value, 1)
    }
    $Report = [PSCustomObject]@{ Status = $Response.status; Result = $(if ($Decision) { $Decision.verdict } else { 'No decision available' });
        RiskPercent = $Risk; RecommendedAction = $(if ($Decision) { $Decision.recommendation } else { 'Review scan status' });
        ReportId = $Response.scan_id; TechnicalReport = $Response }
    $Display = [Management.Automation.PSPropertySet]::new('DefaultDisplayPropertySet', [string[]]@('Status','Result','RiskPercent','RecommendedAction','ReportId'))
    $Report | Add-Member -MemberType MemberSet -Name PSStandardMembers -Value ([Management.Automation.PSMemberInfo[]]@($Display))
    $Report
}

function vt {
    <# .SYNOPSIS
    Short commands: vt login; vt email email.eml; vt text "Message"; vt link https://example.com; vt image face.png; vt status SCAN_ID; vt logout.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Position=0, Mandatory)][ValidateSet('login','logout','email','text','link','image','status')][string] $Command,
        [Parameter(Position=1)][string] $InputValue,
        [string] $Subject = '',
        [ValidateRange(1,300)][int] $WaitSeconds = 90,
        [string] $IdempotencyKey = [Guid]::NewGuid().ToString()
    )
    $ErrorActionPreference = 'Stop'
    if ($Command -eq 'login') { Connect-VeriTrust; return }
    if ($Command -eq 'logout') { $script:VeriTrustSession = $null; Write-Host 'Disconnected.'; return }
    if (-not (Get-Variable VeriTrustSession -Scope Script -ErrorAction SilentlyContinue) -or -not $script:VeriTrustSession) { throw 'Run vt login first.' }
    if ([string]::IsNullOrWhiteSpace($InputValue)) { throw "Provide an input: vt $Command <value>." }
    $Base = $script:VeriTrustSession.BaseUrl
    $Headers = @{ Authorization = "Bearer $($script:VeriTrustSession.Credential.GetNetworkCredential().Password)" }
    try {
        if ($Command -in @('email','text')) {
            Write-Progress -Activity 'VeriTrust email analysis' -Status 'Waiting for the email service response'
            $Args = @{ IdempotencyKey = $IdempotencyKey; TimeoutSec = $WaitSeconds }
            if ($Command -eq 'email') { $Args.EmlPath = $InputValue } else { $Args.Body = $InputValue; $Args.Subject = $Subject }
            return Invoke-VeriTrustEmailInvestigation @Args
        }
        if ($Command -eq 'status') {
            $ScanId = [Guid]::Parse($InputValue).ToString()
            $Response = Invoke-VeriTrustRequest -Uri "$Base/api/v1/gateway/scans/$ScanId" -Headers $Headers
        } else {
            $Content = @{}
            if ($Command -eq 'link') {
                $Url = $null
                if (-not [Uri]::TryCreate($InputValue, [UriKind]::Absolute, [ref]$Url) -or $Url.Scheme -notin @('http','https') -or $Url.UserInfo) { throw 'Provide a valid HTTP or HTTPS URL.' }
                $Content.urls = @($InputValue)
            } else {
                $File = Get-Item -LiteralPath $InputValue -ErrorAction Stop
                $Types = @{ '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.png'='image/png'; '.webp'='image/webp'; '.bmp'='image/bmp' }
                $Mime = $Types[$File.Extension.ToLowerInvariant()]
                if ($File.PSIsContainer -or -not $Mime -or $File.Length -lt 1 -or $File.Length -gt 10MB) { throw 'Choose a JPG, PNG, WebP, or BMP image between 1 byte and 10 MB.' }
                Write-Progress -Activity 'VeriTrust analysis' -Status 'Registering private image upload'
                $Payload = @{kind='image'; mime_type=$Mime; size_bytes=$File.Length} | ConvertTo-Json -Compress
                $Upload = Invoke-VeriTrustRequest -Method Post -Uri "$Base/api/v1/gateway/uploads" -Headers $Headers -ContentType 'application/json' -Body $Payload
                $SignedUrl = [string]$Upload.signed_upload.url
                if ($SignedUrl.StartsWith('/')) {
                    $Config = Invoke-VeriTrustRequest -Uri "$Base/api/client-config"
                    $SignedUrl = $Config.config.supabase.url.TrimEnd('/') + '/storage/v1' + $SignedUrl
                }
                $UploadUri = $null
                if (-not [Uri]::TryCreate($SignedUrl,[UriKind]::Absolute,[ref]$UploadUri) -or $UploadUri.Scheme -ne 'https' -or $UploadUri.UserInfo) { throw 'The server returned an invalid private upload URL.' }
                Write-Progress -Activity 'VeriTrust analysis' -Status 'Uploading image to private storage'
                $null = Invoke-VeriTrustRequest -Method Put -Uri $SignedUrl -Headers @{'x-upsert'='false'} -ContentType $Mime -InFile $File.FullName
                $null = Invoke-VeriTrustRequest -Method Post -Uri "$Base/api/v1/gateway/uploads/$($Upload.upload_id)/complete" -Headers $Headers
                $Content.media = @(@{upload_id=$Upload.upload_id;kind='image'})
            }
            $Headers['Idempotency-Key'] = $IdempotencyKey
            Write-Progress -Activity 'VeriTrust analysis' -Status 'Submitting to Gateway'
            $Payload = @{schema_version='1.0';processing_mode='hybrid';content=$Content} | ConvertTo-Json -Depth 6 -Compress
            $Response = Invoke-VeriTrustRequest -Method Post -Uri "$Base/api/v1/gateway/scans" -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($Payload))
        }
        if ($Response.ok -ne $true -or -not $Response.scan_id) { throw 'The Gateway did not return a scan ID.' }
        $Clock = [Diagnostics.Stopwatch]::StartNew()
        while ($Response.status -notin @('completed','failed','cancelled','expired') -and $Clock.Elapsed.TotalSeconds -lt $WaitSeconds) {
            Write-Progress -Activity 'VeriTrust analysis' -Status "Server status: $($Response.status)"
            Start-Sleep -Seconds 2
            $Response = Invoke-VeriTrustRequest -Uri "$Base/api/v1/gateway/scans/$($Response.scan_id)" -Headers $Headers
            if ($Response.ok -ne $true -or -not $Response.scan_id) { throw 'The Gateway status response was incomplete.' }
        }
        ConvertTo-VeriTrustScanSummary $Response
    } finally { Write-Progress -Activity 'VeriTrust analysis' -Completed; Write-Progress -Activity 'VeriTrust email analysis' -Completed }
}
