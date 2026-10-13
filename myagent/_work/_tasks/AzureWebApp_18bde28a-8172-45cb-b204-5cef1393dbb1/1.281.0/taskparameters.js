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
exports.DeploymentType = exports.TaskParametersUtility = void 0;
const tl = require("azure-pipelines-task-lib/task");
var webCommonUtility = require('azure-pipelines-tasks-webdeployment-common/utility');
const azure_arm_endpoint_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-endpoint");
const azure_arm_resource_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-resource");
const azure_arm_app_service_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-app-service");
const constants_1 = require("azure-pipelines-tasks-azure-arm-rest/constants");
const packageUtility_1 = require("azure-pipelines-tasks-webdeployment-common/packageUtility");
const SiteContainer_1 = require("azure-pipelines-tasks-azure-arm-rest/SiteContainer");
const webAppKindMap = new Map([
    ['app', 'webApp'],
    ['app,linux', 'webAppLinux']
]);
class TaskParametersUtility {
    static getParameters() {
        return __awaiter(this, void 0, void 0, function* () {
            var taskParameters = {
                connectedServiceName: tl.getInput('azureSubscription', true),
                WebAppKind: tl.getInput('appType', false),
                DeployToSlotOrASEFlag: tl.getBoolInput('deployToSlotOrASE', false),
                WebConfigParameters: tl.getInput('customWebConfig', false),
                AppSettings: tl.getInput('appSettings', false),
                StartupCommand: tl.getInput('startUpCommand', false),
                ConfigurationSettings: tl.getInput('configurationStrings', false),
                ResourceGroupName: tl.getInput('resourceGroupName', false),
                SlotName: tl.getInput('slotName', false),
                WebAppName: tl.getInput('appName', true),
                CustomWarName: tl.getInput('customDeployFolder', false)
            };
            taskParameters.azureEndpoint = yield new azure_arm_endpoint_1.AzureRMEndpoint(taskParameters.connectedServiceName).getEndpoint();
            console.log(tl.loc('GotconnectiondetailsforazureRMWebApp0', taskParameters.WebAppName));
            var appDetails = yield this.getWebAppKind(taskParameters);
            taskParameters.ResourceGroupName = appDetails["resourceGroupName"];
            taskParameters.WebAppKind = appDetails["webAppKind"];
            taskParameters.isLinuxApp = taskParameters.WebAppKind && taskParameters.WebAppKind.indexOf("Linux") != -1;
            var endpointTelemetry = '{"endpointId":"' + taskParameters.connectedServiceName + '"}';
            console.log("##vso[telemetry.publish area=TaskEndpointId;feature=AzureRmWebAppDeployment]" + endpointTelemetry);
            taskParameters.Package = new packageUtility_1.Package(tl.getPathInput('package', true));
            taskParameters.WebConfigParameters = this.updateWebConfigParameters(taskParameters);
            if (taskParameters.isLinuxApp) {
                taskParameters.RuntimeStack = tl.getInput('runtimeStack', false);
            }
            taskParameters.DeploymentType = DeploymentType[(tl.getInput('deploymentMethod', false))];
            // Used for siteContainers apps.
            const siteContainersConfigInput = tl.getInput('siteContainersConfig');
            if (siteContainersConfigInput) {
                const raw = JSON.parse(siteContainersConfigInput);
                taskParameters.SiteContainers = raw.map(SiteContainer_1.SiteContainer.fromJson);
            }
            else {
                taskParameters.SiteContainers = null;
            }
            return taskParameters;
        });
    }
    static getWebAppKind(taskParameters) {
        return __awaiter(this, void 0, void 0, function* () {
            var resourceGroupName = taskParameters.ResourceGroupName;
            var kind = taskParameters.WebAppKind;
            if (taskParameters.azureEndpoint.scheme.toLowerCase() != constants_1.AzureRmEndpointAuthenticationScheme.PublishProfile) {
                if (!resourceGroupName) {
                    var resources = new azure_arm_resource_1.Resources(taskParameters.azureEndpoint);
                    var appDetails = yield resources.getAppDetails(taskParameters.WebAppName);
                    resourceGroupName = appDetails["resourceGroupName"];
                    if (!kind) {
                        kind = webAppKindMap.get(appDetails["kind"]) ? webAppKindMap.get(appDetails["kind"]) : appDetails["kind"];
                    }
                    tl.debug(`Resource Group: ${resourceGroupName}`);
                }
                else if (!kind) {
                    var appService = new azure_arm_app_service_1.AzureAppService(taskParameters.azureEndpoint, taskParameters.ResourceGroupName, taskParameters.WebAppName);
                    var configSettings = yield appService.get(true);
                    kind = webAppKindMap.get(configSettings.kind) ? webAppKindMap.get(configSettings.kind) : configSettings.kind;
                }
            }
            return {
                resourceGroupName: resourceGroupName,
                webAppKind: kind
            };
        });
    }
    static updateWebConfigParameters(taskParameters) {
        tl.debug("intially web config parameters :" + taskParameters.WebConfigParameters);
        var webConfigParameters = taskParameters.WebConfigParameters;
        if (taskParameters.Package.getPackageType() === packageUtility_1.PackageType.jar && (!taskParameters.isLinuxApp)) {
            if (!webConfigParameters) {
                webConfigParameters = "-appType java_springboot";
            }
            if (webConfigParameters.indexOf("-appType java_springboot") < 0) {
                webConfigParameters += " -appType java_springboot";
            }
            if (webConfigParameters.indexOf("-JAR_PATH D:\\home\\site\\wwwroot\\*.jar") >= 0) {
                var jarPath = webCommonUtility.getFileNameFromPath(taskParameters.Package.getPath());
                webConfigParameters = webConfigParameters.replace("D:\\home\\site\\wwwroot\\*.jar", jarPath);
            }
            else if (webConfigParameters.indexOf("-JAR_PATH ") < 0) {
                var jarPath = webCommonUtility.getFileNameFromPath(taskParameters.Package.getPath());
                webConfigParameters += " -JAR_PATH " + jarPath;
            }
            if (webConfigParameters.indexOf("-Dserver.port=%HTTP_PLATFORM_PORT%") > 0) {
                webConfigParameters = webConfigParameters.replace("-Dserver.port=%HTTP_PLATFORM_PORT%", "");
            }
            tl.debug("web config parameters :" + webConfigParameters);
        }
        return webConfigParameters;
    }
}
exports.TaskParametersUtility = TaskParametersUtility;
var DeploymentType;
(function (DeploymentType) {
    DeploymentType[DeploymentType["auto"] = 0] = "auto";
    DeploymentType[DeploymentType["zipDeploy"] = 1] = "zipDeploy";
    DeploymentType[DeploymentType["runFromPackage"] = 2] = "runFromPackage";
    DeploymentType[DeploymentType["warDeploy"] = 3] = "warDeploy";
})(DeploymentType || (exports.DeploymentType = DeploymentType = {}));

// SIG // Begin signature block
// SIG // MIInRAYJKoZIhvcNAQcCoIInNTCCJzECAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // DnHSXTKW1GEgdXZwTCYtrFw/YqmUQtPQl++AdgbRvaSg
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
// SIG // SIb3DQEJBDEiBCAg/g2l4G5eWruUGYBoSmEEuATDjK+1
// SIG // ErfPsWk8wFYCrjBCBgorBgEEAYI3AgEMMTQwMqAUgBIA
// SIG // TQBpAGMAcgBvAHMAbwBmAHShGoAYaHR0cDovL3d3dy5t
// SIG // aWNyb3NvZnQuY29tMA0GCSqGSIb3DQEBAQUABIIBAGK5
// SIG // +eZZHlzSzSm/auIQNuaKXGHahFBONzNnjY78UzKayhzP
// SIG // jWD98RssX4Y0QBiAJP400lVdRSAlxO5qfH9Mf75E50p1
// SIG // 6PIKQH98TFWznpIKtSy6sQljfzeJth7uVF6KqpEXaDN3
// SIG // 0e4AcHiAaXwxs9V8LtppqSw2IFkzTiXxKp0YLEB/zuaz
// SIG // JdldjsOdTalD4qLOJ0MXvViHl4i4cTAQAIc10yLOv2+k
// SIG // yPnTCE4eIkfQGN6g4ix2cl9r4ZhhMKS5QwVP1blP5mR5
// SIG // EwOVoRhgDMR8vts/Bu4OvuV9QDMQIyhAYRlCKNjX+zZv
// SIG // 5sNAXnsBYH6CuHi+oshGR3kx6SKBnp+hgheUMIIXkAYK
// SIG // KwYBBAGCNwMDATGCF4Awghd8BgkqhkiG9w0BBwKgghdt
// SIG // MIIXaQIBAzEPMA0GCWCGSAFlAwQCAQUAMIIBUgYLKoZI
// SIG // hvcNAQkQAQSgggFBBIIBPTCCATkCAQEGCisGAQQBhFkK
// SIG // AwEwMTANBglghkgBZQMEAgEFAAQgNN3f+OXmS3r7X+kS
// SIG // 3CD2PWpe2Vy7HBsVtFrCxar/vGgCBmqpNejYsRgTMjAy
// SIG // NjA5MjIxMjQ0NDkuNzAxWjAEgAIB9KCB0aSBzjCByzEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjElMCMGA1UECxMcTWljcm9z
// SIG // b2Z0IEFtZXJpY2EgT3BlcmF0aW9uczEnMCUGA1UECxMe
// SIG // blNoaWVsZCBUU1MgRVNOOkE0MDAtMDVFMC1EOTQ3MSUw
// SIG // IwYDVQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2
// SIG // aWNloIIR6jCCByAwggUIoAMCAQICEzMAAAIo8KWH1/PI
// SIG // HkAAAQAAAigwDQYJKoZIhvcNAQELBQAwfDELMAkGA1UE
// SIG // BhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNV
// SIG // BAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBD
// SIG // b3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgUENBIDIwMTAwHhcNMjYwMjE5MTk0MDA2
// SIG // WhcNMjcwNTE3MTk0MDA2WjCByzELMAkGA1UEBhMCVVMx
// SIG // EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
// SIG // ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3Jh
// SIG // dGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJpY2Eg
// SIG // T3BlcmF0aW9uczEnMCUGA1UECxMeblNoaWVsZCBUU1Mg
// SIG // RVNOOkE0MDAtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNy
// SIG // b3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAro725P7KnAkk
// SIG // XmWiXwrn9TcEXHO15J4ROsJC6H5DY9ZsRAIN+astsXBY
// SIG // 4I2q7VbwNPVvEB3KcjKlUlzk8TRybJpNKj9ggy71ALpV
// SIG // oO2kuaATkaRF9aM959Edpz6nh9CBytcycY8Wh1ttQG7m
// SIG // dGfsDN1mDc5AZXB5lXtN2Ru65ZNvIe9q+T+TBPBRqRZm
// SIG // FuR5e6bCm4CxH62AIrabbbG/rGbAVCPoTCpeLiyWKLSs
// SIG // mb9XsDiIpwX0VPEKLIr46H2gXs1H/TXVfohq1od9tVp0
// SIG // rCtwPyZehi7W0ll3CVlC4G8bqp6GzyvmJQd9e+EzFk4F
// SIG // +GFoxu6NDrc/6YxzQigWwe/PHcp4S3RmOgdPBPfuEhq0
// SIG // abLcuIiRzsnRwgOTOIucmEcLHbrfoJr8SKU/MjVyXIyQ
// SIG // oNLzvJr/5xWPVsrb9qpgrQhRYrxlFqlNtP7FHkaKEGRo
// SIG // kDiUJ9PeQo94rCLL0T/ClO4TfxAyPB1bG/zT8zBS70c5
// SIG // 60Z49Ezpw4jk1HJ2MJpPl36EtaMLJHAggsB52wtNA+fM
// SIG // /N8uyuWSQe+OYXJ+AhNp0d3ukRrK+NsuarbejHc/7OzE
// SIG // 5w0tlJlR1l9V/x2Xt1JV/II/7ety+dMSD6pEQgRHTNQA
// SIG // zVGkn6PTkIim/249XYmQhk3xA1AQS6KdZoZMCBfNn2qZ
// SIG // Vdm7rGflOJECAwEAAaOCAUkwggFFMB0GA1UdDgQWBBSq
// SIG // yaWM+PLc6Lr1ZAVbYQEhaUPdwzAfBgNVHSMEGDAWgBSf
// SIG // pxVdAF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSg
// SIG // UqBQhk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // b3BzL2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIw
// SIG // UENBJTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBe
// SIG // MFwGCCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRp
// SIG // bWUtU3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNV
// SIG // HRMBAf8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMI
// SIG // MA4GA1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOC
// SIG // AgEAkOjXy5q0WoYFbYFoN/NxmktO3x8qHem4XFDjbdrX
// SIG // rfugWjbh9K+wAZFR4XjqcQXa1KzhGFRGiIovXSt3LmSz
// SIG // ZqdYlAMf1W5jmWJe8c/rTa4wlqq4NY0JqtKEQfIhOECa
// SIG // cDYRj+u6GOYbmCFNA+JYQ6Goan4CiZ/9AZPvVCgz8OV5
// SIG // VGJq3hZiZY/WEM3Dz3qfDMQV8Yf2OSO70HkWluUo7Yi0
// SIG // Di0ZN4IL62g7OUn+PTCVevwcMVwtq71HxBV+klA6KKii
// SIG // BPTYFSEatEWbuzrdItCLPh7zz9IQeisDsTINUlijn07R
// SIG // aVqXaPDCb4Cgh5D6VxM4Kaz/qciB7ju4FUZUk7G2ARS4
// SIG // dsiHf4rTOLmC9EftkkgQU6UkkbYaxrhJhJSOQQhzMczI
// SIG // P6Kh0j8GQCAJDNguMcYtEre6jLgPpvmcxWJH6BeNUKEi
// SIG // Z/h46oalmENJv0jvfypyUSSVMDHeU4jJ42fhPwyYlK8u
// SIG // bnYlskKb349oUBSNHY4WoaAFw2s3hHIixdrhJ07q/VH4
// SIG // 3MDrp/6DGPlC37ZzotoyizK63ldPe2pM8/ycaZw4GCVP
// SIG // 7YFO30H5YOyKoi/ftNu+vo6EB6NtZlXmOWA/Cof5FGmO
// SIG // iZvzkzPPBu3r08/6p0bpsaL04zErb6WwBzUYZkk3SD01
// SIG // d9gsrsQykv1eWuYsAPn/VYgaPsIwggdxMIIFWaADAgEC
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
// SIG // BgNVBAsTHm5TaGllbGQgVFNTIEVTTjpBNDAwLTA1RTAt
// SIG // RDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3Rh
// SIG // bXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUAda25hZM0
// SIG // u6gCtTmr9PAFJ4WzSFKggYMwgYCkfjB8MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0BAQsFAAIF
// SIG // AO5c7hAwIhgPMjAyNjA5MjIxMjA3NDRaGA8yMDI2MDky
// SIG // MzEyMDc0NFowdDA6BgorBgEEAYRZCgQBMSwwKjAKAgUA
// SIG // 7lzuEAIBADAHAgEAAgIoxDAHAgEAAgISpjAKAgUA7l4/
// SIG // kAIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgorBgEEAYRZ
// SIG // CgMCoAowCAIBAAIDB6EgoQowCAIBAAIDAYagMA0GCSqG
// SIG // SIb3DQEBCwUAA4IBAQARSXDuHYE1fv740NLISEl6MDK4
// SIG // IS84K3AGWsPHk1NwqptdIVplTanba8uFb00Z1D53lfXN
// SIG // irktSt9GlKJvZv0SzPjMwXKJgWzn8qUYGBFtpgFME987
// SIG // Cjz6pI0XyenVibdlOtP/tXp4ho9T3GP6Yin3Jt9zu8aV
// SIG // RHWYkfU2vtC++I/6o173ayOVFmqMjQ9Gi107K8iJzwjl
// SIG // +fJL/Lg4xSXa9j2R+FhMbYqu5msCg+lQ3mZP1AHsO6Cb
// SIG // 1kKCzXivfV0KcRK2xfJQxkBuwsHmPLAzp73xcm7exW+Y
// SIG // wOHrQycoRjtTmUI+b0H+14rbLuYcp9bjnNkQsGPv3F8Q
// SIG // /44TeXK7MYIEDTCCBAkCAQEwgZMwfDELMAkGA1UEBhMC
// SIG // VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcT
// SIG // B1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jw
// SIG // b3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUt
// SIG // U3RhbXAgUENBIDIwMTACEzMAAAIo8KWH1/PIHkAAAQAA
// SIG // AigwDQYJYIZIAWUDBAIBBQCgggFKMBoGCSqGSIb3DQEJ
// SIG // AzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0BCQQxIgQg
// SIG // CcvF0qpF/O+xCiq8WYU7QKArjfE5of9Oqfawo4Rb21Aw
// SIG // gfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHkMIG9BCBVsYpG
// SIG // UWBjX+KBFWStXk+OR/txkN/6sVe+VcLgbfoi1zCBmDCB
// SIG // gKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMT
// SIG // HU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMz
// SIG // AAACKPClh9fzyB5AAAEAAAIoMCIEIPrXdOqKkhhVBv8P
// SIG // TzKmmGDuq+vCaf/awVOhvV6jq1lHMA0GCSqGSIb3DQEB
// SIG // CwUABIICAIcN01KC9J4cdzhZ+c1xznwbV4v29m2lDyp2
// SIG // LGyvs54n7ZodYlSgBqGH7VnCCXlKloP74wVdzrwNJgU7
// SIG // B5v9VVVBr/7hPvDSn+b6ENEnDWAqAgm6Jl2gHvzXeOu3
// SIG // VWQX/ubM0PS6DJTqVCCb8+2uiGs+0yv+Eq4Gc1Sfwrzc
// SIG // T9dfwzxzoB45a2pig9RhgfJ0GdWKmNfiG5v+Yi5Schcz
// SIG // Koiefkh7GloASp/g6AYXQhN/SLnX2Kmx1kztNi+o6oE6
// SIG // no1rnzZ+LptvbIccqsFwtL6tVdSMcWo5c9iVsnuygWso
// SIG // 298XVrSnfQ7PxdpEg2D9/IcwjimX9ddZ5hRIo1/iM72v
// SIG // HB3dotfRSC05UoleE8cdW/QzruGEEbyAtH7yMNy/wGos
// SIG // B/BOGTSUtsD4A3ob+fajEB9xDi7+yWXishS3OBCLT6IH
// SIG // 7JP7ool2QggNpMsyoFo01zDxVPNrCU3/mSsMkMZOD/up
// SIG // z0Nuefvod+3q27rJtp1JJpfH74WwS6Tls6/6xxekSNVy
// SIG // QaVf8LSxJeo1meMnUcSyjFK7dwASK40IzxDnLkMoEHux
// SIG // x/GO9ZtPNlXgkA2NmT+en+DheMSGQe2+udptxDtdK5HL
// SIG // qxBRhukyqw6MsTnQQduu9wekkN0Y41GXWsZ2wJy7W4nA
// SIG // 475oKzVm/3PbRJjTZnx4nSsxjhtq3sOh
// SIG // End signature block
