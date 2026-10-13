[CmdletBinding()]
param()

BEGIN {
    function Mask-Percents{
    param (
        $Contents
    )

    return $Contents.Replace("%", "%%")
    }
}

PROCESS {
    Trace-VstsEnteringInvocation $MyInvocation
    try {
        Import-VstsLocStrings "$PSScriptRoot\task.json"

        # Get inputs.
        $input_failOnStderr = Get-VstsInput -Name 'failOnStderr' -AsBool
        $input_script = Get-VstsInput -Name 'script'
        $input_workingDirectory = Get-VstsInput -Name 'workingDirectory' -Require
        Assert-VstsPath -LiteralPath $input_workingDirectory -PathType 'Container'

        # Generate the script contents.
        Write-Host (Get-VstsLocString -Key 'GeneratingScript')
        $contents = "$input_script".Replace("`r`n", "`n").Replace("`n", "`r`n")

        if ($contents.IndexOf("`n") -lt 0 -and $contents.IndexOf("##vso[", ([System.StringComparison]::OrdinalIgnoreCase)) -lt 0) {
            # Print one-liner scripts.
            Write-Host (Get-VstsLocString -Key 'ScriptContents')shell
            Write-Host $contents
        }
        # Prepend @echo off instead of using the /Q command line switch. When /Q is used, echo can't be turned on.
        $contents = "@echo off`r`n$contents"

        # Write the script to disk.
        Assert-VstsAgent -Minimum '2.115.0'
        $tempDirectory = Get-VstsTaskVariable -Name 'agent.tempDirectory' -Require
        Assert-VstsPath -LiteralPath $tempDirectory -PathType 'Container'
        $filePath = [System.IO.Path]::Combine($tempDirectory, "$([System.Guid]::NewGuid()).cmd")
        $fileEncoding = [System.Console]::OutputEncoding
        if ($fileEncoding.CodePage -eq 65001) {
            # If UTF8, write without BOM
            $fileEncoding = New-Object System.Text.UTF8Encoding $False
        }
        $null = [System.IO.File]::WriteAllText(
            $filePath,
            $contents.ToString(),
            $fileEncoding)

        # Prepare the external command values.
        $cmdPath = $env:ComSpec
        Assert-VstsPath -LiteralPath $cmdPath -PathType Leaf
        # Command line switches:
        # /D     Disable execution of AutoRun commands from registry.
        # /E:ON  Enable command extensions. Note, command extensions are enabled
        #        by default, unless disabled via registry.
        # /V:OFF Disable delayed environment expansion. Note, delayed environment
        #        expansion is disabled by default, unless enabled via registry.
        # /S     Will cause first and last quote after /C to be stripped.
        #
        # Note, use CALL otherwise if a script ends with "goto :eof" the errorlevel
        # will not bubble as the exit code of cmd.exe.
        $arguments = "/D /E:ON /V:OFF /S /C `"CALL `"$filePath`"`""
        $splat = @{
            'FileName' = $cmdPath
            'Arguments' = $arguments
            'WorkingDirectory' = $input_workingDirectory
        }

        # Switch to "Continue".
        $global:ErrorActionPreference = 'Continue'
        $failed = $false

        # Run the script.
        Write-Host '========================== Starting Command Output ==========================='
        if (!$input_failOnStderr) {
            Invoke-VstsTool @splat
        } else {
            $inError = $false
            $errorLines = New-Object System.Text.StringBuilder
            Invoke-VstsTool @splat 2>&1 |
                ForEach-Object {
                    if ($_ -is [System.Management.Automation.ErrorRecord]) {
                        # Buffer the error lines.
                        $failed = $true
                        $inError = $true
                        $null = $errorLines.AppendLine("$($_.Exception.Message)")

                        # Write to verbose to mitigate if the process hangs.
                        Write-Verbose "STDERR: $($_.Exception.Message)"
                    } else {
                        # Flush the error buffer.
                        if ($inError) {
                            $inError = $false
                            $message = $errorLines.ToString().Trim()
                            $null = $errorLines.Clear()
                            if ($message) {
                                Write-VstsTaskError -Message $message -IssueSource $IssueSources.CustomerScript
                            }
                        }

                        Write-Host "$_"
                    }
                }

            # Flush the error buffer one last time.
            if ($inError) {
                $inError = $false
                $message = $errorLines.ToString().Trim()
                $null = $errorLines.Clear()
                if ($message) {
                    Write-VstsTaskError -Message $message -IssueSource $IssueSources.CustomerScript
                }
            }
        }

        # Fail on $LASTEXITCODE
        if (!(Test-Path -LiteralPath 'variable:\LASTEXITCODE')) {
            $failed = $true
            Write-Verbose "Unable to determine exit code"
            Write-VstsTaskError -Message (Get-VstsLocString -Key 'PS_UnableToDetermineExitCode')
        } else {
            if ($LASTEXITCODE -ne 0) {
                $failed = $true
                Write-VstsTaskError -Message (Get-VstsLocString -Key 'PS_ExitCode' -ArgumentList $LASTEXITCODE)
            }
        }

        # Fail if any errors.
        if ($failed) {
            Write-VstsSetResult -Result 'Failed' -Message "Error detected" -DoNotThrow
        }
    } finally {
        Trace-VstsLeavingInvocation $MyInvocation
    }
}
# SIG # Begin signature block
# MIInbQYJKoZIhvcNAQcCoIInXjCCJ1oCAQExDzANBglghkgBZQMEAgEFADB5Bgor
# BgEEAYI3AgEEoGswaTA0BgorBgEEAYI3AgEeMCYCAwEAAAQQH8w7YFlLCE63JNLG
# KX7zUQIBAAIBAAIBAAIBAAIBADAxMA0GCWCGSAFlAwQCAQUABCBMq7tG8igGdBuf
# 57tz327ypMH5EUhBnvEWuf/A9gBRh6CCDMkwggYEMIID7KADAgECAhMzAAACHPrN
# xZvoL37EAAAAAAIcMA0GCSqGSIb3DQEBCwUAMFcxCzAJBgNVBAYTAlVTMR4wHAYD
# VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jvc29mdCBD
# b2RlIFNpZ25pbmcgUENBIDIwMjQwHhcNMjYwNDE2MTg1OTQxWhcNMjcwNDE1MTg1
# OTQxWjB0MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
# BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMR4wHAYD
# VQQDExVNaWNyb3NvZnQgQ29ycG9yYXRpb24wggEiMA0GCSqGSIb3DQEBAQUAA4IB
# DwAwggEKAoIBAQDVsZfgOKmM31HPfoWOoNEiw0SlCiIxUMC0I9NMWbucKOw/e9lP
# oAoehQVu6SG65V4EPzrYsnBnFPNoi4/HoOdjhz1qkrEt4I6tEcxXU6oOeY9zGveC
# /3iBeuhLYxM3M/PkcUoebF+Nednm8OkdSPoDu8imViHPQq/8CQUu0WRR4rE+dMRf
# rpVqfmNi2qWCX94T4MsepijGVkwE//tJg0ryAiYdHT34LSnlG/RSBZmQRGWZ5g8j
# qnKjRParSqMft1gvjuUTVgtWNZfgcLFSK5Wa0myrq8OPcgTGGsRgun+tnSS+IxDT
# xVsAPH1OzvPjwomguByhUe/OcvUN0D5Wmp7xAgMBAAGjggGqMIIBpjAOBgNVHQ8B
# Af8EBAMCB4AwHwYDVR0lBBgwFgYKKwYBBAGCN0wIAQYIKwYBBQUHAwMwHQYDVR0O
# BBYEFNoH7a2YDjOSwpkp6DHcmUS7J+0yMFQGA1UdEQRNMEukSTBHMS0wKwYDVQQL
# EyRNaWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRpb25zIExpbWl0ZWQxFjAUBgNVBAUT
# DTIzMDAxMis1MDc1NjkwHwYDVR0jBBgwFoAUf1k/VCHarU/vBeXmo9ctBpQSCDEw
# YAYDVR0fBFkwVzBVoFOgUYZPaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9w
# cy9jcmwvTWljcm9zb2Z0JTIwQ29kZSUyMFNpZ25pbmclMjBQQ0ElMjAyMDI0LmNy
# bDBtBggrBgEFBQcBAQRhMF8wXQYIKwYBBQUHMAKGUWh0dHA6Ly93d3cubWljcm9z
# b2Z0LmNvbS9wa2lvcHMvY2VydHMvTWljcm9zb2Z0JTIwQ29kZSUyMFNpZ25pbmcl
# MjBQQ0ElMjAyMDI0LmNydDAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IC
# AQAUnEqhaRXe0T3hIJjvdQErEkrA/7bByjn6t5IArODkkRjzkYwtKMc2yYj2quaN
# rLutWw2YZcngKPy1b71YyDJQTy4NDRwaSh9Tw5thrk3NmcPrAHia5vtcBJ1CgtKK
# 7mQbIcQ22d/N3813ayCDDFewu1+jsZmX+r/aTEqaOM4TVxVtRSkuCy8nAXKuChOK
# Li/zA4XuH8iEYqIsj2YoNaeSxVmeGiERXpKdo3dDmYi0kO5w2D8VS4c3+9h6gElY
# BaAAg/dYErBg27qT3vv0zRDJhJufvCNylA8S7/+8H5E/PV5cng6na9VV/w9OV3qu
# uND6zdGa2EX38Glp50F9AIQk3p2xXmcvorDeM4XJ7UlWYBi6g80J1SSOQnInCYFE
# msfUNn3+1AaTJKSJL83quKArTac2pKhu0Yzzzrzo6HrsRiQKzpnRBb1/dMa6P3hz
# 75XbMRBctNsFhZC07WCmjExdLg2eHW5uV0TY8D5+6wozJf7vF3+WHkYPO85Z+BC6
# U4FkNbYNycZ9cE4j1tXRdyDCfml6c0HWPHjNVDObrv9lKt3qUqFpX38VCqVCyNOO
# 1UcXfQiVjJw32U2WUKZjt/neJKHEBsm9kFsLuWzkQ53+qcaSaytmsCnk2gOglrlD
# 5d3kKyvvAw+rzm0lT8K38P6PLxfZQHhu4W8dV7Av8N2ZmDCCBr0wggSloAMCAQIC
# EzMAAAA5O7Y3Gb8GHWcAAAAAADkwDQYJKoZIhvcNAQEMBQAwgYgxCzAJBgNVBAYT
# AlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
# VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBS
# b290IENlcnRpZmljYXRlIEF1dGhvcml0eSAyMDExMB4XDTI0MDgwODIwNTQxOFoX
# DTM2MDMyMjIyMTMwNFowVzELMAkGA1UEBhMCVVMxHjAcBgNVBAoTFU1pY3Jvc29m
# dCBDb3Jwb3JhdGlvbjEoMCYGA1UEAxMfTWljcm9zb2Z0IENvZGUgU2lnbmluZyBQ
# Q0EgMjAyNDCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBANgBnB7jOMeq
# lRYHNa265v4IY9fH8TKhemHfPINe1gpLaV3dhg324WwH06LcHbpnsBukCDNitryo
# 0dtS/EW6I/yEL/bLSY8hKpbfQuWusBPr9qazYcDxCW/qnjb5JsI1s8bNOg3bVATv
# QVL4tcf03aTycsz8QeCdM0l/yHRObJ9QqazM1r6VPEOJ7LL+uEEb73w6QCuhs89a
# 1uv1zerOYMnsneRRwCbpyW11IcggU0cRKDDq1pjVJzIbIF6+oiXXbReOsgeI8zu1
# FyQfK0fVkaya8SmVHQ/tOf23mZ4W9k0Ri22QW9p3UgSC5OUDktKxxcCmGL6tXLfO
# GSWHIIV4YrTJTT6PNty5REojHJuZHArkF9VnHTERWoTjAzfI3kP+5b4alUdhgAZ7
# ttOu1bVnXfHaqPYl2rPs20ji03LOVWsh/radgE17es5hL+t6lV0eVHrVhsssROWJ
# uz2MXMCt7iw7lFPG9LXKGjsmonn2gotGdHIuEg5JnJMJVmixd5LRlkmgYRZKzhxS
# CwyoGIq0PhaA7Y+VPct5pCHkijcIIDm0nlkK+0KyepolcqGm0T/GYQRMhHJlGOOm
# VQop36wUVUYklUy++vDWeEgEo4s7hxN6mIbf2MSIQ/iIfMZgJxC69oukMUXCrOC3
# SkE/xIkgpfl22MM1itkZ35nNXkMolU1lAgMBAAGjggFOMIIBSjAOBgNVHQ8BAf8E
# BAMCAYYwEAYJKwYBBAGCNxUBBAMCAQAwHQYDVR0OBBYEFH9ZP1Qh2q1P7wXl5qPX
# LQaUEggxMBkGCSsGAQQBgjcUAgQMHgoAUwB1AGIAQwBBMA8GA1UdEwEB/wQFMAMB
# Af8wHwYDVR0jBBgwFoAUci06AjGQQ7kUBU7h6qfHMdEjiTQwWgYDVR0fBFMwUTBP
# oE2gS4ZJaHR0cDovL2NybC5taWNyb3NvZnQuY29tL3BraS9jcmwvcHJvZHVjdHMv
# TWljUm9vQ2VyQXV0MjAxMV8yMDExXzAzXzIyLmNybDBeBggrBgEFBQcBAQRSMFAw
# TgYIKwYBBQUHMAKGQmh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2kvY2VydHMv
# TWljUm9vQ2VyQXV0MjAxMV8yMDExXzAzXzIyLmNydDANBgkqhkiG9w0BAQwFAAOC
# AgEAFJQfOChP7onn6fLIMKrSlN1WYKwDFgAddymOUO3FrM8d7B/W/iQ6DxXsDn7D
# 5W4wMwYeLystcEqfkjz4NURRgazyMu5yRzQh4LqjA4tStTcJh1opExo7nn5PuPBY
# nbu0+THSuVHTe0VTTPVhily/piFrDo3axQ9P4C+Ol5yet+2gTfekICS5xS+cYfSI
# vgn0JksVBVMYVI5QFu/qhnLhsEFEUzG8fvv0hjgkO+lkpV9ty6GkN4vdnd7ya6Q6
# aR9y34aiM1qmxaxBi6OUnyNl6fkuun/diTFnYDLTppOkr/mg5WSfCiDVMNCxtj4w
# PKC5OmHm1DQIt/MNokbbH3UGsFP1QbzsLocuSqLCvH09Io3fDPTmscR9Y75G4qX7
# RTX8AdBPo0I6OEojf39zuFZt0qOHm65YWQE69cZM2ueE1MB05dNNgHK9gTE7zKvK
# /fg8B2qjW88MT/WF5V5uvZGtqa9FSL2RazArA+rDPuf6JGYz4HpgMZHB4S6szWSK
# YBv0VisCzfxgeU+dquXW9bd0auYlOB58DPcOYKdc3Se94g+xL4pcEhbB54JOgAkw
# YTu/9dLeH2pDqeJZAABVDWRQCaXfO5LgyKwKCLYXpigrZYCjUSBcr+Ve8PFWMhVT
# Ql0v4q8J/AUmQN5W4n101cY2L4A7GTQG1h32HHAvfQESWP0xghn6MIIZ9gIBATBu
# MFcxCzAJBgNVBAYTAlVTMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
# KDAmBgNVBAMTH01pY3Jvc29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMjQCEzMAAAIc
# +s3Fm+gvfsQAAAAAAhwwDQYJYIZIAWUDBAIBBQCgga4wGQYJKoZIhvcNAQkDMQwG
# CisGAQQBgjcCAQQwHAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwLwYJKoZI
# hvcNAQkEMSIEIEEOlS2euy25g2yFsISIVKFh+78P+wccCBoo2R61dBDJMEIGCisG
# AQQBgjcCAQwxNDAyoBSAEgBNAGkAYwByAG8AcwBvAGYAdKEagBhodHRwOi8vd3d3
# Lm1pY3Jvc29mdC5jb20wDQYJKoZIhvcNAQEBBQAEggEAkPnA8YXL9Nb+b5Outncj
# ohk627LRQXpmTMWJB0U3GcP528z5fhpva0dhORMJoRAVrlt6ukplG8YHehOr0mf8
# AoFMpgc7bgBv6fGrdTsXcMYwgks1Tk/8XzZna/WYTTGJoyUFoWs7YVOevfOnIDwO
# T/q7DL7I7QQ6F7T6ashznxVQQJ9ZVGghE9zRWGOISPxOFn6jLvLgyGRtcT5U3bPn
# DO3IUkNGWb7OFHHXSrOQDmyjn+V2Z3g4lq5cZv7DYq5tlRwVaC0swyJ6wwTzwx/F
# WcpW6FEpE8T+iWSa5yG0E9GELZh14pb1NXR7OuaC0nbzGb35Qwy2tpJ11n44DgBo
# jaGCF6wwgheoBgorBgEEAYI3AwMBMYIXmDCCF5QGCSqGSIb3DQEHAqCCF4UwgheB
# AgEDMQ8wDQYJYIZIAWUDBAIBBQAwggFZBgsqhkiG9w0BCRABBKCCAUgEggFEMIIB
# QAIBAQYKKwYBBAGEWQoDATAxMA0GCWCGSAFlAwQCAQUABCC3jelWPdtt8BT2TmXY
# 6B7qwTQMJXOugEHGyK7xlnWk1gIGaq9TNV2WGBIyMDI2MDkyMjEyNDQ0OC45Nlow
# BIACAfSggdmkgdYwgdMxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
# MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRp
# b24xLTArBgNVBAsTJE1pY3Jvc29mdCBJcmVsYW5kIE9wZXJhdGlvbnMgTGltaXRl
# ZDEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNOOjY1MUEtMDVFMC1EOTQ3MSUwIwYD
# VQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNloIIR+zCCBygwggUQoAMC
# AQICEzMAAAIVGAPTgQcmfFMAAQAAAhUwDQYJKoZIhvcNAQELBQAwfDELMAkGA1UE
# BhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAc
# BgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0
# IFRpbWUtU3RhbXAgUENBIDIwMTAwHhcNMjUwODE0MTg0ODIwWhcNMjYxMTEzMTg0
# ODIwWjCB0zELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNV
# BAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEtMCsG
# A1UECxMkTWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0aW9ucyBMaW1pdGVkMScwJQYD
# VQQLEx5uU2hpZWxkIFRTUyBFU046NjUxQS0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1p
# Y3Jvc29mdCBUaW1lLVN0YW1wIFNlcnZpY2UwggIiMA0GCSqGSIb3DQEBAQUAA4IC
# DwAwggIKAoICAQDDcdXeFXEvSURg9XTdd40pnnXtUhuB7GGUM92lfANLQFi3E/CL
# hdillHWV3S7pyvZeO66B2DnQNTHlYcvRCFjZ32+QlKTTasT/vmFwq33WbYiHbztB
# HFEyYW7cEXrjrqTyqnm5e197q5yKrj1hpLyn53O/e5NqsPiFDxRPstr3mk4mJGrH
# F3So4YsQK8csRc9eKg1LH2nKHOGbqW3t7MvEl4VVi3FKGRq8+hk3R04KJh6HgqCg
# qjJqDMy5KIsKIxRbhR7hCybrnwUk0ZM2HtXmpdhUDqTnGPDlZ5Z0o7PSL0DmMFxt
# j19U6j9wDyLVvK3NwNPFvedy1yXLz85h42y2Rpv8iyrcLF7W+r3p8gcTX5kaYmOR
# rWyh3Co/JxWn/a1v4GO6U8vkPquBRdM8XzhTzZEsodXntsHx8dGmCeNxYFC5c+BV
# 5JekRFaKa3Q0XaUI4vOqCu9L+9ip17kuf1iUoqEBn/EMTRMsgivr4j/YlO1c/fid
# +NMQ1WowEhJZxqQjEDAZvdEHnIcLHKcgU1Utx8oCwR0LlTZ6bR8C+ZW/Syieqe/X
# ty5piLZ4ItaGgrUhzzkPDuz+WFxesGljif9GXmXfAfOzi84iG7zsMjLlBRoS6kSz
# JjQ1aqAjgFaXq/XCCx76XwNYV5Reh+FS4KBVO5Mc3cryJ2gxufxDd51QgQIDAQAB
# o4IBSTCCAUUwHQYDVR0OBBYEFIkhd/FyoDAWoaP2N3BC11Kpp2PXMB8GA1UdIwQY
# MBaAFJ+nFV0AXmJdg/Tl0mWnG1M1GelyMF8GA1UdHwRYMFYwVKBSoFCGTmh0dHA6
# Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvY3JsL01pY3Jvc29mdCUyMFRpbWUt
# U3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNybDBsBggrBgEFBQcBAQRgMF4wXAYIKwYB
# BQUHMAKGUGh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvY2VydHMvTWlj
# cm9zb2Z0JTIwVGltZS1TdGFtcCUyMFBDQSUyMDIwMTAoMSkuY3J0MAwGA1UdEwEB
# /wQCMAAwFgYDVR0lAQH/BAwwCgYIKwYBBQUHAwgwDgYDVR0PAQH/BAQDAgeAMA0G
# CSqGSIb3DQEBCwUAA4ICAQB3jYe1X6QZu/HMsFMLk7u+QIgE/L8HCmMLN4vneECI
# Q55un5V02fCb0ZUJ9ircox+uPhS8pBNQBpLlmTB7WC9neWNJKcI7JLk7A2712mDf
# DD5BbZ45xIuTJUBYWsufoiKDdML/NYy9WGpe10WEbYonWVJs3bbZyxjcTf8GsaW4
# CW8RP2CbFXLLE3Ln3/skXnMgZwmJvJ3Gz3gkvUG0+Bck59nND7/eJNzp4O2ZpZPo
# Mp2cmhynzCRcpY8iwER+QPqTVCK3C+3SYes5FqHvlKN5w4q3ihZrJUuQ9OGjXZ7S
# ieASDVyN7l/FJka2GsytYq8jhHscQLuTyZof148DdWIfQJVJI559o9MYzMiEcKjm
# neMblIxzI7d4D24RphAkhMmUsbcHDAabKljsL/z+ePVI6GDHUeAnTLA4kv3F8/gA
# 5xaYJ9uyqAZsJoLtYfmwg13N8xqvxXtg0WqRsIZQqFzwakjIT4wqfJWffeOy5oYC
# U1GDt1VFRKhgsnG9SzD0Y7DIGkHBsT2yo4ub4ew7TSgXbc8yKjtYVdwVNkCOne6O
# KEEB8utcgKAY4c92RnTja7Utmo5yeWvdfO+Ax76Y8/Jqxbx/Su3MmPdXkT8QqLJC
# U/GP0x+rbH2GKaeVdYZkJU94QFE6s1sNgF9rNPIs0I5OxG2Sw5JXcUG0+elC0s3v
# njCCB3EwggVZoAMCAQICEzMAAAAVxedrngKbSZkAAAAAABUwDQYJKoZIhvcNAQEL
# BQAwgYgxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQH
# EwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xMjAwBgNV
# BAMTKU1pY3Jvc29mdCBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAyMDEwMB4X
# DTIxMDkzMDE4MjIyNVoXDTMwMDkzMDE4MzIyNVowfDELMAkGA1UEBhMCVVMxEzAR
# BgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
# Y3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUtU3Rh
# bXAgUENBIDIwMTAwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDk4aZM
# 57RyIQt5osvXJHm9DtWC0/3unAcH0qlsTnXIyjVX9gF/bErg4r25PhdgM/9cT8dm
# 95VTcVrifkpa/rg2Z4VGIwy1jRPPdzLAEBjoYH1qUoNEt6aORmsHFPPFdvWGUNzB
# RMhxXFExN6AKOG6N7dcP2CZTfDlhAnrEqv1yaa8dq6z2Nr41JmTamDu6GnszrYBb
# fowQHJ1S/rboYiXcag/PXfT+jlPP1uyFVk3v3byNpOORj7I5LFGc6XBpDco2LXCO
# Mcg1KL3jtIckw+DJj361VI/c+gVVmG1oO5pGve2krnopN6zL64NF50ZuyjLVwIYw
# XE8s4mKyzbnijYjklqwBSru+cakXW2dg3viSkR4dPf0gz3N9QZpGdc3EXzTdEonW
# /aUgfX782Z5F37ZyL9t9X4C626p+Nuw2TPYrbqgSUei/BQOj0XOmTTd0lBw0gg/w
# EPK3Rxjtp+iZfD9M269ewvPV2HM9Q07BMzlMjgK8QmguEOqEUUbi0b1qGFphAXPK
# Z6Je1yh2AuIzGHLXpyDwwvoSCtdjbwzJNmSLW6CmgyFdXzB0kZSU2LlQ+QuJYfM2
# BjUYhEfb3BvR/bLUHMVr9lxSUV0S2yW6r1AFemzFER1y7435UsSFF5PAPBXbGjfH
# CBUYP3irRbb1Hode2o+eFnJpxq57t7c+auIurQIDAQABo4IB3TCCAdkwEgYJKwYB
# BAGCNxUBBAUCAwEAATAjBgkrBgEEAYI3FQIEFgQUKqdS/mTEmr6CkTxGNSnPEP8v
# BO4wHQYDVR0OBBYEFJ+nFV0AXmJdg/Tl0mWnG1M1GelyMFwGA1UdIARVMFMwUQYM
# KwYBBAGCN0yDfQEBMEEwPwYIKwYBBQUHAgEWM2h0dHA6Ly93d3cubWljcm9zb2Z0
# LmNvbS9wa2lvcHMvRG9jcy9SZXBvc2l0b3J5Lmh0bTATBgNVHSUEDDAKBggrBgEF
# BQcDCDAZBgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMAQTALBgNVHQ8EBAMCAYYwDwYD
# VR0TAQH/BAUwAwEB/zAfBgNVHSMEGDAWgBTV9lbLj+iiXGJo0T2UkFvXzpoYxDBW
# BgNVHR8ETzBNMEugSaBHhkVodHRwOi8vY3JsLm1pY3Jvc29mdC5jb20vcGtpL2Ny
# bC9wcm9kdWN0cy9NaWNSb29DZXJBdXRfMjAxMC0wNi0yMy5jcmwwWgYIKwYBBQUH
# AQEETjBMMEoGCCsGAQUFBzAChj5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
# L2NlcnRzL01pY1Jvb0NlckF1dF8yMDEwLTA2LTIzLmNydDANBgkqhkiG9w0BAQsF
# AAOCAgEAnVV9/Cqt4SwfZwExJFvhnnJL/Klv6lwUtj5OR2R4sQaTlz0xM7U518Jx
# Nj/aZGx80HU5bbsPMeTCj/ts0aGUGCLu6WZnOlNN3Zi6th542DYunKmCVgADsAW+
# iehp4LoJ7nvfam++Kctu2D9IdQHZGN5tggz1bSNU5HhTdSRXud2f8449xvNo32X2
# pFaq95W2KFUn0CS9QKC/GbYSEhFdPSfgQJY4rPf5KYnDvBewVIVCs/wMnosZiefw
# C2qBwoEZQhlSdYo2wh3DYXMuLGt7bj8sCXgU6ZGyqVvfSaN0DLzskYDSPeZKPmY7
# T7uG+jIa2Zb0j/aRAfbOxnT99kxybxCrdTDFNLB62FD+CljdQDzHVG2dY3RILLFO
# Ry3BFARxv2T5JL5zbcqOCb2zAVdJVGTZc9d/HltEAY5aGZFrDZ+kKNxnGSgkujhL
# mm77IVRrakURR6nxt67I6IleT53S0Ex2tVdUCbFpAUR+fKFhbHP+CrvsQWY9af3L
# wUFJfn6Tvsv4O+S3Fb+0zj6lMVGEvL8CwYKiexcdFYmNcP7ntdAoGokLjzbaukz5
# m/8K6TT4JDVnK+ANuOaMmdbhIurwJ0I9JZTmdHRbatGePu1+oDEzfbzL6Xu/OHBE
# 0ZDxyKs6ijoIYn/ZcGNTTY3ugm2lBRDBcQZqELQdVTNYs6FwZvKhggNWMIICPgIB
# ATCCAQGhgdmkgdYwgdMxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
# MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRp
# b24xLTArBgNVBAsTJE1pY3Jvc29mdCBJcmVsYW5kIE9wZXJhdGlvbnMgTGltaXRl
# ZDEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNOOjY1MUEtMDVFMC1EOTQ3MSUwIwYD
# VQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNloiMKAQEwBwYFKw4DAhoD
# FQCPp5N6Nu5gTUh+Nt+u3q1d68JRIKCBgzCBgKR+MHwxCzAJBgNVBAYTAlVTMRMw
# EQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVN
# aWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0
# YW1wIFBDQSAyMDEwMA0GCSqGSIb3DQEBCwUAAgUA7lx0hTAiGA8yMDI2MDkyMjAz
# MjkwOVoYDzIwMjYwOTIzMDMyOTA5WjB0MDoGCisGAQQBhFkKBAExLDAqMAoCBQDu
# XHSFAgEAMAcCAQACAhoKMAcCAQACAhLYMAoCBQDuXcYFAgEAMDYGCisGAQQBhFkK
# BAIxKDAmMAwGCisGAQQBhFkKAwKgCjAIAgEAAgMHoSChCjAIAgEAAgMBhqAwDQYJ
# KoZIhvcNAQELBQADggEBAJCkIK+LO9zY/C/shUICvA4XB8agzh5fKaSIhu1FLE5a
# iMcPMf0N/UKfN1os16RVdvEKKpT8AJEJsIfxtauv1Y5cK2Y15OUZwqLFjOTpbVzA
# UiLfG0QqboE/gHc0KioMlhE8jlvejZyvgBBjbEpYIxMS6gVIxqiWf3bvxGMmGhH/
# 8a3iJORXGc+WAbFnNKtW65v0wF0WbUFtvbIIdOuSmESDDVTD4UdXfm2/+xlFiQdq
# 3+sED+NyOSn54CeovcZ8S6WEq86RwDXDjtKre0qOgipeYtHgfsQ/HsquhW5bj3Vx
# Uf/trDdE/Y8QTxZj+91HzxChsNa4jVzfhaOJkUXr8NkxggQNMIIECQIBATCBkzB8
# MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVk
# bW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSYwJAYDVQQDEx1N
# aWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAxMAITMwAAAhUYA9OBByZ8UwABAAAC
# FTANBglghkgBZQMEAgEFAKCCAUowGgYJKoZIhvcNAQkDMQ0GCyqGSIb3DQEJEAEE
# MC8GCSqGSIb3DQEJBDEiBCBXIiv+3FMcs/J5GaMcn+tVFZLJTugjPLgwAKg0aht6
# ezCB+gYLKoZIhvcNAQkQAi8xgeowgecwgeQwgb0EIHAQ9HY8OtMUtyu1CwqtSLuj
# Pkk1EIX8pEcyKFI17uyKMIGYMIGApH4wfDELMAkGA1UEBhMCVVMxEzARBgNVBAgT
# Cldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29m
# dCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUtU3RhbXAgUENB
# IDIwMTACEzMAAAIVGAPTgQcmfFMAAQAAAhUwIgQgst46b6IOIg4esXZHKUjD6SDt
# B1JytGiJZJJSMB2g0KowDQYJKoZIhvcNAQELBQAEggIAS4NkkAhNL715gQZhTOkW
# FDNV5VpWY66v5+6hItS8tZXxT28CzzlLD93rMvJEsjlsPQey99T4fj2RoyuwRZU1
# bZaze6eUROrTxzGL8Gv3SyOVdKzmViNWAs92BBklUXNfbkhpA+M30hZz6TwuwO0g
# jnelqssbI6DDOPKtf5b36w75N6W3BQcHh5cZB2AFaOWQ/nGVj/Tna91q3ZN3sAOt
# BrS3B4g48jD/+lNiqISnyh7qjYgPCl53NBU9HNR9B027EmNpytL5B4hF97ccrrmM
# QpffssqZD8qvhdKcNL4Yv5wbkuVyRCdToRwegDFsjMlqD2UkLASh3d6Y85VQ93Ey
# US7wlLlilGVCJQV9XDX0/xwtbuoP+nwQRp/5ypTbn0mqoVGV+EQRXfRVm07m1k6+
# hlHm2tiKBVdNt9RJSi7OmwuAFLmc0NJpnEah622NjyvSqkku0Si2iUgicK471Po0
# IQHFPvBWReTvci/jzjFqIpTSghla/fm+3noOiYou20oz6ON+FTQKZ1/eGIqZ3rtu
# zWt5Z12tzDGhTDu45nHO4hkx0liO6Vhr2/CFpqMup7v8hBmw/8fWQGKibEbD2jBI
# ooy7P1FcwW/F3nMSq19o6tmqi22sjhXNA9o3EvnkUZWnc9MUgFqr969u6oUFvVds
# mRvxpLrBUT+l93GP0D34YA0=
# SIG # End signature block
