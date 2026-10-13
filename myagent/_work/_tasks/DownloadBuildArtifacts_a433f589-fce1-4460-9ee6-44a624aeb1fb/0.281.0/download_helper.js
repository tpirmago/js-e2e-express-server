"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlerCheckDownloadedFiles = handlerCheckDownloadedFiles;
exports.resolveParallelProcessingLimit = resolveParallelProcessingLimit;
const task_1 = require("azure-pipelines-task-lib/task");
const Models_1 = require("artifact-engine/Models");
const file_helper_1 = require("./file_helper");
/**
 * This function checks a result of artifact download
 * @param  {Array<ArtifactDownloadTicket>} downloadTickets
 * @throws Exception if downloaded build artifact is not healthy
 * @returns void
 */
function handlerCheckDownloadedFiles(downloadTickets) {
    console.log((0, task_1.loc)('BeginArtifactItemsIntegrityCheck'));
    (0, task_1.debug)(`Items count: ${downloadTickets.length}`);
    const corruptedItems = downloadTickets.filter(ticket => isItemCorrupted(ticket));
    if (corruptedItems.length > 0) {
        console.log((0, task_1.loc)('CorruptedArtifactItemsList'));
        corruptedItems.map(item => console.log(item.artifactItem.metadata.destinationUrl));
        throw new Error((0, task_1.loc)('IntegrityCheckNotPassed'));
    }
    console.log((0, task_1.loc)('IntegrityCheckPassed'));
}
/**
 * This function investigates the download ticket of the artifact item.
 *
 * Since artifact's items stored as compressed files the only appropriate way (at the moment)
 * to make sure that the item fully downloaded is to compare bytes length before compress
 * that provided by Azure DevOps and actual bytes length from local storage.
 *
 * @param  {ArtifactDownloadTicket} ticket - download ticket of artifact item
 * @returns {boolean} `true` if item corrupted, `false` if item healthy
 */
function isItemCorrupted(ticket) {
    let isCorrupted = false;
    // We check the tickets only with processed status and File item type
    if (ticket.state === Models_1.TicketState.Processed &&
        ticket.artifactItem.itemType === Models_1.ItemType.File) {
        (0, task_1.debug)(`Start check for item: ${ticket.artifactItem.path}`);
        (0, task_1.debug)(`Getting info from download ticket`);
        const localPathToFile = ticket.artifactItem.metadata.destinationUrl;
        (0, task_1.debug)(`Local path to the item: ${localPathToFile}`);
        if (ticket.artifactItem.fileLength) {
            const expectedBytesLength = Number(ticket.artifactItem.fileLength);
            if (isNaN(expectedBytesLength)) {
                (0, task_1.debug)('Incorrect data in related download ticket, skip item validation.');
                isCorrupted = true;
            }
            else {
                (0, task_1.debug)(`Expected length in bytes ${expectedBytesLength}`);
                try {
                    const actualBytesLength = (0, file_helper_1.getFileSizeInBytes)(localPathToFile);
                    (0, task_1.debug)(`Actual length in bytes ${actualBytesLength}`);
                    isCorrupted = (expectedBytesLength !== actualBytesLength);
                }
                catch (error) {
                    (0, task_1.debug)('Unable to get file stats from local storage due to the following error:');
                    (0, task_1.debug)(error);
                    (0, task_1.debug)('Skip item validation');
                    isCorrupted = true;
                }
            }
        }
        else if (ticket.artifactItem.metadata.downloadUrl.endsWith('format=zip')) {
            // When we use a Zip Provider the Artifact Engine returns only "fileSizeInBytes"
            try {
                const expectedBytesLength = Number(ticket.fileSizeInBytes);
                const actualBytesLength = (0, file_helper_1.getFileSizeInBytes)(localPathToFile);
                (0, task_1.debug)(`Expected length in bytes ${expectedBytesLength}`);
                (0, task_1.debug)(`Actual length in bytes ${actualBytesLength}`);
                return (expectedBytesLength !== actualBytesLength);
            }
            catch (error) {
                (0, task_1.debug)('Unable to get file stats from local storage due to the following error:');
                (0, task_1.debug)(error);
                (0, task_1.debug)('Skip item validation');
                isCorrupted = true;
            }
        }
    }
    return isCorrupted;
}
/**
 * This function resolves the value for the `parallelProcessingLimit` option of `ArtifactEngine`
 *
 * Earlier the only way to set parallelProcessingLimit in the task
 * was by declaring the `release.artifact.download.parallellimit` variable.
 *
 * To maintain backward compatibility we will use the following strategy:
 *
 * Firstly, investigate the `release.artifact.download.parallellimit` variable.
 * If everything is okay with this variable, the task will use the value from this variable.
 *
 * Secondly, investigate the `Parallelization limit` input of the task.
 * If everything is okay with the value in the related task's input, the task will use the value from this input.
 *
 * If validation failed for both cases the function will return the `defaultLimit` for the `parallelProcessingLimit` option.
 *
 * @param {string} artifactDownloadLimit - value of `release.artifact.download.parallellimit` variable
 * @param {string} taskLimit - value of `Parallelization limit` task input
 * @param {number} defaultLimit - the default value that will be returned if `artifactDownloadLimit` and `taskLimit` contain invalid values.
 * @returns {number} - parallel processing limit
 */
function resolveParallelProcessingLimit(artifactDownloadLimit, taskLimit, defaultLimit) {
    (0, task_1.debug)(`Checking value of the "release.artifact.download.parallellimit" variable - ${artifactDownloadLimit}`);
    const artifactDownloadParallelLimit = Number(artifactDownloadLimit);
    if (isParallelProcessingLimitCorrect(artifactDownloadParallelLimit)) {
        return artifactDownloadParallelLimit;
    }
    (0, task_1.debug)(`Checking value of the "Parallelization limit" input - ${taskLimit}`);
    const taskInputParallelLimit = Number(taskLimit);
    if (isParallelProcessingLimitCorrect(taskInputParallelLimit)) {
        return taskInputParallelLimit;
    }
    (0, task_1.debug)(`The parallelization limit is set to default value - ${defaultLimit}`);
    return defaultLimit;
}
/**
 * This function checks the input value for the `parallelProcessingLimit` option of `ArtifactEngine`
 *
 * The parallel processing limit must be a number greater than 0.
 *
 * @param {number} limit - value of parallel processing limit
 * @returns {boolean} true if parallel processing limit is correct, false otherwise.
 */
function isParallelProcessingLimitCorrect(limit) {
    const isCorrect = (!isNaN(limit) && limit > 0);
    if (isCorrect) {
        (0, task_1.debug)(`The value is correct, the parallelization limit is set to ${limit}`);
    }
    else {
        (0, task_1.debug)(`The value is incorrect ${limit}`);
    }
    return isCorrect;
}

// SIG // Begin signature block
// SIG // MIInRAYJKoZIhvcNAQcCoIInNTCCJzECAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // +xdvVw/9I1YPXSyIWvGm8OC6+y4RWmQEsFTaLSL0O/Og
// SIG // ggy6MIIF9TCCA92gAwIBAgITMwAAAh1NGchO1w9XSAAA
// SIG // AAACHTANBgkqhkiG9w0BAQsFADBXMQswCQYDVQQGEwJV
// SIG // UzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWduaW5n
// SIG // IFBDQSAyMDI0MB4XDTI2MDQxNjE4NTk0M1oXDTI3MDQx
// SIG // NTE4NTk0M1owdDELMAkGA1UEBhMCVVMxEzARBgNVBAgT
// SIG // Cldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAc
// SIG // BgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEeMBwG
// SIG // A1UEAxMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMIIBIjAN
// SIG // BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0L3sF8cf
// SIG // YGWRQumLNVgWsvASfJBgOCUJx+QjGn6jgEpU6SvR/KOW
// SIG // V017dHGlUEzTFD7eOOcF2A/nRbWilk8A59SOdqFEqwvb
// SIG // yYp9RrKrfs8iiS+Q4N3kF20DUetQ5jMttBi0yDt0hXnf
// SIG // UX4v6KYYAixhSw0d69Crx48DG/42FktHHpVf+C89uy3w
// SIG // HpJvL/ROSF2nol2wFGGSitPdJ+AlZdyQbWzfvQ7SPUjb
// SIG // v8o76M1udv7u0V/07aWvyg5abqJGfmXG75rXfbq/YBS7
// SIG // 2c4eNaPTLBP3JULXWhVhr7qOibmv57aYJHstxOf7wRXv
// SIG // jCTxuqYXZ7qOq+e2bnQrnYiNWwIDAQABo4IBmzCCAZcw
// SIG // DgYDVR0PAQH/BAQDAgeAMB8GA1UdJQQYMBYGCisGAQQB
// SIG // gjdMCAEGCCsGAQUFBwMDMB0GA1UdDgQWBBR+kLjMKnDx
// SIG // tIUJUOnOYwrU0y61XjBFBgNVHREEPjA8pDowODEeMBwG
// SIG // A1UECxMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMRYwFAYD
// SIG // VQQFEw0yMzAwMTIrNTA3NTU5MB8GA1UdIwQYMBaAFH9Z
// SIG // P1Qh2q1P7wXl5qPXLQaUEggxMGAGA1UdHwRZMFcwVaBT
// SIG // oFGGT2h0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lv
// SIG // cHMvY3JsL01pY3Jvc29mdCUyMENvZGUlMjBTaWduaW5n
// SIG // JTIwUENBJTIwMjAyNC5jcmwwbQYIKwYBBQUHAQEEYTBf
// SIG // MF0GCCsGAQUFBzAChlFodHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMENv
// SIG // ZGUlMjBTaWduaW5nJTIwUENBJTIwMjAyNC5jcnQwDAYD
// SIG // VR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOCAgEASk22
// SIG // Do88Exvw1xms/bOvn0Hmk7Q3BZjGPuVMlRQso+z7/uYt
// SIG // +6n1/JUi/7QSH2EH1rDLgUJX2bqyQ+q+B1Sdgnh/tX4I
// SIG // qvHXB3VSqGd0mtql6F93KvYkvHFW9Oge/uf1yeyNDsRx
// SIG // /Xw7Lyd098OVf2bQCBZi65fj9ArRvvdrs0bJ9J023RYz
// SIG // pCzC1jywFN0x6ISkZUhDIBSaT5JuZ+VAGd+cV+hVgqwy
// SIG // 7Eim+eeW04n8GvJiQcHZaH9G5n2InR/ncWdRXQ8by5zZ
// SIG // fc3irAOJHo2miKqiD4LocALYuUJewZUzaCTcMQrwZqlt
// SIG // jEC5wpGDf1VVLEd1dsf63Ezc6AX/2f0qUTr3WgNmTjnd
// SIG // boqFybd7XS0O7x6aqYm9Cn1q/xVl1tdKt/FcXwp0UAas
// SIG // 20rs7Ue5xDLs1+wpPgf12jw13daoe9vkGMgdGdlc1pjv
// SIG // c7J2/VKv3cLvCxnkKp8ruu0gxgAr514otn2/flEuPdlU
// SIG // 510pxSsqsIM1MhTLWStf7B2E7+mxuE7UFMoEMUzfmVfm
// SIG // iSJSjtjKme2yqwJzs0vZujYKE3VjqtdW0zmcCpSBFfxI
// SIG // VfUlpA5naUf4Tz09r+kxI+BfD0/8x40XsyFOXPwxpbf1
// SIG // YWP6StF5CbRMjJpktQTLY1P66gWVTCJt3Z8ULP0wQcq/
// SIG // gn/Gda+2on0FUPlkqs4wgga9MIIEpaADAgECAhMzAAAA
// SIG // OTu2Nxm/Bh1nAAAAAAA5MA0GCSqGSIb3DQEBDAUAMIGI
// SIG // MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3Rv
// SIG // bjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWlj
// SIG // cm9zb2Z0IENvcnBvcmF0aW9uMTIwMAYDVQQDEylNaWNy
// SIG // b3NvZnQgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkg
// SIG // MjAxMTAeFw0yNDA4MDgyMDU0MThaFw0zNjAzMjIyMjEz
// SIG // MDRaMFcxCzAJBgNVBAYTAlVTMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jv
// SIG // c29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMjQwggIiMA0G
// SIG // CSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDYAZwe4zjH
// SIG // qpUWBzWtuub+CGPXx/EyoXph3zyDXtYKS2ld3YYN9uFs
// SIG // B9Oi3B26Z7AbpAgzYra8qNHbUvxFuiP8hC/2y0mPISqW
// SIG // 30LlrrAT6/ams2HA8Qlv6p42+SbCNbPGzToN21QE70FS
// SIG // +LXH9N2k8nLM/EHgnTNJf8h0TmyfUKmszNa+lTxDieyy
// SIG // /rhBG+98OkArobPPWtbr9c3qzmDJ7J3kUcAm6cltdSHI
// SIG // IFNHESgw6taY1ScyGyBevqIl120XjrIHiPM7tRckHytH
// SIG // 1ZGsmvEplR0P7Tn9t5meFvZNEYttkFvad1IEguTlA5LS
// SIG // scXAphi+rVy3zhklhyCFeGK0yU0+jzbcuURKIxybmRwK
// SIG // 5BfVZx0xEVqE4wM3yN5D/uW+GpVHYYAGe7bTrtW1Z13x
// SIG // 2qj2Jdqz7NtI4tNyzlVrIf62nYBNe3rOYS/repVdHlR6
// SIG // 1YbLLETlibs9jFzAre4sO5RTxvS1yho7JqJ59oKLRnRy
// SIG // LhIOSZyTCVZosXeS0ZZJoGEWSs4cUgsMqBiKtD4WgO2P
// SIG // lT3LeaQh5Io3CCA5tJ5ZCvtCsnqaJXKhptE/xmEETIRy
// SIG // ZRjjplUKKd+sFFVGJJVMvvrw1nhIBKOLO4cTepiG39jE
// SIG // iEP4iHzGYCcQuvaLpDFFwqzgt0pBP8SJIKX5dtjDNYrZ
// SIG // Gd+ZzV5DKJVNZQIDAQABo4IBTjCCAUowDgYDVR0PAQH/
// SIG // BAQDAgGGMBAGCSsGAQQBgjcVAQQDAgEAMB0GA1UdDgQW
// SIG // BBR/WT9UIdqtT+8F5eaj1y0GlBIIMTAZBgkrBgEEAYI3
// SIG // FAIEDB4KAFMAdQBiAEMAQTAPBgNVHRMBAf8EBTADAQH/
// SIG // MB8GA1UdIwQYMBaAFHItOgIxkEO5FAVO4eqnxzHRI4k0
// SIG // MFoGA1UdHwRTMFEwT6BNoEuGSWh0dHA6Ly9jcmwubWlj
// SIG // cm9zb2Z0LmNvbS9wa2kvY3JsL3Byb2R1Y3RzL01pY1Jv
// SIG // b0NlckF1dDIwMTFfMjAxMV8wM18yMi5jcmwwXgYIKwYB
// SIG // BQUHAQEEUjBQME4GCCsGAQUFBzAChkJodHRwOi8vd3d3
// SIG // Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL01pY1Jvb0Nl
// SIG // ckF1dDIwMTFfMjAxMV8wM18yMi5jcnQwDQYJKoZIhvcN
// SIG // AQEMBQADggIBABSUHzgoT+6J5+nyyDCq0pTdVmCsAxYA
// SIG // HXcpjlDtxazPHewf1v4kOg8V7A5+w+VuMDMGHi8rLXBK
// SIG // n5I8+DVEUYGs8jLuckc0IeC6owOLUrU3CYdaKRMaO55+
// SIG // T7jwWJ27tPkx0rlR03tFU0z1YYpcv6Yhaw6N2sUPT+Av
// SIG // jpecnrftoE33pCAkucUvnGH0iL4J9CZLFQVTGFSOUBbv
// SIG // 6oZy4bBBRFMxvH779IY4JDvpZKVfbcuhpDeL3Z3e8muk
// SIG // Omkfct+GojNapsWsQYujlJ8jZen5Lrp/3YkxZ2Ay06aT
// SIG // pK/5oOVknwog1TDQsbY+MDyguTph5tQ0CLfzDaJG2x91
// SIG // BrBT9UG87C6HLkqiwrx9PSKN3wz05rHEfWO+RuKl+0U1
// SIG // /AHQT6NCOjhKI39/c7hWbdKjh5uuWFkBOvXGTNrnhNTA
// SIG // dOXTTYByvYExO8yryv34PAdqo1vPDE/1heVebr2Rramv
// SIG // RUi9kWswKwPqwz7n+iRmM+B6YDGRweEurM1kimAb9FYr
// SIG // As38YHlPnarl1vW3dGrmJTgefAz3DmCnXN0nveIPsS+K
// SIG // XBIWweeCToAJMGE7v/XS3h9qQ6niWQAAVQ1kUAml3zuS
// SIG // 4MisCgi2F6YoK2WAo1EgXK/lXvDxVjIVU0JdL+KvCfwF
// SIG // JkDeVuJ9dNXGNi+AOxk0BtYd9hxwL30BElj9MYIZ4jCC
// SIG // Gd4CAQEwbjBXMQswCQYDVQQGEwJVUzEeMBwGA1UEChMV
// SIG // TWljcm9zb2Z0IENvcnBvcmF0aW9uMSgwJgYDVQQDEx9N
// SIG // aWNyb3NvZnQgQ29kZSBTaWduaW5nIFBDQSAyMDI0AhMz
// SIG // AAACHU0ZyE7XD1dIAAAAAAIdMA0GCWCGSAFlAwQCAQUA
// SIG // oIGuMBkGCSqGSIb3DQEJAzEMBgorBgEEAYI3AgEEMBwG
// SIG // CisGAQQBgjcCAQsxDjAMBgorBgEEAYI3AgEVMC8GCSqG
// SIG // SIb3DQEJBDEiBCCy/nINQXeOg1Vq2di4mpB6Xne4AtRW
// SIG // Bwf1i0JrLEyGxjBCBgorBgEEAYI3AgEMMTQwMqAUgBIA
// SIG // TQBpAGMAcgBvAHMAbwBmAHShGoAYaHR0cDovL3d3dy5t
// SIG // aWNyb3NvZnQuY29tMA0GCSqGSIb3DQEBAQUABIIBALk6
// SIG // 8p0TWDBmmVacgdC0zy+pU92zhEtX2Y8JYVqb+EchVnRE
// SIG // fhTPkAkHLFKwJ1YQdfvs1ll+LWBrWmomA2F4l0vK48d/
// SIG // gM/+Zb0ZjxEPI2CSyBei6QR+rLNA3HW9aRQK6weWMtgA
// SIG // e1M/onMCZslVvkdgS3r1ojkBnfehrXkEJ56smuKjKbkg
// SIG // xC+5cu2aRidpaSkvsF/H18D62aKee6IaGJe3eiOXwWAx
// SIG // aJ/fAwQF/ElD5VRHhGx318lSm3PxN9U8Ain8zXdUt2w+
// SIG // isDGIBEd3dtRIDxsQdnUJK66KiyeQO22sIFlEmNSj/JI
// SIG // oVIwvbiYo7VsuojizW42DVr//hHewKChgheUMIIXkAYK
// SIG // KwYBBAGCNwMDATGCF4Awghd8BgkqhkiG9w0BBwKgghdt
// SIG // MIIXaQIBAzEPMA0GCWCGSAFlAwQCAQUAMIIBUgYLKoZI
// SIG // hvcNAQkQAQSgggFBBIIBPTCCATkCAQEGCisGAQQBhFkK
// SIG // AwEwMTANBglghkgBZQMEAgEFAAQgRT6DUIsX+1KL1vlX
// SIG // R/tgbc4+qcC/s4Ur4BBjq6IHU2QCBmqqS2Pp0RgTMjAy
// SIG // NjEwMDEwOTQwMjMuNTMzWjAEgAIB9KCB0aSBzjCByzEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjElMCMGA1UECxMcTWljcm9z
// SIG // b2Z0IEFtZXJpY2EgT3BlcmF0aW9uczEnMCUGA1UECxMe
// SIG // blNoaWVsZCBUU1MgRVNOOjM3MDMtMDVFMC1EOTQ3MSUw
// SIG // IwYDVQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2
// SIG // aWNloIIR6jCCByAwggUIoAMCAQICEzMAAAIfOnBp5KIw
// SIG // LpUAAQAAAh8wDQYJKoZIhvcNAQELBQAwfDELMAkGA1UE
// SIG // BhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNV
// SIG // BAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBD
// SIG // b3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgUENBIDIwMTAwHhcNMjYwMjE5MTkzOTUx
// SIG // WhcNMjcwNTE3MTkzOTUxWjCByzELMAkGA1UEBhMCVVMx
// SIG // EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
// SIG // ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3Jh
// SIG // dGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJpY2Eg
// SIG // T3BlcmF0aW9uczEnMCUGA1UECxMeblNoaWVsZCBUU1Mg
// SIG // RVNOOjM3MDMtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNy
// SIG // b3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAyzvFxTnHxqgK
// SIG // oIs9PgJkJhZd3WdGkxuFBSZKqjXTB8tvA2oXggbOjjbn
// SIG // 7pMnuceNglpM4ESMvZBNlVsBJ7WfGZIMq8pAtGyKrCA+
// SIG // /uhcYLrHk139VcL5tQ/NdOFZnraASZSeLhm7siWVL1w8
// SIG // eeZ1YedMoC082duFpELJz6b0Wb9pD3N/X924S8h1bZx7
// SIG // Gv1v/Ola37XfgHxb3gPqjfxGPlxo+XPwzzFwmBAm9Gq2
// SIG // G/dnQyVrcM6cga6eIHx5YGNVBKXOJeABhC639ieMK8U8
// SIG // 01vkjPF4VdXTjj62Iw9PNCG2ai/AfiBdEQnZ9uvWF6xi
// SIG // ukCB4qc5ymXAkvIzd9GAB50yVTeWc7Orf9mLKgRg6rrw
// SIG // 2ne/d+BRU8M71HDt1aCMnfd11sLz/P0ghVSYdtVvKBkE
// SIG // 6bRh8pcvhZeIXp1TFWRdb+qLDrYq1/BhU4hIZ3/J0XTo
// SIG // O8mWACdMcvQrQ3212k5/3H9y6tzfxgmChYwvuZlAhPgC
// SIG // YZsTLjHb0lBpiogBXYjwI1E6rFlgQWSZtHgsIHhiRZpk
// SIG // APle//fASnBPoFC+zvXlkQ0MCngHL6Oq8Tb9mOIyqxwO
// SIG // mf8It2v3ylISwjWREvKhna6QwJu6ofuhY2McrQG5IijO
// SIG // rkzcv1Cz5cLZWGaACQw0D+3mAssMFWzU2x10QUkvjXHA
// SIG // tLEgeFu1Ou8CAwEAAaOCAUkwggFFMB0GA1UdDgQWBBTZ
// SIG // O9rBg5R9K+Q8L3xkeV8CSPAe2zAfBgNVHSMEGDAWgBSf
// SIG // pxVdAF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSg
// SIG // UqBQhk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // b3BzL2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIw
// SIG // UENBJTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBe
// SIG // MFwGCCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRp
// SIG // bWUtU3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNV
// SIG // HRMBAf8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMI
// SIG // MA4GA1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOC
// SIG // AgEAZW7tyKMp5z89CtYj23jZ7Ho9m9eZebHZdhQBQQRk
// SIG // /ZUXXNoDVfCwCLrD2Bx4VL0Q3LMeJWzDYVSjxruEwy2q
// SIG // jbfwiPkhbRrqnUS6VT9VxPXAi8iqyj6XCRSQqj6Vfnn6
// SIG // ALWAZiFEHMccE+1iEO4GoPPq5Cr6zJAqEaiktJir/Cdb
// SIG // Cn4vOfhtroWf9UbXklXWGTmTo/km+MM6J0wk4+xLYDDf
// SIG // wV9+VuXU83e8CXRnqWJFYvO9XUqwtk69WRcwEe0uOHaw
// SIG // lmaSeqYSWm1TTrDcRSSoEspLoDhls0N9fEa9zEz4NrNw
// SIG // Z7PqVD1YDIo3eG1Dh9gZRLCzDMDnKJU02aoNR2K3WNY8
// SIG // aVACPYqYwUESDS/zu9OWfv39i4zZiUKKAlSVV9uGnaWe
// SIG // dfUrH2sxqKlxrfdW5qiqNHyNPSJeLFB4eIoeq6YkAwZc
// SIG // i+75rwno8FcWHr2OKlcE2f6N4L5fkdJRcWEvX3iDODXh
// SIG // tPlrA2e4y3IuTBXrjcKLEGN89ul4NaI9FPbvp3Efbk1P
// SIG // sQZifAbZQnYUNd0TTF+T/pK0WDwd1wqfSZul2jtffeat
// SIG // 9gCGZtZswRiOsh5b4l2hAuU8xojtS17j7V2VNl/d6ECW
// SIG // zKHt7/PuQjyq0GpRlsmLodmt1dacG4/ltBRJhBT6bvEy
// SIG // PqmDtSCEFlEkbxY17YeTm9NoTDIwggdxMIIFWaADAgEC
// SIG // AhMzAAAAFcXna54Cm0mZAAAAAAAVMA0GCSqGSIb3DQEB
// SIG // CwUAMIGIMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2Fz
// SIG // aGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UE
// SIG // ChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMTIwMAYDVQQD
// SIG // EylNaWNyb3NvZnQgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRo
// SIG // b3JpdHkgMjAxMDAeFw0yMTA5MzAxODIyMjVaFw0zMDA5
// SIG // MzAxODMyMjVaMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAk
// SIG // BgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAy
// SIG // MDEwMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKC
// SIG // AgEA5OGmTOe0ciELeaLL1yR5vQ7VgtP97pwHB9KpbE51
// SIG // yMo1V/YBf2xK4OK9uT4XYDP/XE/HZveVU3Fa4n5KWv64
// SIG // NmeFRiMMtY0Tz3cywBAY6GB9alKDRLemjkZrBxTzxXb1
// SIG // hlDcwUTIcVxRMTegCjhuje3XD9gmU3w5YQJ6xKr9cmmv
// SIG // Haus9ja+NSZk2pg7uhp7M62AW36MEBydUv626GIl3GoP
// SIG // z130/o5Tz9bshVZN7928jaTjkY+yOSxRnOlwaQ3KNi1w
// SIG // jjHINSi947SHJMPgyY9+tVSP3PoFVZhtaDuaRr3tpK56
// SIG // KTesy+uDRedGbsoy1cCGMFxPLOJiss254o2I5JasAUq7
// SIG // vnGpF1tnYN74kpEeHT39IM9zfUGaRnXNxF803RKJ1v2l
// SIG // IH1+/NmeRd+2ci/bfV+AutuqfjbsNkz2K26oElHovwUD
// SIG // o9Fzpk03dJQcNIIP8BDyt0cY7afomXw/TNuvXsLz1dhz
// SIG // PUNOwTM5TI4CvEJoLhDqhFFG4tG9ahhaYQFzymeiXtco
// SIG // dgLiMxhy16cg8ML6EgrXY28MyTZki1ugpoMhXV8wdJGU
// SIG // lNi5UPkLiWHzNgY1GIRH29wb0f2y1BzFa/ZcUlFdEtsl
// SIG // uq9QBXpsxREdcu+N+VLEhReTwDwV2xo3xwgVGD94q0W2
// SIG // 9R6HXtqPnhZyacaue7e3PmriLq0CAwEAAaOCAd0wggHZ
// SIG // MBIGCSsGAQQBgjcVAQQFAgMBAAEwIwYJKwYBBAGCNxUC
// SIG // BBYEFCqnUv5kxJq+gpE8RjUpzxD/LwTuMB0GA1UdDgQW
// SIG // BBSfpxVdAF5iXYP05dJlpxtTNRnpcjBcBgNVHSAEVTBT
// SIG // MFEGDCsGAQQBgjdMg30BATBBMD8GCCsGAQUFBwIBFjNo
// SIG // dHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL0Rv
// SIG // Y3MvUmVwb3NpdG9yeS5odG0wEwYDVR0lBAwwCgYIKwYB
// SIG // BQUHAwgwGQYJKwYBBAGCNxQCBAweCgBTAHUAYgBDAEEw
// SIG // CwYDVR0PBAQDAgGGMA8GA1UdEwEB/wQFMAMBAf8wHwYD
// SIG // VR0jBBgwFoAU1fZWy4/oolxiaNE9lJBb186aGMQwVgYD
// SIG // VR0fBE8wTTBLoEmgR4ZFaHR0cDovL2NybC5taWNyb3Nv
// SIG // ZnQuY29tL3BraS9jcmwvcHJvZHVjdHMvTWljUm9vQ2Vy
// SIG // QXV0XzIwMTAtMDYtMjMuY3JsMFoGCCsGAQUFBwEBBE4w
// SIG // TDBKBggrBgEFBQcwAoY+aHR0cDovL3d3dy5taWNyb3Nv
// SIG // ZnQuY29tL3BraS9jZXJ0cy9NaWNSb29DZXJBdXRfMjAx
// SIG // MC0wNi0yMy5jcnQwDQYJKoZIhvcNAQELBQADggIBAJ1V
// SIG // ffwqreEsH2cBMSRb4Z5yS/ypb+pcFLY+TkdkeLEGk5c9
// SIG // MTO1OdfCcTY/2mRsfNB1OW27DzHkwo/7bNGhlBgi7ulm
// SIG // ZzpTTd2YurYeeNg2LpypglYAA7AFvonoaeC6Ce5732pv
// SIG // vinLbtg/SHUB2RjebYIM9W0jVOR4U3UkV7ndn/OOPcbz
// SIG // aN9l9qRWqveVtihVJ9AkvUCgvxm2EhIRXT0n4ECWOKz3
// SIG // +SmJw7wXsFSFQrP8DJ6LGYnn8AtqgcKBGUIZUnWKNsId
// SIG // w2FzLixre24/LAl4FOmRsqlb30mjdAy87JGA0j3mSj5m
// SIG // O0+7hvoyGtmW9I/2kQH2zsZ0/fZMcm8Qq3UwxTSwethQ
// SIG // /gpY3UA8x1RtnWN0SCyxTkctwRQEcb9k+SS+c23Kjgm9
// SIG // swFXSVRk2XPXfx5bRAGOWhmRaw2fpCjcZxkoJLo4S5pu
// SIG // +yFUa2pFEUep8beuyOiJXk+d0tBMdrVXVAmxaQFEfnyh
// SIG // YWxz/gq77EFmPWn9y8FBSX5+k77L+DvktxW/tM4+pTFR
// SIG // hLy/AsGConsXHRWJjXD+57XQKBqJC4822rpM+Zv/Cuk0
// SIG // +CQ1ZyvgDbjmjJnW4SLq8CdCPSWU5nR0W2rRnj7tfqAx
// SIG // M328y+l7vzhwRNGQ8cirOoo6CGJ/2XBjU02N7oJtpQUQ
// SIG // wXEGahC0HVUzWLOhcGbyoYIDTTCCAjUCAQEwgfmhgdGk
// SIG // gc4wgcsxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJTAjBgNVBAsT
// SIG // HE1pY3Jvc29mdCBBbWVyaWNhIE9wZXJhdGlvbnMxJzAl
// SIG // BgNVBAsTHm5TaGllbGQgVFNTIEVTTjozNzAzLTA1RTAt
// SIG // RDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3Rh
// SIG // bXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUASyDINT+7
// SIG // Dbgl6Zmx9iF09rV3hBCggYMwgYCkfjB8MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0BAQsFAAIF
// SIG // AO5ojgUwIhgPMjAyNjEwMDEwNzQ1MDlaGA8yMDI2MTAw
// SIG // MjA3NDUwOVowdDA6BgorBgEEAYRZCgQBMSwwKjAKAgUA
// SIG // 7miOBQIBADAHAgEAAgIWuTAHAgEAAgITXjAKAgUA7mnf
// SIG // hQIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgorBgEEAYRZ
// SIG // CgMCoAowCAIBAAIDB6EgoQowCAIBAAIDAYagMA0GCSqG
// SIG // SIb3DQEBCwUAA4IBAQBdcRqlsAK/SlNEKsCJ2XxVrmPv
// SIG // HWbd2kk7uF5CgD9yIXFQrifMHU3g0l/eaiL9wdKb4A2h
// SIG // lc2MFl4Jz4zMFzqHs2mNkoU1DPSrBANx2kl6GLmwkCzE
// SIG // pDflyT9JbBJdSoQ8ZvsyBpKXil8GjkQdPUPsIp9+HX7p
// SIG // uSv2umLSob1lnvod8/Cs4bAEhVSWM2d5ruvK5YIGVLVv
// SIG // KdLrh++zrtGej3dac/ioCGYmsyWZIyuR/So/0K0qSwQ2
// SIG // QBjztAyVXsEe1h2x0t3O+pLNb4vFNTUpUSZpSFP3JZoO
// SIG // bmWm2aa3LHp0h5RgSdUVSZJf+EJAxgV+TZ+STtce70x2
// SIG // lwNKLsjmMYIEDTCCBAkCAQEwgZMwfDELMAkGA1UEBhMC
// SIG // VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcT
// SIG // B1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jw
// SIG // b3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUt
// SIG // U3RhbXAgUENBIDIwMTACEzMAAAIfOnBp5KIwLpUAAQAA
// SIG // Ah8wDQYJYIZIAWUDBAIBBQCgggFKMBoGCSqGSIb3DQEJ
// SIG // AzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0BCQQxIgQg
// SIG // mK38FnQBE1AgMz1o2s5vbiZYA0T6T99Udgmgb6MVm7Aw
// SIG // gfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHkMIG9BCCwJArf
// SIG // VpArDLVEZBbuk2ND91F3UZwomLj2YXt8pC38FDCBmDCB
// SIG // gKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMT
// SIG // HU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMz
// SIG // AAACHzpwaeSiMC6VAAEAAAIfMCIEICUv/ZeOVifScD1a
// SIG // /VTEM5o7MKUxCzLf+bjgPvTucK9+MA0GCSqGSIb3DQEB
// SIG // CwUABIICAGTUkxyy2/hedCww7kZODaHHmnC8BAYFEbhO
// SIG // iVY05SElJrqs9O5a6iMRpCtrX2Jo6s60B5QXsYnBvrC7
// SIG // dEyPj5IUqxwvKbPB0XkRIzfLrGUvqTnn+9fEJOguFHGF
// SIG // gHnY0KudAh06+KF5+YdFyodJIHvDl3LldFhNpxm8NN5e
// SIG // 91dqyvZhOSCfYNFHG6msokQ8jeHo07IvwHPP5YGzUliN
// SIG // fBz8u5Z/OqaF/XLHS5Lj26+p20HOQJVcTreh1ERI+BMu
// SIG // Cl+108C19G/0Gg/0aaK9j/tRhunE9+c4PggOtQp4iAKH
// SIG // hV48S6FGYKNJpIrjkcEynNhsNd2e6FXUAXeujyFbVTB8
// SIG // pLUBTL8lQgEAlQuBEyEa+CdxPXZG+l+ACmrRc9PHzmeL
// SIG // tAZfyFS/KYmSRmHKw9JyerkYOVKdKKjo3wsXQB0eNUuN
// SIG // NI2/QMfNpQkwD9+5HGatSo+JAyk0Pc/Rv9J3Ta8OrjOS
// SIG // jY55YXyorNRMJUZpAiNshNArZzlzB6vNvwAf1mmRfd5X
// SIG // DpbhRhSFygrnnUaRwVjxi/k8rGLVCz1EtcrC4VEXfx/s
// SIG // 6rdqvvorfDZVTjumTx7Syws257sazcYGlcK+rsonPx9O
// SIG // 8Fxt8PhwuhE/F0tP+9r0X2VTpytzVFnB4RYyuyqCHU61
// SIG // Wf+4HIGny+X3b6hqCjIk5lSyCxonuqXI
// SIG // End signature block
