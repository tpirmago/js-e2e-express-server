"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addReleaseAnnotation = addReleaseAnnotation;
const tl = require("azure-pipelines-task-lib/task");
const azure_arm_appinsights_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-appinsights");
var uuidV4 = require("uuid/v4");
function addReleaseAnnotation(endpoint, azureAppService, isDeploymentSuccess) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            var appSettings = yield azureAppService.getApplicationSettings();
            var instrumentationKey = getInstrumentationKey(appSettings);
            if (instrumentationKey) {
                let appinsightsResources = new azure_arm_appinsights_1.ApplicationInsightsResources(endpoint);
                var appInsightsResources = yield appinsightsResources.list(null, [`$filter=InstrumentationKey eq '${instrumentationKey}'`]);
                if (appInsightsResources.length > 0) {
                    var appInsights = new azure_arm_appinsights_1.AzureApplicationInsights(endpoint, appInsightsResources[0].id.split('/')[4], appInsightsResources[0].name);
                    var releaseAnnotationData = getReleaseAnnotation(isDeploymentSuccess);
                    yield appInsights.addReleaseAnnotation(releaseAnnotationData);
                    console.log(tl.loc("SuccessfullyAddedReleaseAnnotation", appInsightsResources[0].name));
                }
                else {
                    tl.debug(`Unable to find Application Insights resource with Instrumentation key ${instrumentationKey}. Skipping adding release annotation.`);
                }
            }
            else {
                tl.debug(`Application Insights is not configured for the App Service. Skipping adding release annotation.`);
            }
        }
        catch (error) {
            console.log(tl.loc("FailedAddingReleaseAnnotation", error));
        }
    });
}
function getReleaseAnnotation(isDeploymentSuccess) {
    let annotationName = "Release Annotation";
    let releaseUri = tl.getVariable("Release.ReleaseUri");
    let buildUri = tl.getVariable("Build.BuildUri");
    if (!!releaseUri) {
        annotationName = `${tl.getVariable("Release.DefinitionName")} - ${tl.getVariable("Release.ReleaseName")}`;
    }
    else if (!!buildUri) {
        annotationName = `${tl.getVariable("Build.DefinitionName")} - ${tl.getVariable("Build.BuildNumber")}`;
    }
    let releaseAnnotationProperties = {
        "Label": isDeploymentSuccess ? "Success" : "Error", // Label decides the icon for release annotation
        "Deployment Uri": getDeploymentUri(),
        "BuildNumber": getPipelineVariable("Build.BuildNumber"),
        "BuildRepositoryName": getPipelineVariable("Build.Repository.Name"),
        "BuildRepositoryProvider": getPipelineVariable("Build.Repository.Provider"),
        "SourceBranch": getPipelineVariable("Build.SourceBranch"),
        "ReleaseId": getPipelineVariable("Release.ReleaseId"),
        "ReleaseDescription": getPipelineVariable("Release.ReleaseDescription"),
        "ReleaseDefinitionName": getPipelineVariable("Release.DefinitionName"),
        "ReleaseEnvironmentName": getPipelineVariable("Release.EnvironmentName"),
        "ReleaseRequestedFor": getPipelineVariable("Release.RequestedForId") || getPipelineVariable("Release.RequestedFor")
    };
    let releaseAnnotation = {
        "AnnotationName": annotationName,
        "Category": "Deployment",
        "EventTime": new Date(),
        "Id": uuidV4(),
        "Properties": JSON.stringify(releaseAnnotationProperties)
    };
    return releaseAnnotation;
}
function getDeploymentUri() {
    let buildUri = tl.getVariable("Build.BuildUri");
    let releaseWebUrl = tl.getVariable("Release.ReleaseWebUrl");
    let collectionUrl = tl.getVariable('System.TeamFoundationCollectionUri');
    let teamProject = tl.getVariable('System.TeamProjectId');
    let buildId = tl.getVariable('build.buildId');
    if (!!releaseWebUrl) {
        return releaseWebUrl;
    }
    if (!!buildUri) {
        return `${collectionUrl}${teamProject}/_build?buildId=${buildId}&_a=summary`;
    }
    return "";
}
function getPipelineVariable(variableName) {
    let variable = tl.getVariable(variableName);
    //we dont want to set a variable to be empty string
    return !!variable ? variable : undefined;
}
function getInstrumentationKey(appSettings) {
    var _a, _b;
    let connectionString = (_a = appSettings === null || appSettings === void 0 ? void 0 : appSettings.properties) === null || _a === void 0 ? void 0 : _a.APPLICATIONINSIGHTS_CONNECTION_STRING;
    if (connectionString) {
        const FIELDS_SEPARATOR = ";";
        const FIELD_KEY_VALUE_SEPARATOR = "=";
        const kvPairs = connectionString.split(FIELDS_SEPARATOR);
        for (const kvPair of kvPairs) {
            const pair = kvPair.split(FIELD_KEY_VALUE_SEPARATOR);
            if (pair.length === 2 && pair[0].trim().toLowerCase() === "instrumentationkey") {
                return pair[1].trim();
            }
        }
    }
    return (_b = appSettings === null || appSettings === void 0 ? void 0 : appSettings.properties) === null || _b === void 0 ? void 0 : _b.APPINSIGHTS_INSTRUMENTATIONKEY;
}

// SIG // Begin signature block
// SIG // MIInRAYJKoZIhvcNAQcCoIInNTCCJzECAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // H7jHnlwDmOKT4CA6Itkow31iirQNC5yOMnwB6V2e33ig
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
// SIG // SIb3DQEJBDEiBCA0R2jxwzmcy2Mm6jP7/3IjPlB7wy06
// SIG // I6GYbMZwMPSXrzBCBgorBgEEAYI3AgEMMTQwMqAUgBIA
// SIG // TQBpAGMAcgBvAHMAbwBmAHShGoAYaHR0cDovL3d3dy5t
// SIG // aWNyb3NvZnQuY29tMA0GCSqGSIb3DQEBAQUABIIBADJh
// SIG // HKglQcPmVhq9sdbhLvlpYNiO68NUkLLl+QMd3kWe//ht
// SIG // 0d7WoPINakTDZJ1MFbyGxgQssXRIp/g8hUELGNSpvWj/
// SIG // cL2nH7EYqKHIYO3UmGIxABq9NlhawdQJzt5Xrd3BGUV3
// SIG // 7kiHvgzWv1WOq+AwEr4To8m00DhNnjyz4K1o71HX+8UD
// SIG // Czsctn7gzUsLmnXNKUYlmYDjckWNGgi1C4ZYhKo6l0Q4
// SIG // Z/+vbPsnA18ERN9HqVDn0DMWw1rvnlAs0U9zvCXcvubx
// SIG // PPgTX01HR0fNVVA8Lk8XMSWHWN6ZbyXdKKii2Kg7xM3F
// SIG // GCguMKUWZ+kNkxuI59OT9Kgxan+GL46hgheUMIIXkAYK
// SIG // KwYBBAGCNwMDATGCF4Awghd8BgkqhkiG9w0BBwKgghdt
// SIG // MIIXaQIBAzEPMA0GCWCGSAFlAwQCAQUAMIIBUgYLKoZI
// SIG // hvcNAQkQAQSgggFBBIIBPTCCATkCAQEGCisGAQQBhFkK
// SIG // AwEwMTANBglghkgBZQMEAgEFAAQgdiQnBYRvupY5AFSH
// SIG // huH3ZNQPtnf4zVy/H/E0Htl8L2YCBmqqZyCD/xgTMjAy
// SIG // NjA5MjIxMjQ1MjkuOTUzWjAEgAIB9KCB0aSBzjCByzEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjElMCMGA1UECxMcTWljcm9z
// SIG // b2Z0IEFtZXJpY2EgT3BlcmF0aW9uczEnMCUGA1UECxMe
// SIG // blNoaWVsZCBUU1MgRVNOOjk2MDAtMDVFMC1EOTQ3MSUw
// SIG // IwYDVQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2
// SIG // aWNloIIR6jCCByAwggUIoAMCAQICEzMAAAImNbQ+Z0OT
// SIG // 9h8AAQAAAiYwDQYJKoZIhvcNAQELBQAwfDELMAkGA1UE
// SIG // BhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNV
// SIG // BAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBD
// SIG // b3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgUENBIDIwMTAwHhcNMjYwMjE5MTk0MDAy
// SIG // WhcNMjcwNTE3MTk0MDAyWjCByzELMAkGA1UEBhMCVVMx
// SIG // EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
// SIG // ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3Jh
// SIG // dGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJpY2Eg
// SIG // T3BlcmF0aW9uczEnMCUGA1UECxMeblNoaWVsZCBUU1Mg
// SIG // RVNOOjk2MDAtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNy
// SIG // b3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAv/8PmWSC+URR
// SIG // aVSPA92crjbvCM3ABDg99Di2I4d9+6143KyJTks6SXOG
// SIG // XlMRMpYusehes5uDUfHWz2/XYg6f4TlMx1hsYgNWd0Vy
// SIG // gW/+Bf6I8rzeN0hBlqkn1XNyNwZbGE9+XnFQCfZFX/dG
// SIG // Dr9vbRYyQQWZGL60/w8MMkS7HDsj+Kfvf5ciYw/lC7N2
// SIG // FwYVa32fjG0AfgWCi6kbwSm4/8EfWpDazMUCDaBmg+Y2
// SIG // Tvzf50rJhtj9c7/3L+IEqDAZ1nkCAZI3diOcNQ3l7qad
// SIG // r0ojZkebANmZASt8okFmib0cTg5ZH4sh5PTJJP062E45
// SIG // ozwm4XvrqoRzUcvFJWzr1rAqtLUbVMpB79/Q4KgHyTax
// SIG // PDkrfN+awcw6a63AIcJoH4aFYuACnqsIpGNJ1GuPCtEM
// SIG // vNF0+H4hANxMRGTWkRaPTavxsG34KiqhpnPcYSrkRXI7
// SIG // bmuCh2b5wL6VoBBUjgpKL17PwXC55BBzPcWfIlGoOQso
// SIG // Tal2GBP89KXF3WGjSJEOvBFprry5u4PaKH1drzpuRlTa
// SIG // IIZ5Fhupxj6PycBIJgPaEktBH7xUTFjwP4KUrxd7IQKy
// SIG // h52hKVUkotwzW8ormIhLPSqNCJGXPMShXkEWqhkcawft
// SIG // q/+wd1/NU6bPfSoRcIPsA/O6HdthdjFINce7cLd4GlZx
// SIG // ZNCGSMFDwhsCAwEAAaOCAUkwggFFMB0GA1UdDgQWBBRd
// SIG // 4Z/X2CTdmP2fS1WwTyMQM1x7EDAfBgNVHSMEGDAWgBSf
// SIG // pxVdAF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSg
// SIG // UqBQhk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // b3BzL2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIw
// SIG // UENBJTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBe
// SIG // MFwGCCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRp
// SIG // bWUtU3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNV
// SIG // HRMBAf8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMI
// SIG // MA4GA1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOC
// SIG // AgEANlMdLa/bGAo7KtBUcolacdeTrqzV7+kJO4l/gK1T
// SIG // 5c98OLao3EzZtXbd7U7mtsCTKSYTx/J+1F4Zk/fHeQ7u
// SIG // OC5eGnZ7HuEkH1YN0C+mkZFx5yVJ/MvYn7Qfz8ttp/cZ
// SIG // 8DxX490JQzkoC7h5Xrve1NIh9mWpbmGm1lyYoXYmKSvH
// SIG // DxxZamTgIqLdPhg/HT/kTLr6cbfxdi5mHpaaGcK4ohTl
// SIG // JpcRFFe8SR8mWZQ6rrJHsrqtNQ07/dTeKjPHHzz4Zf9q
// SIG // XOB3jH/53dh6LonyWw0BTXeFj4S859Est7tWYd/kt7Y0
// SIG // HajfncsOtEWlfkVwqDi4BWdzAIPxqA5fn72+Ycv9Wu9X
// SIG // LV/MBGndT3+nXn9qan5d8BXPvoZBfA1102aHyTeGFWjd
// SIG // yJ8GwBkAw5DSuJannAoscZkisInT8pxnhOTrbzaCtaZC
// SIG // 7Jv4vBdUYxnM2f5EhdlQ5KhvOuokPo1WxjkOg7t3sshX
// SIG // BSmaAyeAeZhAEvWk9kiqpZS3smzm6B+q+u7IkeQf9h57
// SIG // u/imLmGctARGnbQOp4BuHJ0kfSbK5IYbCpm9dbo6sICc
// SIG // jcfdjLKBhsDYDdWiNECA/ArIwhcKX5jM5QOOMRymL94Z
// SIG // o8XqgUuLlOa0HogJ1YKSXmlRipv5czw7Z6aRlfu14Uae
// SIG // W9WcU/2e18XPiOx+/4wrUA2aGmUwggdxMIIFWaADAgEC
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
// SIG // BgNVBAsTHm5TaGllbGQgVFNTIEVTTjo5NjAwLTA1RTAt
// SIG // RDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3Rh
// SIG // bXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUAov3zMRbZ
// SIG // Kq+1zF3bEcllNJUih2eggYMwgYCkfjB8MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0BAQsFAAIF
// SIG // AO5czcYwIhgPMjAyNjA5MjIwOTQ5NThaGA8yMDI2MDky
// SIG // MzA5NDk1OFowdDA6BgorBgEEAYRZCgQBMSwwKjAKAgUA
// SIG // 7lzNxgIBADAHAgEAAgIP3zAHAgEAAgIVMDAKAgUA7l4f
// SIG // RgIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgorBgEEAYRZ
// SIG // CgMCoAowCAIBAAIDB6EgoQowCAIBAAIDAYagMA0GCSqG
// SIG // SIb3DQEBCwUAA4IBAQACGSWwca5+LNWmPx57dyoggrx+
// SIG // O59WrmXSSFmnx2PmrJYuciT2s861m/rkp4mvcrvWSrBN
// SIG // V9eXXlQBvt2llunkg+azkWpR3eQlffFeU64PSbdK5u/D
// SIG // 00Rsoy1huMbkvQf9kx7hmuKRjdCkgm+mza+skO42B9Pu
// SIG // 3HxRvdsevpgeW+IvCoI48FTbwyr0LHrIeGrWlTdlMbON
// SIG // zdevbxgDe61XV4gcAYSAP/FuRecPk4esQ/vRaLC4+JTD
// SIG // +5p27UnyfxJ1VIoGWXAve7NS7bzV6gQi3W/onD00zjKq
// SIG // Zhh/RBckz1ShaWP0qcNZ786gro14a8HrlwLszOMUau+A
// SIG // lT5B1zRuMYIEDTCCBAkCAQEwgZMwfDELMAkGA1UEBhMC
// SIG // VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcT
// SIG // B1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jw
// SIG // b3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUt
// SIG // U3RhbXAgUENBIDIwMTACEzMAAAImNbQ+Z0OT9h8AAQAA
// SIG // AiYwDQYJYIZIAWUDBAIBBQCgggFKMBoGCSqGSIb3DQEJ
// SIG // AzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0BCQQxIgQg
// SIG // w12XNj87n94lP7LwYQDHhOe1ULPKYCWCLbCvlrXPGvww
// SIG // gfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHkMIG9BCDMMlxh
// SIG // Z0zbGUQa7OhjfwW1dKJGjT91QWKixY1LBZ24KjCBmDCB
// SIG // gKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMT
// SIG // HU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMz
// SIG // AAACJjW0PmdDk/YfAAEAAAImMCIEIKTCnFYtSHKb7P2Q
// SIG // jipTC3QU4up5oqXN64/h/BxAnmitMA0GCSqGSIb3DQEB
// SIG // CwUABIICAH/Gpy9zoDkP8Q6KNBuZ2oyG5qLn0fmRitRU
// SIG // Ml+KzE/wEOWqgUfeBKkEmrDt4bLh4g8RKHpRJ52Novx5
// SIG // 1932nQBBX6cP9xEY1IncanAEWrctENLONF51wh6nP39G
// SIG // t3icKm0djOFEpqbbGGP9TX899XD3DB5IVmJSH+/rGfGE
// SIG // 99JZNSjPi0v3jhrj2gGyBmMUvJYXNcEfm0trtzdJ9TxX
// SIG // 55dDqXB24r8qMkUoEvcsIR2E77j9fInOYW496XfT+11u
// SIG // WcTAi37mAcPqxTrdoWs3kMJREfvIv4C18ypi//CGbSFk
// SIG // ktPv3aOvmDBzmXMrT57ienjfCt0rwTwjRJYCHR8Kt5Eg
// SIG // KlYcrCCFw8ZTKyZpC5mbiGSQLsZNTD5MHuup5prK0R5W
// SIG // agswIvRK3Bp601UJGwCk1N/P2xCqIm3JTbclgLIIN65j
// SIG // 98YYTICYLhgFLVX6Yzex3RrHyHfTbx5x+lI85xJYIPRO
// SIG // NNxBOeQS95rdKz+G6dEOtiTs6SCiio1o5wyjiafDegD8
// SIG // XDZ7sIZl5V6aZZuoYuWYDxjuSFzhQvUSECK4lRGFCtkW
// SIG // g30syHPJualkjSc4WnQ953aaNcJyrlWET/DwXdJ/q2XC
// SIG // kTzobdexab+2fhn32DcXKOnkxliUmhSCvurhx5DlZ69u
// SIG // ktV5/S3rKyBkqLJai01OBplkhZ1xWafG
// SIG // End signature block
