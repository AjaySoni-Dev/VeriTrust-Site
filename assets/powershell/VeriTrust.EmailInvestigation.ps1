#requires -Version 5.1

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
        [string] $BaseUrl = 'https://www.veritrustlab.in'
    )

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
    $RequestHeaders = @{
        Authorization     = "Bearer $ApiKey"
        'Idempotency-Key' = [Guid]::NewGuid().ToString()
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

        $Response = Invoke-RestMethod `
            -Method Post `
            -Uri "$BaseUrl/api/v1/gateway/email/analyze-eml" `
            -Headers $RequestHeaders `
            -ContentType 'message/rfc822' `
            -InFile $EmailFile.FullName `
            -ErrorAction Stop
    }
    else {
        $Payload = @{
            subject          = $Subject
            body             = $Body
            channel          = 'email'
            retention_policy = 'metadata_only'
        }

        $Response = Invoke-RestMethod `
            -Method Post `
            -Uri "$BaseUrl/api/v1/gateway/email/analyze-text" `
            -Headers $RequestHeaders `
            -ContentType 'application/json' `
            -Body ($Payload | ConvertTo-Json -Compress) `
            -ErrorAction Stop
    }

    if ($null -eq $Response -or $Response.ok -ne $true) {
        throw 'VeriTrust returned an incomplete email investigation response.'
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
        $RiskPercent = [Math]::Round(([double] $Decision.risk * 100), 1)
    }

    [PSCustomObject] @{
        Result            = $ResultLabel
        RiskPercent       = $RiskPercent
        RecommendedAction = [string] $Decision.recommendation
        InputType         = [string] $Evidence.input_mode
        MissingChecks     = @($Evidence.limitations).Count
        ReportId          = [string] $Response.scan_id
        TechnicalReport   = $Response
    }
}
