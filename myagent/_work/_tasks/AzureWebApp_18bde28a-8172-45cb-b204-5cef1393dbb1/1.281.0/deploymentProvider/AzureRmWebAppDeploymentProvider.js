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
exports.AzureRmWebAppDeploymentProvider = void 0;
const tl = require("azure-pipelines-task-lib/task");
const publishProfileUtility = require("azure-pipelines-tasks-utility-common/publishProfileUtility");
const azure_arm_app_service_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-app-service");
const azure_arm_app_service_kudu_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-app-service-kudu");
const azureAppServiceUtility_1 = require("azure-pipelines-tasks-azure-arm-rest/azureAppServiceUtility");
const constants_1 = require("azure-pipelines-tasks-azure-arm-rest/constants");
const packageUtility_1 = require("azure-pipelines-tasks-webdeployment-common/packageUtility");
const ParameterParser = require("azure-pipelines-tasks-webdeployment-common/ParameterParserUtility");
const AzureAppServiceUtilityExt_1 = require("../operations/AzureAppServiceUtilityExt");
const KuduServiceUtility_1 = require("../operations/KuduServiceUtility");
const ReleaseAnnotationUtility_1 = require("../operations/ReleaseAnnotationUtility");
class AzureRmWebAppDeploymentProvider {
    constructor(taskParams) {
        this.virtualApplicationPath = "";
        this.taskParams = taskParams;
        let packageArtifactAlias = packageUtility_1.PackageUtility.getArtifactAlias(this.taskParams.Package.getPath());
        tl.setVariable(constants_1.AzureDeployPackageArtifactAlias, packageArtifactAlias);
    }
    PreDeploymentStep() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.taskParams.azureEndpoint.scheme && this.taskParams.azureEndpoint.scheme.toLowerCase() === constants_1.AzureRmEndpointAuthenticationScheme.PublishProfile) {
                let publishProfileEndpoint = this.taskParams.azureEndpoint;
                this.publishProfileScmCredentials = yield publishProfileUtility.getSCMCredentialsFromPublishProfile(publishProfileEndpoint.PublishProfile);
                const buffer = new Buffer(this.publishProfileScmCredentials.username + ':' + this.publishProfileScmCredentials.password);
                const auth = buffer.toString("base64");
                var authHeader = "Basic " + auth;
                tl.debug("Kudu: using basic authentication for publish profile");
                console.log('##vso[telemetry.publish area=TaskDeploymentMethod;feature=AzureAppServiceDeployment]{"authMethod":"Basic"}');
                this.kuduService = new azure_arm_app_service_kudu_1.Kudu(this.publishProfileScmCredentials.scmUri, authHeader);
                let resourceId = publishProfileEndpoint.resourceId;
                let resourceIdSplit = resourceId.split("/");
                this.slotName = resourceIdSplit.length === 11 ? resourceIdSplit[10] : "production";
            }
            else {
                this.appService = new azure_arm_app_service_1.AzureAppService(this.taskParams.azureEndpoint, this.taskParams.ResourceGroupName, this.taskParams.WebAppName, this.taskParams.SlotName, this.taskParams.WebAppKind);
                this.appServiceUtility = new azureAppServiceUtility_1.AzureAppServiceUtility(this.appService);
                this.appServiceUtilityExt = new AzureAppServiceUtilityExt_1.AzureAppServiceUtilityExt(this.appService);
                const warmUpInstance = yield this.getWarmupInstanceId();
                if (warmUpInstance) {
                    tl.debug(`Using instance ${warmUpInstance} for warmup.`);
                }
                else {
                    tl.debug('No specific instance for warmup, using default endpoint.');
                }
                this.kuduService = yield this.appServiceUtility.getKuduService(warmUpInstance);
                this.slotName = this.appService.getSlot();
            }
            this.kuduServiceUtility = new KuduServiceUtility_1.KuduServiceUtility(this.kuduService);
        });
    }
    DeployWebAppStep() {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    UpdateDeploymentStatus(isDeploymentSuccess) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!!this.appService) {
                yield (0, ReleaseAnnotationUtility_1.addReleaseAnnotation)(this.taskParams.azureEndpoint, this.appService, isDeploymentSuccess);
            }
            if (!!this.kuduServiceUtility) {
                this.activeDeploymentID = yield this.kuduServiceUtility.updateDeploymentStatus(isDeploymentSuccess, null, { 'type': 'Deployment', slotName: this.slotName });
                tl.debug('Active DeploymentId :' + this.activeDeploymentID);
            }
            let appServiceApplicationUrl;
            if (!!this.appServiceUtility) {
                appServiceApplicationUrl = yield this.appServiceUtility.getApplicationURL();
            }
            else {
                appServiceApplicationUrl = this.publishProfileScmCredentials.applicationUrl;
            }
            console.log(tl.loc('AppServiceApplicationURL', appServiceApplicationUrl));
            tl.setVariable('AppServiceApplicationUrl', appServiceApplicationUrl);
        });
    }
    PostDeploymentStep() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!!this.appServiceUtility) {
                if (this.taskParams.AppSettings) {
                    var customApplicationSettings = ParameterParser.parse(this.taskParams.AppSettings);
                    yield this.appServiceUtility.updateAndMonitorAppSettings(customApplicationSettings);
                }
                if (this.taskParams.ConfigurationSettings) {
                    var customConfigurationSettings = ParameterParser.parse(this.taskParams.ConfigurationSettings);
                    yield this.appService.updateConfigurationSettings(customConfigurationSettings);
                }
                yield this.appServiceUtilityExt.updateScmTypeAndConfigurationDetails();
            }
        });
    }
    // Get the warmup instance id.
    getWarmupInstanceId() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const instances = yield this.appServiceUtility.getAppserviceInstances();
                if (((_a = instances === null || instances === void 0 ? void 0 : instances.value) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                    // Sort by name and pick the first one.
                    const sortedInstances = instances.value.sort((a, b) => a.name.localeCompare(b.name));
                    return sortedInstances[0].name;
                }
            }
            catch (error) {
                tl.debug(`Failed to get app service instances - ${error}`);
            }
            return undefined;
        });
    }
}
exports.AzureRmWebAppDeploymentProvider = AzureRmWebAppDeploymentProvider;

// SIG // Begin signature block
// SIG // MIInawYJKoZIhvcNAQcCoIInXDCCJ1gCAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // jp/UtetNf1K71XH0K3tfriCjh9Cdic7D/0av2JkQYnSg
// SIG // ggzJMIIGBDCCA+ygAwIBAgITMwAAAhz6zcWb6C9+xAAA
// SIG // AAACHDANBgkqhkiG9w0BAQsFADBXMQswCQYDVQQGEwJV
// SIG // UzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWduaW5n
// SIG // IFBDQSAyMDI0MB4XDTI2MDQxNjE4NTk0MVoXDTI3MDQx
// SIG // NTE4NTk0MVowdDELMAkGA1UEBhMCVVMxEzARBgNVBAgT
// SIG // Cldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAc
// SIG // BgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEeMBwG
// SIG // A1UEAxMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMIIBIjAN
// SIG // BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1bGX4Dip
// SIG // jN9Rz36FjqDRIsNEpQoiMVDAtCPTTFm7nCjsP3vZT6AK
// SIG // HoUFbukhuuVeBD862LJwZxTzaIuPx6DnY4c9apKxLeCO
// SIG // rRHMV1OqDnmPcxr3gv94gXroS2MTNzPz5HFKHmxfjXnZ
// SIG // 5vDpHUj6A7vIplYhz0Kv/AkFLtFkUeKxPnTEX66Van5j
// SIG // Ytqlgl/eE+DLHqYoxlZMBP/7SYNK8gImHR09+C0p5Rv0
// SIG // UgWZkERlmeYPI6pyo0T2q0qjH7dYL47lE1YLVjWX4HCx
// SIG // UiuVmtJsq6vDj3IExhrEYLp/rZ0kviMQ08VbADx9Ts7z
// SIG // 48KJoLgcoVHvznL1DdA+Vpqe8QIDAQABo4IBqjCCAaYw
// SIG // DgYDVR0PAQH/BAQDAgeAMB8GA1UdJQQYMBYGCisGAQQB
// SIG // gjdMCAEGCCsGAQUFBwMDMB0GA1UdDgQWBBTaB+2tmA4z
// SIG // ksKZKegx3JlEuyftMjBUBgNVHREETTBLpEkwRzEtMCsG
// SIG // A1UECxMkTWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0aW9u
// SIG // cyBMaW1pdGVkMRYwFAYDVQQFEw0yMzAwMTIrNTA3NTY5
// SIG // MB8GA1UdIwQYMBaAFH9ZP1Qh2q1P7wXl5qPXLQaUEggx
// SIG // MGAGA1UdHwRZMFcwVaBToFGGT2h0dHA6Ly93d3cubWlj
// SIG // cm9zb2Z0LmNvbS9wa2lvcHMvY3JsL01pY3Jvc29mdCUy
// SIG // MENvZGUlMjBTaWduaW5nJTIwUENBJTIwMjAyNC5jcmww
// SIG // bQYIKwYBBQUHAQEEYTBfMF0GCCsGAQUFBzAChlFodHRw
// SIG // Oi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2NlcnRz
// SIG // L01pY3Jvc29mdCUyMENvZGUlMjBTaWduaW5nJTIwUENB
// SIG // JTIwMjAyNC5jcnQwDAYDVR0TAQH/BAIwADANBgkqhkiG
// SIG // 9w0BAQsFAAOCAgEAFJxKoWkV3tE94SCY73UBKxJKwP+2
// SIG // wco5+reSAKzg5JEY85GMLSjHNsmI9qrmjay7rVsNmGXJ
// SIG // 4Cj8tW+9WMgyUE8uDQ0cGkofU8ObYa5NzZnD6wB4mub7
// SIG // XASdQoLSiu5kGyHENtnfzd/Nd2sggwxXsLtfo7GZl/q/
// SIG // 2kxKmjjOE1cVbUUpLgsvJwFyrgoTii4v8wOF7h/IhGKi
// SIG // LI9mKDWnksVZnhohEV6SnaN3Q5mItJDucNg/FUuHN/vY
// SIG // eoBJWAWgAIP3WBKwYNu6k9779M0QyYSbn7wjcpQPEu//
// SIG // vB+RPz1eXJ4Op2vVVf8PTld6rrjQ+s3RmthF9/BpaedB
// SIG // fQCEJN6dsV5nL6Kw3jOFye1JVmAYuoPNCdUkjkJyJwmB
// SIG // RJrH1DZ9/tQGkySkiS/N6rigK02nNqSobtGM88686Oh6
// SIG // 7EYkCs6Z0QW9f3TGuj94c++V2zEQXLTbBYWQtO1gpoxM
// SIG // XS4Nnh1ubldE2PA+fusKMyX+7xd/lh5GDzvOWfgQulOB
// SIG // ZDW2DcnGfXBOI9bV0Xcgwn5penNB1jx4zVQzm67/ZSrd
// SIG // 6lKhaV9/FQqlQsjTjtVHF30IlYycN9lNllCmY7f53iSh
// SIG // xAbJvZBbC7ls5EOd/qnGkmsrZrAp5NoDoJa5Q+Xd5Csr
// SIG // 7wMPq85tJU/Ct/D+jy8X2UB4buFvHVewL/DdmZgwgga9
// SIG // MIIEpaADAgECAhMzAAAAOTu2Nxm/Bh1nAAAAAAA5MA0G
// SIG // CSqGSIb3DQEBDAUAMIGIMQswCQYDVQQGEwJVUzETMBEG
// SIG // A1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9u
// SIG // ZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MTIwMAYDVQQDEylNaWNyb3NvZnQgUm9vdCBDZXJ0aWZp
// SIG // Y2F0ZSBBdXRob3JpdHkgMjAxMTAeFw0yNDA4MDgyMDU0
// SIG // MThaFw0zNjAzMjIyMjEzMDRaMFcxCzAJBgNVBAYTAlVT
// SIG // MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // KDAmBgNVBAMTH01pY3Jvc29mdCBDb2RlIFNpZ25pbmcg
// SIG // UENBIDIwMjQwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAw
// SIG // ggIKAoICAQDYAZwe4zjHqpUWBzWtuub+CGPXx/EyoXph
// SIG // 3zyDXtYKS2ld3YYN9uFsB9Oi3B26Z7AbpAgzYra8qNHb
// SIG // UvxFuiP8hC/2y0mPISqW30LlrrAT6/ams2HA8Qlv6p42
// SIG // +SbCNbPGzToN21QE70FS+LXH9N2k8nLM/EHgnTNJf8h0
// SIG // TmyfUKmszNa+lTxDieyy/rhBG+98OkArobPPWtbr9c3q
// SIG // zmDJ7J3kUcAm6cltdSHIIFNHESgw6taY1ScyGyBevqIl
// SIG // 120XjrIHiPM7tRckHytH1ZGsmvEplR0P7Tn9t5meFvZN
// SIG // EYttkFvad1IEguTlA5LSscXAphi+rVy3zhklhyCFeGK0
// SIG // yU0+jzbcuURKIxybmRwK5BfVZx0xEVqE4wM3yN5D/uW+
// SIG // GpVHYYAGe7bTrtW1Z13x2qj2Jdqz7NtI4tNyzlVrIf62
// SIG // nYBNe3rOYS/repVdHlR61YbLLETlibs9jFzAre4sO5RT
// SIG // xvS1yho7JqJ59oKLRnRyLhIOSZyTCVZosXeS0ZZJoGEW
// SIG // Ss4cUgsMqBiKtD4WgO2PlT3LeaQh5Io3CCA5tJ5ZCvtC
// SIG // snqaJXKhptE/xmEETIRyZRjjplUKKd+sFFVGJJVMvvrw
// SIG // 1nhIBKOLO4cTepiG39jEiEP4iHzGYCcQuvaLpDFFwqzg
// SIG // t0pBP8SJIKX5dtjDNYrZGd+ZzV5DKJVNZQIDAQABo4IB
// SIG // TjCCAUowDgYDVR0PAQH/BAQDAgGGMBAGCSsGAQQBgjcV
// SIG // AQQDAgEAMB0GA1UdDgQWBBR/WT9UIdqtT+8F5eaj1y0G
// SIG // lBIIMTAZBgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMAQTAP
// SIG // BgNVHRMBAf8EBTADAQH/MB8GA1UdIwQYMBaAFHItOgIx
// SIG // kEO5FAVO4eqnxzHRI4k0MFoGA1UdHwRTMFEwT6BNoEuG
// SIG // SWh0dHA6Ly9jcmwubWljcm9zb2Z0LmNvbS9wa2kvY3Js
// SIG // L3Byb2R1Y3RzL01pY1Jvb0NlckF1dDIwMTFfMjAxMV8w
// SIG // M18yMi5jcmwwXgYIKwYBBQUHAQEEUjBQME4GCCsGAQUF
// SIG // BzAChkJodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // L2NlcnRzL01pY1Jvb0NlckF1dDIwMTFfMjAxMV8wM18y
// SIG // Mi5jcnQwDQYJKoZIhvcNAQEMBQADggIBABSUHzgoT+6J
// SIG // 5+nyyDCq0pTdVmCsAxYAHXcpjlDtxazPHewf1v4kOg8V
// SIG // 7A5+w+VuMDMGHi8rLXBKn5I8+DVEUYGs8jLuckc0IeC6
// SIG // owOLUrU3CYdaKRMaO55+T7jwWJ27tPkx0rlR03tFU0z1
// SIG // YYpcv6Yhaw6N2sUPT+AvjpecnrftoE33pCAkucUvnGH0
// SIG // iL4J9CZLFQVTGFSOUBbv6oZy4bBBRFMxvH779IY4JDvp
// SIG // ZKVfbcuhpDeL3Z3e8mukOmkfct+GojNapsWsQYujlJ8j
// SIG // Zen5Lrp/3YkxZ2Ay06aTpK/5oOVknwog1TDQsbY+MDyg
// SIG // uTph5tQ0CLfzDaJG2x91BrBT9UG87C6HLkqiwrx9PSKN
// SIG // 3wz05rHEfWO+RuKl+0U1/AHQT6NCOjhKI39/c7hWbdKj
// SIG // h5uuWFkBOvXGTNrnhNTAdOXTTYByvYExO8yryv34PAdq
// SIG // o1vPDE/1heVebr2RramvRUi9kWswKwPqwz7n+iRmM+B6
// SIG // YDGRweEurM1kimAb9FYrAs38YHlPnarl1vW3dGrmJTge
// SIG // fAz3DmCnXN0nveIPsS+KXBIWweeCToAJMGE7v/XS3h9q
// SIG // Q6niWQAAVQ1kUAml3zuS4MisCgi2F6YoK2WAo1EgXK/l
// SIG // XvDxVjIVU0JdL+KvCfwFJkDeVuJ9dNXGNi+AOxk0BtYd
// SIG // 9hxwL30BElj9MYIZ+jCCGfYCAQEwbjBXMQswCQYDVQQG
// SIG // EwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWdu
// SIG // aW5nIFBDQSAyMDI0AhMzAAACHPrNxZvoL37EAAAAAAIc
// SIG // MA0GCWCGSAFlAwQCAQUAoIGuMBkGCSqGSIb3DQEJAzEM
// SIG // BgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAMBgor
// SIG // BgEEAYI3AgEVMC8GCSqGSIb3DQEJBDEiBCDLeVCumHMr
// SIG // MZFKxht/Mt5fNeKMbkB00v91uoI05NEYqTBCBgorBgEE
// SIG // AYI3AgEMMTQwMqAUgBIATQBpAGMAcgBvAHMAbwBmAHSh
// SIG // GoAYaHR0cDovL3d3dy5taWNyb3NvZnQuY29tMA0GCSqG
// SIG // SIb3DQEBAQUABIIBAE1y8qcXl3UYYTzylsS96/r02Tzx
// SIG // PZEXL34IM9U/f0aMt9sfq/AKPLMbldjQ0DNRFUOfirWz
// SIG // Rf4hTxrRSbabA1kyXeKh417hJRVORrx7EKxY0JmqIVY5
// SIG // 80aXRsv4NlJedGfmNDuyHhyJcRUda8jBY2cnt65HWUOr
// SIG // zgRSwYGWdJOtRf5aHzgbLJlYoDfT9klJk7aN6UTZu7MF
// SIG // W4vp/1OND9XBQlCcdp2HB7QAfqnax8Zy1yhO5mZJgHfZ
// SIG // nonrHIy/NPgpB/qUVBYpvfb6ZOOkb2lGDv+Mv8LwqhrR
// SIG // +0bLSic+WYlCpm285g97Xd0a4FDSk1IPWahMmLNZuVz/
// SIG // J8jkO42hghesMIIXqAYKKwYBBAGCNwMDATGCF5gwgheU
// SIG // BgkqhkiG9w0BBwKggheFMIIXgQIBAzEPMA0GCWCGSAFl
// SIG // AwQCAQUAMIIBWQYLKoZIhvcNAQkQAQSgggFIBIIBRDCC
// SIG // AUACAQEGCisGAQQBhFkKAwEwMTANBglghkgBZQMEAgEF
// SIG // AAQgfhWW8tIlrDDIpM3yPTpAlMEXd+zzVVapxp1+lNJO
// SIG // jr0CBmquN2+1xRgSMjAyNjA5MjIxMjQ1MzIuNzVaMASA
// SIG // AgH0oIHZpIHWMIHTMQswCQYDVQQGEwJVUzETMBEGA1UE
// SIG // CBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEe
// SIG // MBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMS0w
// SIG // KwYDVQQLEyRNaWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRp
// SIG // b25zIExpbWl0ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNT
// SIG // IEVTTjo0MDFBLTA1RTAtRDk0NzElMCMGA1UEAxMcTWlj
// SIG // cm9zb2Z0IFRpbWUtU3RhbXAgU2VydmljZaCCEfswggco
// SIG // MIIFEKADAgECAhMzAAACGV6y2FR19LGNAAEAAAIZMA0G
// SIG // CSqGSIb3DQEBCwUAMHwxCzAJBgNVBAYTAlVTMRMwEQYD
// SIG // VQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25k
// SIG // MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // JjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBD
// SIG // QSAyMDEwMB4XDTI1MDgxNDE4NDgyNloXDTI2MTExMzE4
// SIG // NDgyNlowgdMxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
// SIG // YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
// SIG // VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xLTArBgNV
// SIG // BAsTJE1pY3Jvc29mdCBJcmVsYW5kIE9wZXJhdGlvbnMg
// SIG // TGltaXRlZDEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNO
// SIG // OjQwMUEtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNyb3Nv
// SIG // ZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkqhkiG
// SIG // 9w0BAQEFAAOCAg8AMIICCgKCAgEApqFIyUkzIyxpL3Q0
// SIG // 3WmLuy4G9YIUScznhKr+cHOT+/u7ParxI96gxxb1WrWu
// SIG // AxB8qjGLfsbImx8V3ouK1nUcf+R/nsnXas5/iTgV/Tl3
// SIG // QTRGT0DeuXBNbpHqc+wC1NiTyA76gLnirvSBEoBzlrpN
// SIG // QFEnuwdbPLCLpTS3KWSCu5J02b+RFWR/kcFzVxnhoE3g
// SIG // IaeURtrGKGBZGKLBXvqggkDENtKkvtvRT32xLvAvL/Rp
// SIG // Reu5z18ZojCs72ZSoa74Dy8YbaWsDm3OZOpJRZxZsPKC
// SIG // HZ6xNqgFKf0xNHj0t9v0Q3W+2z5gAVaasJJCvR52Sl0X
// SIG // J2AOf3l0LSetXgUA5gD5IQ1RvEslTmNnSouTrGID3D1n
// SIG // jY7mBu0puiIdPK2jK/1Weef2+YR4cQpWQkeBZmXidh9A
// SIG // uWdlwxKQL15LJ6K2dw8y/t/PBhmLyt6QAf0CepWRdgZn
// SIG // MytVAUuWHwlZRV9JLY7aX8D55eL9+cOLpX3bGNOmN24U
// SIG // pIW8qtZaqXaesFvIOW23JNLhaaQVvObr1eu7GE/5Mn43
// SIG // e+/DbtdYl/bLP2IQ1xYEJdSbcUkDFfW3KlZEh+nBKDta
// SIG // RnNRkbgIgxIbKdT38OKQwZ/aA4uSsiAg6nEPiWBHGuyt
// SIG // Io5wU75M5VdjhEqqTHfXYu8BJi6GTzvWT+9ekfMXezqC
// SIG // kksxaG8CAwEAAaOCAUkwggFFMB0GA1UdDgQWBBSAaOo5
// SIG // HWatNzqZn1IF1fcD6nr3ITAfBgNVHSMEGDAWgBSfpxVd
// SIG // AF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSgUqBQ
// SIG // hk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3Bz
// SIG // L2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIwUENB
// SIG // JTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBeMFwG
// SIG // CCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29mdC5j
// SIG // b20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRpbWUt
// SIG // U3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNVHRMB
// SIG // Af8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMIMA4G
// SIG // A1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOCAgEA
// SIG // XxzVZLLXBFfoCCCTiY7MHXdb7civJSTfrHYJC5Ok2NN7
// SIG // 5NpzTMT9V2TcIQjfQ3AFUbh1NBAYtMUuwxC6D4ceEXG5
// SIG // lXAnbvkC9YjeLVDRyImXYYmft7z+Qpl9t3C/8a0tiqnO
// SIG // z8Ue8/DYLtMTgvWMnsqLNjILDaImOfnHI36TLCjGFe8R
// SIG // YLXGdCUdOLlfAdMGePxSTA3TAAOc+GQbmPWjrguLWbxv
// SIG // nl3NVjRvrBZVkxFMoVZH0f7qGwDOShjpnv5nYnQ48ufL
// SIG // 0uBz52RbPGdX4Fv9+UGOrBprmcHzmIutFtJec2Y4kujN
// SIG // tTK2wBGgWscEOVhFiaVdje8VLJ7MVNKE5TmsuGM3jTLr
// SIG // 1nuR5AFGs3UKkP7g3cQD4cHK7XdLiTm7e606QJ+WqeQs
// SIG // ADYE9dvU9wIUbI9Dl4UcIErFw+FHaWSTrkfJ4SvLmhKn
// SIG // l5khhpJ1sF3z6e1BxepUliXHqzRLiHWihWIWESF8IHEl
// SIG // F3POxbP4VJqHBiYvaXMV0SyRgwoD6zXddbUnX9WR6JL2
// SIG // BlqAjjHxINwelsp/VhxAWThzuMA58LxvE/VAzjfFF4Wm
// SIG // 7a1ZALmJVw3oL/s/uxo1Op4tcT+hfZ9uN1htC1JN4DuR
// SIG // qFfLttjuoAmUQobO5zUFRzvCn8Ck/hiO+bzR15sqkjlx
// SIG // LMyMjpkc/ef4SUUikD468vUwggdxMIIFWaADAgECAhMz
// SIG // AAAAFcXna54Cm0mZAAAAAAAVMA0GCSqGSIb3DQEBCwUA
// SIG // MIGIMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGlu
// SIG // Z3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMV
// SIG // TWljcm9zb2Z0IENvcnBvcmF0aW9uMTIwMAYDVQQDEylN
// SIG // aWNyb3NvZnQgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3Jp
// SIG // dHkgMjAxMDAeFw0yMTA5MzAxODIyMjVaFw0zMDA5MzAx
// SIG // ODMyMjVaMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
// SIG // YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
// SIG // VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNV
// SIG // BAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEw
// SIG // MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA
// SIG // 5OGmTOe0ciELeaLL1yR5vQ7VgtP97pwHB9KpbE51yMo1
// SIG // V/YBf2xK4OK9uT4XYDP/XE/HZveVU3Fa4n5KWv64NmeF
// SIG // RiMMtY0Tz3cywBAY6GB9alKDRLemjkZrBxTzxXb1hlDc
// SIG // wUTIcVxRMTegCjhuje3XD9gmU3w5YQJ6xKr9cmmvHaus
// SIG // 9ja+NSZk2pg7uhp7M62AW36MEBydUv626GIl3GoPz130
// SIG // /o5Tz9bshVZN7928jaTjkY+yOSxRnOlwaQ3KNi1wjjHI
// SIG // NSi947SHJMPgyY9+tVSP3PoFVZhtaDuaRr3tpK56KTes
// SIG // y+uDRedGbsoy1cCGMFxPLOJiss254o2I5JasAUq7vnGp
// SIG // F1tnYN74kpEeHT39IM9zfUGaRnXNxF803RKJ1v2lIH1+
// SIG // /NmeRd+2ci/bfV+AutuqfjbsNkz2K26oElHovwUDo9Fz
// SIG // pk03dJQcNIIP8BDyt0cY7afomXw/TNuvXsLz1dhzPUNO
// SIG // wTM5TI4CvEJoLhDqhFFG4tG9ahhaYQFzymeiXtcodgLi
// SIG // Mxhy16cg8ML6EgrXY28MyTZki1ugpoMhXV8wdJGUlNi5
// SIG // UPkLiWHzNgY1GIRH29wb0f2y1BzFa/ZcUlFdEtsluq9Q
// SIG // BXpsxREdcu+N+VLEhReTwDwV2xo3xwgVGD94q0W29R6H
// SIG // XtqPnhZyacaue7e3PmriLq0CAwEAAaOCAd0wggHZMBIG
// SIG // CSsGAQQBgjcVAQQFAgMBAAEwIwYJKwYBBAGCNxUCBBYE
// SIG // FCqnUv5kxJq+gpE8RjUpzxD/LwTuMB0GA1UdDgQWBBSf
// SIG // pxVdAF5iXYP05dJlpxtTNRnpcjBcBgNVHSAEVTBTMFEG
// SIG // DCsGAQQBgjdMg30BATBBMD8GCCsGAQUFBwIBFjNodHRw
// SIG // Oi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL0RvY3Mv
// SIG // UmVwb3NpdG9yeS5odG0wEwYDVR0lBAwwCgYIKwYBBQUH
// SIG // AwgwGQYJKwYBBAGCNxQCBAweCgBTAHUAYgBDAEEwCwYD
// SIG // VR0PBAQDAgGGMA8GA1UdEwEB/wQFMAMBAf8wHwYDVR0j
// SIG // BBgwFoAU1fZWy4/oolxiaNE9lJBb186aGMQwVgYDVR0f
// SIG // BE8wTTBLoEmgR4ZFaHR0cDovL2NybC5taWNyb3NvZnQu
// SIG // Y29tL3BraS9jcmwvcHJvZHVjdHMvTWljUm9vQ2VyQXV0
// SIG // XzIwMTAtMDYtMjMuY3JsMFoGCCsGAQUFBwEBBE4wTDBK
// SIG // BggrBgEFBQcwAoY+aHR0cDovL3d3dy5taWNyb3NvZnQu
// SIG // Y29tL3BraS9jZXJ0cy9NaWNSb29DZXJBdXRfMjAxMC0w
// SIG // Ni0yMy5jcnQwDQYJKoZIhvcNAQELBQADggIBAJ1Vffwq
// SIG // reEsH2cBMSRb4Z5yS/ypb+pcFLY+TkdkeLEGk5c9MTO1
// SIG // OdfCcTY/2mRsfNB1OW27DzHkwo/7bNGhlBgi7ulmZzpT
// SIG // Td2YurYeeNg2LpypglYAA7AFvonoaeC6Ce5732pvvinL
// SIG // btg/SHUB2RjebYIM9W0jVOR4U3UkV7ndn/OOPcbzaN9l
// SIG // 9qRWqveVtihVJ9AkvUCgvxm2EhIRXT0n4ECWOKz3+SmJ
// SIG // w7wXsFSFQrP8DJ6LGYnn8AtqgcKBGUIZUnWKNsIdw2Fz
// SIG // Lixre24/LAl4FOmRsqlb30mjdAy87JGA0j3mSj5mO0+7
// SIG // hvoyGtmW9I/2kQH2zsZ0/fZMcm8Qq3UwxTSwethQ/gpY
// SIG // 3UA8x1RtnWN0SCyxTkctwRQEcb9k+SS+c23Kjgm9swFX
// SIG // SVRk2XPXfx5bRAGOWhmRaw2fpCjcZxkoJLo4S5pu+yFU
// SIG // a2pFEUep8beuyOiJXk+d0tBMdrVXVAmxaQFEfnyhYWxz
// SIG // /gq77EFmPWn9y8FBSX5+k77L+DvktxW/tM4+pTFRhLy/
// SIG // AsGConsXHRWJjXD+57XQKBqJC4822rpM+Zv/Cuk0+CQ1
// SIG // ZyvgDbjmjJnW4SLq8CdCPSWU5nR0W2rRnj7tfqAxM328
// SIG // y+l7vzhwRNGQ8cirOoo6CGJ/2XBjU02N7oJtpQUQwXEG
// SIG // ahC0HVUzWLOhcGbyoYIDVjCCAj4CAQEwggEBoYHZpIHW
// SIG // MIHTMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGlu
// SIG // Z3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMV
// SIG // TWljcm9zb2Z0IENvcnBvcmF0aW9uMS0wKwYDVQQLEyRN
// SIG // aWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRpb25zIExpbWl0
// SIG // ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNTIEVTTjo0MDFB
// SIG // LTA1RTAtRDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUA
// SIG // MXYp/Wqqdyb0enigrLfxl0InAz6ggYMwgYCkfjB8MQsw
// SIG // CQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQ
// SIG // MA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9z
// SIG // b2Z0IENvcnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3Nv
// SIG // ZnQgVGltZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0B
// SIG // AQsFAAIFAO5cqjUwIhgPMjAyNjA5MjIwNzE4MTNaGA8y
// SIG // MDI2MDkyMzA3MTgxM1owdDA6BgorBgEEAYRZCgQBMSww
// SIG // KjAKAgUA7lyqNQIBADAHAgEAAgIWRDAHAgEAAgISiDAK
// SIG // AgUA7l37tQIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgor
// SIG // BgEEAYRZCgMCoAowCAIBAAIDB6EgoQowCAIBAAIDAYag
// SIG // MA0GCSqGSIb3DQEBCwUAA4IBAQClQro3imi0deTubvtU
// SIG // WU8gJ1FzQASX/cfLCg8Pv3yNs9FL2NSmZjiVl2qSpPKY
// SIG // C6ikO9NCIn2qcThwhdEYweUuIwa2zEV/FInefKL+Qk0F
// SIG // lwP0l+K4dj9dkP89+JEDg7wf6RW0ADcZGqOpk8eanymg
// SIG // g3ms6fkPzqMp26boHPY4k1NkG32a6NhiXUj3qqPLm/Bx
// SIG // 3xrc/U8g/SCBvPRXKDMDsd7/fJFRFqStWxyjx9DPJr//
// SIG // am/ELRka3W/AVYsIaCvHfT07yCrRy2nPj2wJ7LEtKVnl
// SIG // 2gxBgR3uXM/VwYeBbO5igmR+xW1av2oXACgtfHutCmK7
// SIG // ZF/CCal+8r6RGjgXMYIEDTCCBAkCAQEwgZMwfDELMAkG
// SIG // A1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAO
// SIG // BgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29m
// SIG // dCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0
// SIG // IFRpbWUtU3RhbXAgUENBIDIwMTACEzMAAAIZXrLYVHX0
// SIG // sY0AAQAAAhkwDQYJYIZIAWUDBAIBBQCgggFKMBoGCSqG
// SIG // SIb3DQEJAzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0B
// SIG // CQQxIgQgJY5k6ehFnVECt3d8CEwgln6TbFiIfFNynTii
// SIG // 8y7qNmwwgfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHkMIG9
// SIG // BCDckX633E1y1EF32V18zQcrsgjzI9+3Le7mlvk2Oebt
// SIG // hjCBmDCBgKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAk
// SIG // BgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAy
// SIG // MDEwAhMzAAACGV6y2FR19LGNAAEAAAIZMCIEIP9Dxwu5
// SIG // OOhSa2b8lml+D99H3zR8qQ8McVzWvK2AF5Q+MA0GCSqG
// SIG // SIb3DQEBCwUABIICAGtJfn4JiGpx/pwkLUlfISDnMToj
// SIG // PFFg4TRi/YZBKxznV8sQvLLKkBG5mJL3pqBNHEiVSRLe
// SIG // TVRQvSIEVvzeJ3+Iq/YkOxm7il07Gwrmg6JEO5479dRF
// SIG // zcNDr3bUUwmUfS0NlvUTV6FPRodg1qz5xX8vX74jUpN1
// SIG // o7FfQsQY+c3i/myKvM1hxURzNRBPSV0ws6l0ifG07x/I
// SIG // HQFljMjgx06cTh+DOzVx0QWuXC054ioXIUUMGK0YjYbi
// SIG // Imung1R+86YPMEi+8op2TSbDcooGud3Te1Rqjm5J5dpL
// SIG // LJQ2sBzybvZSckqyrBEj0oV/BtrICxE+RVkYrUwKdC8a
// SIG // Rs8AN1GRqRmO1d8izlMcNdJNSs4xsN+x1bzxZ3FEBlff
// SIG // izKH2Kb0SpLMbQsqznLbgMGeI0UdbG7nKGGRhRMX2gra
// SIG // 7Tf3kYGrqNt5bTwZ9pX48suU3bGSwJHSROZPglhNiSHN
// SIG // qLzvHypPhGdJIfqgl9xRBCVbUIRDiGhZGgLpOzLOAeEY
// SIG // 4W416c944VaKXUUUousFWuvdKfMBX+/bjiygxMuEtd2n
// SIG // 1xg9Tn4eQ19G6+tTLoAcdubCAKOBbG0hpH0ozAqU3Dn2
// SIG // +7WXOubIrWhHavYV4fe0oc/vUCFamFIr3A+P3WrUBB3L
// SIG // PIh57Uw7A/Q/qFBXtrwzKT081SDMKKYv68lS0Wup
// SIG // End signature block
