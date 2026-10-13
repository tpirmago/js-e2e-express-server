$script:loggingCommandPrefix = '##vso['
$script:loggingCommandEscapeMappings = @( # TODO: WHAT ABOUT "="? WHAT ABOUT "%"?
    New-Object psobject -Property @{ Token = ';' ; Replacement = '%3B' }
    New-Object psobject -Property @{ Token = "`r" ; Replacement = '%0D' }
    New-Object psobject -Property @{ Token = "`n" ; Replacement = '%0A' }
    New-Object psobject -Property @{ Token = "]" ; Replacement = '%5D' }
)
# TODO: BUG: Escape % ???
# TODO: Add test to verify don't need to escape "=".

$commandCorrelationId = $env:COMMAND_CORRELATION_ID
if ($null -ne $commandCorrelationId)
{
    [System.Environment]::SetEnvironmentVariable("COMMAND_CORRELATION_ID", $null)
}

$IssueSources = @{
    CustomerScript = "CustomerScript"
    TaskInternal = "TaskInternal"
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-AddAttachment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Type,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'addattachment' -Data $Path -Properties @{
            'type' = $Type
            'name' = $Name
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UploadSummary {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'uploadsummary' -Data $Path -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-SetEndpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Id,
        [Parameter(Mandatory = $true)]
        [string]$Field,
        [Parameter(Mandatory = $true)]
        [string]$Key,
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'setendpoint' -Data $Value -Properties @{
            'id' = $Id
            'field' = $Field
            'key' = $Key
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-AddBuildTag {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'build' -Event 'addbuildtag' -Data $Value -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-AssociateArtifact {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Type,
        [hashtable]$Properties,
        [switch]$AsOutput)

    $p = @{ }
    if ($Properties) {
        foreach ($key in $Properties.Keys) {
            $p[$key] = $Properties[$key]
        }
    }

    $p['artifactname'] = $Name
    $p['artifacttype'] = $Type
    Write-LoggingCommand -Area 'artifact' -Event 'associate' -Data $Path -Properties $p -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-LogDetail {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [guid]$Id,
        $ParentId,
        [string]$Type,
        [string]$Name,
        $Order,
        $StartTime,
        $FinishTime,
        $Progress,
        [ValidateSet('Unknown', 'Initialized', 'InProgress', 'Completed')]
        [Parameter()]
        $State,
        [ValidateSet('Succeeded', 'SucceededWithIssues', 'Failed', 'Cancelled', 'Skipped')]
        [Parameter()]
        $Result,
        [string]$Message,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'logdetail' -Data $Message -Properties @{
            'id' = $Id
            'parentid' = $ParentId
            'type' = $Type
            'name' = $Name
            'order' = $Order
            'starttime' = $StartTime
            'finishtime' = $FinishTime
            'progress' = $Progress
            'state' = $State
            'result' = $Result
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-SetProgress {
    [CmdletBinding()]
    param(
        [ValidateRange(0, 100)]
        [Parameter(Mandatory = $true)]
        [int]$Percent,
        [string]$CurrentOperation,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'setprogress' -Data $CurrentOperation -Properties @{
            'value' = $Percent
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-SetResult {
    [CmdletBinding(DefaultParameterSetName = 'AsOutput')]
    param(
        [ValidateSet("Succeeded", "SucceededWithIssues", "Failed", "Cancelled", "Skipped")]
        [Parameter(Mandatory = $true)]
        [string]$Result,
        [string]$Message,
        [Parameter(ParameterSetName = 'AsOutput')]
        [switch]$AsOutput,
        [Parameter(ParameterSetName = 'DoNotThrow')]
        [switch]$DoNotThrow)

    Write-LoggingCommand -Area 'task' -Event 'complete' -Data $Message -Properties @{
            'result' = $Result
        } -AsOutput:$AsOutput
    if ($Result -eq 'Failed' -and !$AsOutput -and !$DoNotThrow) {
        # Special internal exception type to control the flow. Not currently intended
        # for public usage and subject to change.
        throw (New-Object VstsTaskSdk.TerminationException($Message))
    }
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-SetSecret {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'setsecret' -Data $Value -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-SetVariable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [string]$Value,
        [switch]$Secret,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'setvariable' -Data $Value -Properties @{
            'variable' = $Name
            'issecret' = $Secret
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-TaskDebug {
    [CmdletBinding()]
    param(
        [string]$Message,
        [switch]$AsOutput)

    Write-TaskDebug_Internal @PSBoundParameters
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-TaskError {
    [CmdletBinding()]
    param(
        [string]$Message,
        [string]$ErrCode,
        [string]$SourcePath,
        [string]$LineNumber,
        [string]$ColumnNumber,
        [switch]$AsOutput,
        [string]$IssueSource)

    Write-LogIssue -Type error @PSBoundParameters
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-TaskVerbose {
    [CmdletBinding()]
    param(
        [string]$Message,
        [switch]$AsOutput)

    Write-TaskDebug_Internal @PSBoundParameters -AsVerbose
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-TaskWarning {
    [CmdletBinding()]
    param(
        [string]$Message,
        [string]$ErrCode,
        [string]$SourcePath,
        [string]$LineNumber,
        [string]$ColumnNumber,
        [switch]$AsOutput,
        [string]$IssueSource)

    Write-LogIssue -Type warning @PSBoundParameters
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UploadFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'uploadfile' -Data $Path -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-PrependPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'task' -Event 'prependpath' -Data $Path -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UpdateBuildNumber {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'build' -Event 'updatebuildnumber' -Data $Value -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UploadArtifact {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerFolder,
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'artifact' -Event 'upload' -Data $Path -Properties @{
            'containerfolder' = $ContainerFolder
            'artifactname' = $Name
        } -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UploadBuildLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'build' -Event 'uploadlog' -Data $Path -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-UpdateReleaseName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [switch]$AsOutput)

    Write-LoggingCommand -Area 'release' -Event 'updatereleasename' -Data $Name -AsOutput:$AsOutput
}

<#
.SYNOPSIS
See https://github.com/Microsoft/vsts-tasks/blob/master/docs/authoring/commands.md

.PARAMETER AsOutput
Indicates whether to write the logging command directly to the host or to the output pipeline.
#>
function Write-LoggingCommand {
    [CmdletBinding(DefaultParameterSetName = 'Parameters')]
    param(
        [Parameter(Mandatory = $true, ParameterSetName = 'Parameters')]
        [string]$Area,
        [Parameter(Mandatory = $true, ParameterSetName = 'Parameters')]
        [string]$Event,
        [Parameter(ParameterSetName = 'Parameters')]
        [string]$Data,
        [Parameter(ParameterSetName = 'Parameters')]
        [hashtable]$Properties,
        [Parameter(Mandatory = $true, ParameterSetName = 'Object')]
        $Command,
        [switch]$AsOutput)

    if ($PSCmdlet.ParameterSetName -eq 'Object') {
        Write-LoggingCommand -Area $Command.Area -Event $Command.Event -Data $Command.Data -Properties $Command.Properties -AsOutput:$AsOutput
        return
    }

    $command = Format-LoggingCommand -Area $Area -Event $Event -Data $Data -Properties $Properties
    if ($AsOutput) {
        $command
    } else {
        Write-Host $command
    }
}

########################################
# Private functions.
########################################
function Format-LoggingCommandData {
    [CmdletBinding()]
    param([string]$Value, [switch]$Reverse)

    if (!$Value) {
        return ''
    }

    if (!$Reverse) {
        foreach ($mapping in $script:loggingCommandEscapeMappings) {
            $Value = $Value.Replace($mapping.Token, $mapping.Replacement)
        }
    } else {
        for ($i = $script:loggingCommandEscapeMappings.Length - 1 ; $i -ge 0 ; $i--) {
            $mapping = $script:loggingCommandEscapeMappings[$i]
            $Value = $Value.Replace($mapping.Replacement, $mapping.Token)
        }
    }

    return $Value
}

function Format-LoggingCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Area,
        [Parameter(Mandatory = $true)]
        [string]$Event,
        [string]$Data,
        [hashtable]$Properties)

    # Append the preamble.
    [System.Text.StringBuilder]$sb = New-Object -TypeName System.Text.StringBuilder
    $null = $sb.Append($script:loggingCommandPrefix).Append($Area).Append('.').Append($Event)

    # Append the properties.
    if ($Properties) {
        $first = $true
        foreach ($key in $Properties.Keys) {
            [string]$value = Format-LoggingCommandData $Properties[$key]
            if ($value) {
                if ($first) {
                    $null = $sb.Append(' ')
                    $first = $false
                } else {
                    $null = $sb.Append(';')
                }

                $null = $sb.Append("$key=$value")
            }
        }
    }

    # Append the tail and output the value.
    $Data = Format-LoggingCommandData $Data
    $sb.Append(']').Append($Data).ToString()
}

function Write-LogIssue {
    [CmdletBinding()]
    param(
        [ValidateSet('warning', 'error')]
        [Parameter(Mandatory = $true)]
        [string]$Type,
        [string]$Message,
        [string]$ErrCode,
        [string]$SourcePath,
        [string]$LineNumber,
        [string]$ColumnNumber,
        [switch]$AsOutput,
        [AllowNull()]
        [ValidateSet('CustomerScript', 'TaskInternal')]
        [string]$IssueSource = $IssueSources.TaskInternal)

    $command = Format-LoggingCommand -Area 'task' -Event 'logissue' -Data $Message -Properties @{
            'type' = $Type
            'code' = $ErrCode
            'sourcepath' = $SourcePath
            'linenumber' = $LineNumber
            'columnnumber' = $ColumnNumber
            'source' = $IssueSource
            'correlationId' = $commandCorrelationId
        }
    if ($AsOutput) {
        return $command
    }

    if ($Type -eq 'error') {
        $foregroundColor = $host.PrivateData.ErrorForegroundColor
        $backgroundColor = $host.PrivateData.ErrorBackgroundColor
        if ($foregroundColor -isnot [System.ConsoleColor] -or $backgroundColor -isnot [System.ConsoleColor]) {
            $foregroundColor = [System.ConsoleColor]::Red
            $backgroundColor = [System.ConsoleColor]::Black
        }
    } else {
        $foregroundColor = $host.PrivateData.WarningForegroundColor
        $backgroundColor = $host.PrivateData.WarningBackgroundColor
        if ($foregroundColor -isnot [System.ConsoleColor] -or $backgroundColor -isnot [System.ConsoleColor]) {
            $foregroundColor = [System.ConsoleColor]::Yellow
            $backgroundColor = [System.ConsoleColor]::Black
        }
    }

    Write-Host $command -ForegroundColor $foregroundColor -BackgroundColor $backgroundColor
}

function Write-TaskDebug_Internal {
    [CmdletBinding()]
    param(
        [string]$Message,
        [switch]$AsVerbose,
        [switch]$AsOutput)

    $command = Format-LoggingCommand -Area 'task' -Event 'debug' -Data $Message
    if ($AsOutput) {
        return $command
    }

    if ($AsVerbose) {
        $foregroundColor = $host.PrivateData.VerboseForegroundColor
        $backgroundColor = $host.PrivateData.VerboseBackgroundColor
        if ($foregroundColor -isnot [System.ConsoleColor] -or $backgroundColor -isnot [System.ConsoleColor]) {
            $foregroundColor = [System.ConsoleColor]::Cyan
            $backgroundColor = [System.ConsoleColor]::Black
        }
    } else {
        $foregroundColor = $host.PrivateData.DebugForegroundColor
        $backgroundColor = $host.PrivateData.DebugBackgroundColor
        if ($foregroundColor -isnot [System.ConsoleColor] -or $backgroundColor -isnot [System.ConsoleColor]) {
            $foregroundColor = [System.ConsoleColor]::DarkGray
            $backgroundColor = [System.ConsoleColor]::Black
        }
    }

    Write-Host -Object $command -ForegroundColor $foregroundColor -BackgroundColor $backgroundColor
}

# SIG # Begin signature block
# MIInRgYJKoZIhvcNAQcCoIInNzCCJzMCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCDPee4vJl8WXb3v
# KoFk8vNh1hTyd5u4cCxaDmpgh07B6qCCDLowggX1MIID3aADAgECAhMzAAACHU0Z
# yE7XD1dIAAAAAAIdMA0GCSqGSIb3DQEBCwUAMFcxCzAJBgNVBAYTAlVTMR4wHAYD
# VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jvc29mdCBD
# b2RlIFNpZ25pbmcgUENBIDIwMjQwHhcNMjYwNDE2MTg1OTQzWhcNMjcwNDE1MTg1
# OTQzWjB0MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
# BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMR4wHAYD
# VQQDExVNaWNyb3NvZnQgQ29ycG9yYXRpb24wggEiMA0GCSqGSIb3DQEBAQUAA4IB
# DwAwggEKAoIBAQDQvewXxx9gZZFC6Ys1WBay8BJ8kGA4JQnH5CMafqOASlTpK9H8
# o5ZXTXt0caVQTNMUPt445wXYD+dFtaKWTwDn1I52oUSrC9vJin1Gsqt+zyKJL5Dg
# 3eQXbQNR61DmMy20GLTIO3SFed9Rfi/ophgCLGFLDR3r0KvHjwMb/jYWS0celV/4
# Lz27LfAekm8v9E5IXaeiXbAUYZKK090n4CVl3JBtbN+9DtI9SNu/yjvozW52/u7R
# X/Ttpa/KDlpuokZ+Zcbvmtd9ur9gFLvZzh41o9MsE/clQtdaFWGvuo6Jua/ntpgk
# ey3E5/vBFe+MJPG6phdnuo6r57ZudCudiI1bAgMBAAGjggGbMIIBlzAOBgNVHQ8B
# Af8EBAMCB4AwHwYDVR0lBBgwFgYKKwYBBAGCN0wIAQYIKwYBBQUHAwMwHQYDVR0O
# BBYEFH6QuMwqcPG0hQlQ6c5jCtTTLrVeMEUGA1UdEQQ+MDykOjA4MR4wHAYDVQQL
# ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xFjAUBgNVBAUTDTIzMDAxMis1MDc1NTkw
# HwYDVR0jBBgwFoAUf1k/VCHarU/vBeXmo9ctBpQSCDEwYAYDVR0fBFkwVzBVoFOg
# UYZPaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9wcy9jcmwvTWljcm9zb2Z0
# JTIwQ29kZSUyMFNpZ25pbmclMjBQQ0ElMjAyMDI0LmNybDBtBggrBgEFBQcBAQRh
# MF8wXQYIKwYBBQUHMAKGUWh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMv
# Y2VydHMvTWljcm9zb2Z0JTIwQ29kZSUyMFNpZ25pbmclMjBQQ0ElMjAyMDI0LmNy
# dDAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4ICAQBKTbYOjzwTG/DXGaz9
# s6+fQeaTtDcFmMY+5UyVFCyj7Pv+5i37qfX8lSL/tBIfYQfWsMuBQlfZurJD6r4H
# VJ2CeH+1fgiq8dcHdVKoZ3Sa2qXoX3cq9iS8cVb06B7+5/XJ7I0OxHH9fDsvJ3T3
# w5V/ZtAIFmLrl+P0CtG+92uzRsn0nTbdFjOkLMLWPLAU3THohKRlSEMgFJpPkm5n
# 5UAZ35xX6FWCrDLsSKb555bTifwa8mJBwdlof0bmfYidH+dxZ1FdDxvLnNl9zeKs
# A4kejaaIqqIPguhwAti5Ql7BlTNoJNwxCvBmqW2MQLnCkYN/VVUsR3V2x/rcTNzo
# Bf/Z/SpROvdaA2ZOOd1uioXJt3tdLQ7vHpqpib0KfWr/FWXW10q38VxfCnRQBqzb
# SuztR7nEMuzX7Ck+B/XaPDXd1qh72+QYyB0Z2VzWmO9zsnb9Uq/dwu8LGeQqnyu6
# 7SDGACvnXii2fb9+US492VTnXSnFKyqwgzUyFMtZK1/sHYTv6bG4TtQUygQxTN+Z
# V+aJIlKO2MqZ7bKrAnOzS9m6NgoTdWOq11bTOZwKlIEV/EhV9SWkDmdpR/hPPT2v
# 6TEj4F8PT/zHjRezIU5c/DGlt/VhY/pK0XkJtEyMmmS1BMtjU/rqBZVMIm3dnxQs
# /TBByr+Cf8Z1r7aifQVQ+WSqzjCCBr0wggSloAMCAQICEzMAAAA5O7Y3Gb8GHWcA
# AAAAADkwDQYJKoZIhvcNAQEMBQAwgYgxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
# YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQg
# Q29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBSb290IENlcnRpZmljYXRl
# IEF1dGhvcml0eSAyMDExMB4XDTI0MDgwODIwNTQxOFoXDTM2MDMyMjIyMTMwNFow
# VzELMAkGA1UEBhMCVVMxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEo
# MCYGA1UEAxMfTWljcm9zb2Z0IENvZGUgU2lnbmluZyBQQ0EgMjAyNDCCAiIwDQYJ
# KoZIhvcNAQEBBQADggIPADCCAgoCggIBANgBnB7jOMeqlRYHNa265v4IY9fH8TKh
# emHfPINe1gpLaV3dhg324WwH06LcHbpnsBukCDNitryo0dtS/EW6I/yEL/bLSY8h
# KpbfQuWusBPr9qazYcDxCW/qnjb5JsI1s8bNOg3bVATvQVL4tcf03aTycsz8QeCd
# M0l/yHRObJ9QqazM1r6VPEOJ7LL+uEEb73w6QCuhs89a1uv1zerOYMnsneRRwCbp
# yW11IcggU0cRKDDq1pjVJzIbIF6+oiXXbReOsgeI8zu1FyQfK0fVkaya8SmVHQ/t
# Of23mZ4W9k0Ri22QW9p3UgSC5OUDktKxxcCmGL6tXLfOGSWHIIV4YrTJTT6PNty5
# REojHJuZHArkF9VnHTERWoTjAzfI3kP+5b4alUdhgAZ7ttOu1bVnXfHaqPYl2rPs
# 20ji03LOVWsh/radgE17es5hL+t6lV0eVHrVhsssROWJuz2MXMCt7iw7lFPG9LXK
# Gjsmonn2gotGdHIuEg5JnJMJVmixd5LRlkmgYRZKzhxSCwyoGIq0PhaA7Y+VPct5
# pCHkijcIIDm0nlkK+0KyepolcqGm0T/GYQRMhHJlGOOmVQop36wUVUYklUy++vDW
# eEgEo4s7hxN6mIbf2MSIQ/iIfMZgJxC69oukMUXCrOC3SkE/xIkgpfl22MM1itkZ
# 35nNXkMolU1lAgMBAAGjggFOMIIBSjAOBgNVHQ8BAf8EBAMCAYYwEAYJKwYBBAGC
# NxUBBAMCAQAwHQYDVR0OBBYEFH9ZP1Qh2q1P7wXl5qPXLQaUEggxMBkGCSsGAQQB
# gjcUAgQMHgoAUwB1AGIAQwBBMA8GA1UdEwEB/wQFMAMBAf8wHwYDVR0jBBgwFoAU
# ci06AjGQQ7kUBU7h6qfHMdEjiTQwWgYDVR0fBFMwUTBPoE2gS4ZJaHR0cDovL2Ny
# bC5taWNyb3NvZnQuY29tL3BraS9jcmwvcHJvZHVjdHMvTWljUm9vQ2VyQXV0MjAx
# MV8yMDExXzAzXzIyLmNybDBeBggrBgEFBQcBAQRSMFAwTgYIKwYBBQUHMAKGQmh0
# dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2kvY2VydHMvTWljUm9vQ2VyQXV0MjAx
# MV8yMDExXzAzXzIyLmNydDANBgkqhkiG9w0BAQwFAAOCAgEAFJQfOChP7onn6fLI
# MKrSlN1WYKwDFgAddymOUO3FrM8d7B/W/iQ6DxXsDn7D5W4wMwYeLystcEqfkjz4
# NURRgazyMu5yRzQh4LqjA4tStTcJh1opExo7nn5PuPBYnbu0+THSuVHTe0VTTPVh
# ily/piFrDo3axQ9P4C+Ol5yet+2gTfekICS5xS+cYfSIvgn0JksVBVMYVI5QFu/q
# hnLhsEFEUzG8fvv0hjgkO+lkpV9ty6GkN4vdnd7ya6Q6aR9y34aiM1qmxaxBi6OU
# nyNl6fkuun/diTFnYDLTppOkr/mg5WSfCiDVMNCxtj4wPKC5OmHm1DQIt/MNokbb
# H3UGsFP1QbzsLocuSqLCvH09Io3fDPTmscR9Y75G4qX7RTX8AdBPo0I6OEojf39z
# uFZt0qOHm65YWQE69cZM2ueE1MB05dNNgHK9gTE7zKvK/fg8B2qjW88MT/WF5V5u
# vZGtqa9FSL2RazArA+rDPuf6JGYz4HpgMZHB4S6szWSKYBv0VisCzfxgeU+dquXW
# 9bd0auYlOB58DPcOYKdc3Se94g+xL4pcEhbB54JOgAkwYTu/9dLeH2pDqeJZAABV
# DWRQCaXfO5LgyKwKCLYXpigrZYCjUSBcr+Ve8PFWMhVTQl0v4q8J/AUmQN5W4n10
# 1cY2L4A7GTQG1h32HHAvfQESWP0xghniMIIZ3gIBATBuMFcxCzAJBgNVBAYTAlVT
# MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jv
# c29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMjQCEzMAAAIdTRnITtcPV0gAAAAAAh0w
# DQYJYIZIAWUDBAIBBQCgga4wGQYJKoZIhvcNAQkDMQwGCisGAQQBgjcCAQQwHAYK
# KwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZIhvcNAQkEMSIEIHfw9La0
# biySOtVeZcsDNQNaTYgAvnJkIfLAJ/ZffOmfMEIGCisGAQQBgjcCAQwxNDAyoBSA
# EgBNAGkAYwByAG8AcwBvAGYAdKEagBhodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20w
# DQYJKoZIhvcNAQEBBQAEggEAGtUUnPrKrq0aEMlZNxCUf5HTrz0G+t82FpQjRHh/
# P7ruhHN1MFzVXHWgoKs3uc2vrWnq32hGQC5R9ksN8ObpH1MzQ/qkKXjCxyPN5ozb
# TMI7JOX6ZV3sRL6svqXtaSMtXkyUPyYzalsjQUbngkh6ibHL7RjpPMu9E2kaEbQ6
# lX3p8/iWCcF/HTzMB3yCaEIiZEzh4+dLjX7QrGVSmn+z3/Xt+B/DGsS9/vaRpXrP
# M4DZkm0zhWt0HPr+hRESjqBQt2gMjMZoDS57td4ewVGfA9ZWrQ9x+9OE2L0zm7IR
# Y6wrWi2x0Ec8rmdL3J2xMRV6Dk7vOZ67wFJFl2enRfZEQaGCF5QwgheQBgorBgEE
# AYI3AwMBMYIXgDCCF3wGCSqGSIb3DQEHAqCCF20wghdpAgEDMQ8wDQYJYIZIAWUD
# BAIBBQAwggFSBgsqhkiG9w0BCRABBKCCAUEEggE9MIIBOQIBAQYKKwYBBAGEWQoD
# ATAxMA0GCWCGSAFlAwQCAQUABCAhyhiz5fIhQAUWJoimH3/el2OF/pHlgENh2kYz
# IOTOvQIGaqk16NlsGBMyMDI2MDkyMjEyNDQ1My44ODVaMASAAgH0oIHRpIHOMIHL
# MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVk
# bW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSUwIwYDVQQLExxN
# aWNyb3NvZnQgQW1lcmljYSBPcGVyYXRpb25zMScwJQYDVQQLEx5uU2hpZWxkIFRT
# UyBFU046QTQwMC0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1pY3Jvc29mdCBUaW1lLVN0
# YW1wIFNlcnZpY2WgghHqMIIHIDCCBQigAwIBAgITMwAAAijwpYfX88geQAABAAAC
# KDANBgkqhkiG9w0BAQsFADB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGlu
# Z3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBv
# cmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAxMDAe
# Fw0yNjAyMTkxOTQwMDZaFw0yNzA1MTcxOTQwMDZaMIHLMQswCQYDVQQGEwJVUzET
# MBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMV
# TWljcm9zb2Z0IENvcnBvcmF0aW9uMSUwIwYDVQQLExxNaWNyb3NvZnQgQW1lcmlj
# YSBPcGVyYXRpb25zMScwJQYDVQQLEx5uU2hpZWxkIFRTUyBFU046QTQwMC0wNUUw
# LUQ5NDcxJTAjBgNVBAMTHE1pY3Jvc29mdCBUaW1lLVN0YW1wIFNlcnZpY2UwggIi
# MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQCujvbk/sqcCSReZaJfCuf1NwRc
# c7XknhE6wkLofkNj1mxEAg35qy2xcFjgjartVvA09W8QHcpyMqVSXOTxNHJsmk0q
# P2CDLvUAulWg7aS5oBORpEX1oz3n0R2nPqeH0IHK1zJxjxaHW21AbuZ0Z+wM3WYN
# zkBlcHmVe03ZG7rlk28h72r5P5ME8FGpFmYW5Hl7psKbgLEfrYAitpttsb+sZsBU
# I+hMKl4uLJYotKyZv1ewOIinBfRU8QosivjofaBezUf9NdV+iGrWh321WnSsK3A/
# Jl6GLtbSWXcJWULgbxuqnobPK+YlB3174TMWTgX4YWjG7o0Otz/pjHNCKBbB788d
# ynhLdGY6B08E9+4SGrRpsty4iJHOydHCA5M4i5yYRwsdut+gmvxIpT8yNXJcjJCg
# 0vO8mv/nFY9Wytv2qmCtCFFivGUWqU20/sUeRooQZGiQOJQn095Cj3isIsvRP8KU
# 7hN/EDI8HVsb/NPzMFLvRznrRnj0TOnDiOTUcnYwmk+XfoS1owskcCCCwHnbC00D
# 58z83y7K5ZJB745hcn4CE2nR3e6RGsr42y5qtt6Mdz/s7MTnDS2UmVHWX1X/HZe3
# UlX8gj/t63L50xIPqkRCBEdM1ADNUaSfo9OQiKb/bj1diZCGTfEDUBBLop1mhkwI
# F82faplV2busZ+U4kQIDAQABo4IBSTCCAUUwHQYDVR0OBBYEFKrJpYz48tzouvVk
# BVthASFpQ93DMB8GA1UdIwQYMBaAFJ+nFV0AXmJdg/Tl0mWnG1M1GelyMF8GA1Ud
# HwRYMFYwVKBSoFCGTmh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvY3Js
# L01pY3Jvc29mdCUyMFRpbWUtU3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNybDBsBggr
# BgEFBQcBAQRgMF4wXAYIKwYBBQUHMAKGUGh0dHA6Ly93d3cubWljcm9zb2Z0LmNv
# bS9wa2lvcHMvY2VydHMvTWljcm9zb2Z0JTIwVGltZS1TdGFtcCUyMFBDQSUyMDIw
# MTAoMSkuY3J0MAwGA1UdEwEB/wQCMAAwFgYDVR0lAQH/BAwwCgYIKwYBBQUHAwgw
# DgYDVR0PAQH/BAQDAgeAMA0GCSqGSIb3DQEBCwUAA4ICAQCQ6NfLmrRahgVtgWg3
# 83GaS07fHyod6bhcUONt2tet+6BaNuH0r7ABkVHheOpxBdrUrOEYVEaIii9dK3cu
# ZLNmp1iUAx/VbmOZYl7xz+tNrjCWqrg1jQmq0oRB8iE4QJpwNhGP67oY5huYIU0D
# 4lhDoahqfgKJn/0Bk+9UKDPw5XlUYmreFmJlj9YQzcPPep8MxBXxh/Y5I7vQeRaW
# 5SjtiLQOLRk3ggvraDs5Sf49MJV6/BwxXC2rvUfEFX6SUDooqKIE9NgVIRq0RZu7
# Ot0i0Is+HvPP0hB6KwOxMg1SWKOfTtFpWpdo8MJvgKCHkPpXEzgprP+pyIHuO7gV
# RlSTsbYBFLh2yId/itM4uYL0R+2SSBBTpSSRthrGuEmElI5BCHMxzMg/oqHSPwZA
# IAkM2C4xxi0St7qMuA+m+ZzFYkfoF41QoSJn+HjqhqWYQ0m/SO9/KnJRJJUwMd5T
# iMnjZ+E/DJiUry5udiWyQpvfj2hQFI0djhahoAXDazeEciLF2uEnTur9UfjcwOun
# /oMY+ULftnOi2jKLMrreV097akzz/JxpnDgYJU/tgU7fQflg7IqiL9+0276+joQH
# o21mVeY5YD8Kh/kUaY6Jm/OTM88G7evTz/qnRumxovTjMStvpbAHNRhmSTdIPTV3
# 2CyuxDKS/V5a5iwA+f9ViBo+wjCCB3EwggVZoAMCAQICEzMAAAAVxedrngKbSZkA
# AAAAABUwDQYJKoZIhvcNAQELBQAwgYgxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
# YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQg
# Q29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBSb290IENlcnRpZmljYXRl
# IEF1dGhvcml0eSAyMDEwMB4XDTIxMDkzMDE4MjIyNVoXDTMwMDkzMDE4MzIyNVow
# fDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
# ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMd
# TWljcm9zb2Z0IFRpbWUtU3RhbXAgUENBIDIwMTAwggIiMA0GCSqGSIb3DQEBAQUA
# A4ICDwAwggIKAoICAQDk4aZM57RyIQt5osvXJHm9DtWC0/3unAcH0qlsTnXIyjVX
# 9gF/bErg4r25PhdgM/9cT8dm95VTcVrifkpa/rg2Z4VGIwy1jRPPdzLAEBjoYH1q
# UoNEt6aORmsHFPPFdvWGUNzBRMhxXFExN6AKOG6N7dcP2CZTfDlhAnrEqv1yaa8d
# q6z2Nr41JmTamDu6GnszrYBbfowQHJ1S/rboYiXcag/PXfT+jlPP1uyFVk3v3byN
# pOORj7I5LFGc6XBpDco2LXCOMcg1KL3jtIckw+DJj361VI/c+gVVmG1oO5pGve2k
# rnopN6zL64NF50ZuyjLVwIYwXE8s4mKyzbnijYjklqwBSru+cakXW2dg3viSkR4d
# Pf0gz3N9QZpGdc3EXzTdEonW/aUgfX782Z5F37ZyL9t9X4C626p+Nuw2TPYrbqgS
# Uei/BQOj0XOmTTd0lBw0gg/wEPK3Rxjtp+iZfD9M269ewvPV2HM9Q07BMzlMjgK8
# QmguEOqEUUbi0b1qGFphAXPKZ6Je1yh2AuIzGHLXpyDwwvoSCtdjbwzJNmSLW6Cm
# gyFdXzB0kZSU2LlQ+QuJYfM2BjUYhEfb3BvR/bLUHMVr9lxSUV0S2yW6r1AFemzF
# ER1y7435UsSFF5PAPBXbGjfHCBUYP3irRbb1Hode2o+eFnJpxq57t7c+auIurQID
# AQABo4IB3TCCAdkwEgYJKwYBBAGCNxUBBAUCAwEAATAjBgkrBgEEAYI3FQIEFgQU
# KqdS/mTEmr6CkTxGNSnPEP8vBO4wHQYDVR0OBBYEFJ+nFV0AXmJdg/Tl0mWnG1M1
# GelyMFwGA1UdIARVMFMwUQYMKwYBBAGCN0yDfQEBMEEwPwYIKwYBBQUHAgEWM2h0
# dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvRG9jcy9SZXBvc2l0b3J5Lmh0
# bTATBgNVHSUEDDAKBggrBgEFBQcDCDAZBgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMA
# QTALBgNVHQ8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAfBgNVHSMEGDAWgBTV9lbL
# j+iiXGJo0T2UkFvXzpoYxDBWBgNVHR8ETzBNMEugSaBHhkVodHRwOi8vY3JsLm1p
# Y3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0cy9NaWNSb29DZXJBdXRfMjAxMC0w
# Ni0yMy5jcmwwWgYIKwYBBQUHAQEETjBMMEoGCCsGAQUFBzAChj5odHRwOi8vd3d3
# Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL01pY1Jvb0NlckF1dF8yMDEwLTA2LTIz
# LmNydDANBgkqhkiG9w0BAQsFAAOCAgEAnVV9/Cqt4SwfZwExJFvhnnJL/Klv6lwU
# tj5OR2R4sQaTlz0xM7U518JxNj/aZGx80HU5bbsPMeTCj/ts0aGUGCLu6WZnOlNN
# 3Zi6th542DYunKmCVgADsAW+iehp4LoJ7nvfam++Kctu2D9IdQHZGN5tggz1bSNU
# 5HhTdSRXud2f8449xvNo32X2pFaq95W2KFUn0CS9QKC/GbYSEhFdPSfgQJY4rPf5
# KYnDvBewVIVCs/wMnosZiefwC2qBwoEZQhlSdYo2wh3DYXMuLGt7bj8sCXgU6ZGy
# qVvfSaN0DLzskYDSPeZKPmY7T7uG+jIa2Zb0j/aRAfbOxnT99kxybxCrdTDFNLB6
# 2FD+CljdQDzHVG2dY3RILLFORy3BFARxv2T5JL5zbcqOCb2zAVdJVGTZc9d/HltE
# AY5aGZFrDZ+kKNxnGSgkujhLmm77IVRrakURR6nxt67I6IleT53S0Ex2tVdUCbFp
# AUR+fKFhbHP+CrvsQWY9af3LwUFJfn6Tvsv4O+S3Fb+0zj6lMVGEvL8CwYKiexcd
# FYmNcP7ntdAoGokLjzbaukz5m/8K6TT4JDVnK+ANuOaMmdbhIurwJ0I9JZTmdHRb
# atGePu1+oDEzfbzL6Xu/OHBE0ZDxyKs6ijoIYn/ZcGNTTY3ugm2lBRDBcQZqELQd
# VTNYs6FwZvKhggNNMIICNQIBATCB+aGB0aSBzjCByzELMAkGA1UEBhMCVVMxEzAR
# BgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
# Y3Jvc29mdCBDb3Jwb3JhdGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJpY2Eg
# T3BlcmF0aW9uczEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNOOkE0MDAtMDVFMC1E
# OTQ3MSUwIwYDVQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNloiMKAQEw
# BwYFKw4DAhoDFQB1rbmFkzS7qAK1Oav08AUnhbNIUqCBgzCBgKR+MHwxCzAJBgNV
# BAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
# HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jvc29m
# dCBUaW1lLVN0YW1wIFBDQSAyMDEwMA0GCSqGSIb3DQEBCwUAAgUA7lzuEDAiGA8y
# MDI2MDkyMjEyMDc0NFoYDzIwMjYwOTIzMTIwNzQ0WjB0MDoGCisGAQQBhFkKBAEx
# LDAqMAoCBQDuXO4QAgEAMAcCAQACAijEMAcCAQACAhKmMAoCBQDuXj+QAgEAMDYG
# CisGAQQBhFkKBAIxKDAmMAwGCisGAQQBhFkKAwKgCjAIAgEAAgMHoSChCjAIAgEA
# AgMBhqAwDQYJKoZIhvcNAQELBQADggEBABFJcO4dgTV+/vjQ0shISXowMrghLzgr
# cAZaw8eTU3Cqm10hWmVNqdtry4VvTRnUPneV9c2KuS1K30aUom9m/RLM+MzBcomB
# bOfypRgYEW2mAUwT3zsKPPqkjRfJ6dWJt2U60/+1eniGj1PcY/piKfcm33O7xpVE
# dZiR9Ta+0L74j/qjXvdrI5UWaoyND0aLXTsryInPCOX58kv8uDjFJdr2PZH4WExt
# iq7mawKD6VDeZk/UAew7oJvWQoLNeK99XQpxErbF8lDGQG7CweY8sDOnvfFybt7F
# b5jA4etDJyhGO1OZQj5vQf7Xitsu5hyn1uOc2RCwY+/cXxD/jhN5crsxggQNMIIE
# CQIBATCBkzB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4G
# A1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSYw
# JAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAxMAITMwAAAijwpYfX
# 88geQAABAAACKDANBglghkgBZQMEAgEFAKCCAUowGgYJKoZIhvcNAQkDMQ0GCyqG
# SIb3DQEJEAEEMC8GCSqGSIb3DQEJBDEiBCAujrceRYXicM2vGlp4bITre06Apd42
# OVEvSjIssgg36zCB+gYLKoZIhvcNAQkQAi8xgeowgecwgeQwgb0EIFWxikZRYGNf
# 4oEVZK1eT45H+3GQ3/qxV75VwuBt+iLXMIGYMIGApH4wfDELMAkGA1UEBhMCVVMx
# EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoT
# FU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUt
# U3RhbXAgUENBIDIwMTACEzMAAAIo8KWH1/PIHkAAAQAAAigwIgQg+td06oqSGFUG
# /w9PMqaYYO6r68Jp/9rBU6G9XqOrWUcwDQYJKoZIhvcNAQELBQAEggIAQqJ2EbBl
# 3QrhVV9hFyf6hKuUd36oUJwsqplSCtkibzZ6HAkrL1WEgk2w6uNyVAfuPjU5MD63
# aeD1UqmHLTdt2AOdcvG6bIVeu3Qe9SlEKA+/nhkaxZ5tm+btJmy6In1/3xUqNe+r
# cYcycelCud53L/ZCP8Ua4mSFi+OKBY6enLyMguycizj/SK/oluScDh5rRMyvQ5o2
# 05E5tKuNzb0hbFDBCIRjzHFkzAa1ruwgVOEV/u23iagO/YuNTyil22zDwqGLPxyM
# NNYx+5cge4ppOJer0RmgPHBXP0VmaKiGIbXBBPeR5uP5W6laSdv8G7tuymqCFHbr
# tERQDFTZ6/1fdtWeTChYPtlONnJW9QPOf/5OcWuguUF3DifCWO7N2voNfhBzFvp5
# 76QfFY9mtG631ZDEsKM3g4aUsbBYLtImkWOFgDei8gcU1cZxGf83wwc7Dle6QmAC
# e4O+zRFy3Q5UYqWaa9jwQckl3b73QeXTc5PAHP16fPL0zG/Nbk49Ob8s/dESlQIy
# lzIF/dV1SBiANN4cr4hO/ADhLE+Ed+YkUqyPzvixQlKm+ByZ+c8iVgVqCddBURa+
# jX/Gk2HkHe6AzCaCW2sZ4iEbty8zL+7mv3qcuqjUQyD8FEzoGjjsBPGO6bYWnqFm
# NaKo7rhxZ7n3rJwmjsDfH9NjK3IXKhPIR28=
# SIG # End signature block
