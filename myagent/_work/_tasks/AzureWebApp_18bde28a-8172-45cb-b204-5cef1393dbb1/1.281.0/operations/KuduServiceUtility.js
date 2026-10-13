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
exports.KuduServiceUtility = void 0;
const path = require("path");
const tl = require("azure-pipelines-task-lib/task");
const constants_1 = require("azure-pipelines-tasks-azure-arm-rest/constants");
const azure_arm_app_service_kudu_1 = require("azure-pipelines-tasks-azure-arm-rest/azure-arm-app-service-kudu");
const webClient = require("azure-pipelines-tasks-azure-arm-rest/webClient");
var deployUtility = require('azure-pipelines-tasks-webdeployment-common/utility');
var zipUtility = require('azure-pipelines-tasks-webdeployment-common/ziputility');
const physicalRootPath = '/site/wwwroot';
const deploymentFolder = 'site/deployments';
const manifestFileName = 'manifest';
const VSTS_ZIP_DEPLOY = 'VSTS_ZIP_DEPLOY';
const VSTS_DEPLOY = 'VSTS';
class KuduServiceUtility {
    constructor(kuduService) {
        this._appServiceKuduService = kuduService;
    }
    createPathIfRequired(phsyicalPath) {
        return __awaiter(this, void 0, void 0, function* () {
            var listDir = yield this._appServiceKuduService.listDir(phsyicalPath);
            if (listDir == null) {
                yield this._appServiceKuduService.createPath(phsyicalPath);
            }
        });
    }
    updateDeploymentStatus(taskResult, DeploymentID, customMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let requestBody = this._getUpdateHistoryRequest(taskResult, DeploymentID, customMessage);
                return yield this._appServiceKuduService.updateDeployment(requestBody);
            }
            catch (error) {
                tl.warning(error);
            }
        });
    }
    getDeploymentID() {
        if (this._deploymentID) {
            return this._deploymentID;
        }
        var buildUrl = tl.getVariable('build.buildUri');
        var releaseUrl = tl.getVariable('release.releaseUri');
        var buildId = tl.getVariable('build.buildId');
        var releaseId = tl.getVariable('release.releaseId');
        var buildNumber = tl.getVariable('build.buildNumber');
        var releaseName = tl.getVariable('release.releaseName');
        var collectionUrl = tl.getVariable('system.TeamFoundationCollectionUri');
        var teamProject = tl.getVariable('system.teamProjectId');
        var commitId = tl.getVariable('build.sourceVersion');
        var repoName = tl.getVariable('build.repository.name');
        var repoProvider = tl.getVariable('build.repository.provider');
        var buildOrReleaseUrl = "";
        var deploymentID = (releaseId ? releaseId : buildId) + Date.now().toString();
        return deploymentID;
    }
    deployWebPackage(packagePath, physicalPath, virtualPath, appOffline) {
        return __awaiter(this, void 0, void 0, function* () {
            physicalPath = physicalPath ? physicalPath : physicalRootPath;
            try {
                if (appOffline) {
                    yield this._appOfflineKuduService(physicalPath, true);
                    tl.debug('Wait for 5 seconds for app_offline to take effect');
                    yield webClient.sleepFor(5);
                }
                if (tl.stats(packagePath).isDirectory()) {
                    let tempPackagePath = deployUtility.generateTemporaryFolderOrZipPath(tl.getVariable('AGENT.TEMPDIRECTORY'), false);
                    packagePath = yield zipUtility.archiveFolder(packagePath, "", tempPackagePath);
                    tl.debug("Compressed folder " + packagePath + " into zip : " + packagePath);
                }
                else if (packagePath.toLowerCase().endsWith('.war')) {
                    physicalPath = yield this._warFileDeployment(packagePath, physicalPath, virtualPath);
                }
                yield this._appServiceKuduService.extractZIP(packagePath, physicalPath);
                if (appOffline) {
                    yield this._appOfflineKuduService(physicalPath, false);
                }
                console.log(tl.loc("Successfullydeployedpackageusingkuduserviceat", packagePath, physicalPath));
            }
            catch (error) {
                tl.error(tl.loc('PackageDeploymentFailed'));
                throw Error(error);
            }
        });
    }
    deployUsingZipDeploy(packagePath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(tl.loc('PackageDeploymentInitiated'));
                let queryParameters = [
                    'isAsync=true',
                    'deployer=' + VSTS_ZIP_DEPLOY
                ];
                let deploymentDetails = yield this._appServiceKuduService.zipDeploy(packagePath, queryParameters);
                yield this._processDeploymentResponse(deploymentDetails);
                console.log(tl.loc('PackageDeploymentSuccess'));
                return deploymentDetails.id;
            }
            catch (error) {
                let stackTraceUrl = this._appServiceKuduService.getKuduStackTraceUrl();
                tl.error(tl.loc('PackageDeploymentFailed'));
                tl.error(tl.loc('KuduStackTraceURL', stackTraceUrl));
                throw Error(error);
            }
        });
    }
    deployUsingRunFromZip(packagePath, customMessage) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(tl.loc('PackageDeploymentInitiated'));
                //zipdeploy async api ref: https://github.com/projectkudu/kudu/wiki/Deploying-from-a-zip-file-or-url#asynchronous-zip-deployment
                let queryParameters = [
                    'isAsync=true',
                    'deployer=' + VSTS_DEPLOY
                ];
                var deploymentMessage = this._getUpdateHistoryRequest(null, null, customMessage).message;
                queryParameters.push('message=' + encodeURIComponent(deploymentMessage));
                yield this._appServiceKuduService.zipDeploy(packagePath, queryParameters);
                console.log(tl.loc('PackageDeploymentSuccess'));
                console.log("NOTE: Run From Package makes wwwroot read-only, so you will receive an error when writing files to this directory.");
            }
            catch (error) {
                let stackTraceUrl = this._appServiceKuduService.getKuduStackTraceUrl();
                tl.error(tl.loc('PackageDeploymentFailed'));
                tl.error(tl.loc('KuduStackTraceURL', stackTraceUrl));
                throw Error(error);
            }
        });
    }
    deployUsingWarDeploy(packagePath, customMessage, targetFolderName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log(tl.loc('WarPackageDeploymentInitiated'));
                let queryParameters = [
                    'isAsync=true'
                ];
                if (targetFolderName) {
                    queryParameters.push('name=' + encodeURIComponent(targetFolderName));
                }
                var deploymentMessage = this._getUpdateHistoryRequest(null, null, customMessage).message;
                queryParameters.push('message=' + encodeURIComponent(deploymentMessage));
                let deploymentDetails = yield this._appServiceKuduService.warDeploy(packagePath, queryParameters);
                yield this._processDeploymentResponse(deploymentDetails);
                console.log(tl.loc('PackageDeploymentSuccess'));
                return deploymentDetails.id;
            }
            catch (error) {
                tl.error(tl.loc('PackageDeploymentFailed'));
                throw Error(error);
            }
        });
    }
    postZipDeployOperation(oldDeploymentID, activeDeploymentID) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                tl.debug(`ZIP DEPLOY - Performing post zip-deploy operation: ${oldDeploymentID} => ${activeDeploymentID}`);
                let manifestFileContent = yield this._appServiceKuduService.getFileContent(`${deploymentFolder}/${oldDeploymentID}`, manifestFileName);
                if (!!manifestFileContent) {
                    let tempManifestFile = path.join(tl.getVariable('AGENT.TEMPDIRECTORY'), manifestFileName);
                    tl.writeFile(tempManifestFile, manifestFileContent);
                    yield this._appServiceKuduService.uploadFile(`${deploymentFolder}/${activeDeploymentID}`, manifestFileName, tempManifestFile);
                }
                tl.debug('ZIP DEPLOY - Performed post-zipdeploy operation.');
            }
            catch (error) {
                tl.debug(`Failed to execute post zip-deploy operation: ${JSON.stringify(error)}.`);
            }
        });
    }
    warmpUp() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                tl.debug('warming up Kudu Service');
                yield this._appServiceKuduService.getAppSettings();
                tl.debug('warmed up Kudu Service');
            }
            catch (error) {
                tl.debug('Failed to warm-up Kudu: ' + error.toString());
            }
        });
    }
    /**
     * Warms up Kudu service by calling warmup API.
     */
    warmUp() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                tl.debug('warming up Kudu Service');
                yield this._appServiceKuduService.warmup();
                tl.debug('warmed up Kudu Service');
            }
            catch (error) {
                tl.debug('Failed to warm-up Kudu: ' + error.toString());
            }
        });
    }
    _processDeploymentResponse(deploymentDetails) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                var kuduDeploymentDetails = yield this._appServiceKuduService.getDeploymentDetails(deploymentDetails.id);
                let sysDebug = tl.getVariable('system.debug');
                if (deploymentDetails.status == constants_1.KUDU_DEPLOYMENT_CONSTANTS.FAILED || sysDebug && sysDebug.toLowerCase() == 'true') {
                    tl.debug(`logs from kudu deploy: ${kuduDeploymentDetails.log_url}`);
                    yield this._printZipDeployLogs(kuduDeploymentDetails.log_url);
                }
                else {
                    console.log(tl.loc('DeployLogsURL', kuduDeploymentDetails.log_url));
                }
            }
            catch (error) {
                tl.debug(`Unable to fetch logs for kudu Deploy: ${JSON.stringify(error)}`);
            }
            if (deploymentDetails.status == constants_1.KUDU_DEPLOYMENT_CONSTANTS.FAILED) {
                throw tl.loc('PackageDeploymentUsingZipDeployFailed');
            }
        });
    }
    _printZipDeployLogs(log_url) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!log_url) {
                return;
            }
            var deploymentLogs = yield this._appServiceKuduService.getDeploymentLogs(log_url);
            for (var deploymentLog of deploymentLogs) {
                console.log((0, azure_arm_app_service_kudu_1.sanitizeKuduLogForConsole)(`${deploymentLog.message}`, 'AzureWebApp'));
                if (deploymentLog.details_url) {
                    yield this._printZipDeployLogs(deploymentLog.details_url);
                }
            }
        });
    }
    _printPostDeploymentLogs(physicalPath) {
        return __awaiter(this, void 0, void 0, function* () {
            var stdoutLog = yield this._appServiceKuduService.getFileContent(physicalPath, 'stdout.txt');
            var stderrLog = yield this._appServiceKuduService.getFileContent(physicalPath, 'stderr.txt');
            var scriptReturnCode = yield this._appServiceKuduService.getFileContent(physicalPath, 'script_result.txt');
            if (scriptReturnCode == null) {
                throw new Error('File not found in Kudu Service. ' + 'script_result.txt');
            }
            if (stdoutLog) {
                console.log(tl.loc('stdoutFromScript'));
                console.log((0, azure_arm_app_service_kudu_1.sanitizeKuduLogForConsole)(stdoutLog, 'AzureWebApp'));
            }
            if (stderrLog) {
                console.log(tl.loc('stderrFromScript'));
                var sanitizedStderrLog = (0, azure_arm_app_service_kudu_1.sanitizeKuduLogForConsole)(stderrLog, 'AzureWebApp');
                if (scriptReturnCode != '0') {
                    tl.error(sanitizedStderrLog);
                    throw Error(tl.loc('ScriptExecutionOnKuduFailed', scriptReturnCode, sanitizedStderrLog));
                }
                else {
                    console.log(sanitizedStderrLog);
                }
            }
        });
    }
    runCommand(physicalPath, command, timeOutInMinutes, pollFolderPath, pollFile) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this._appServiceKuduService.runCommand(physicalPath, command);
            }
            catch (error) {
                if (!!pollFolderPath && !!pollFile && timeOutInMinutes > 0 && error.toString().indexOf('Request timeout: /api/command') != -1) {
                    tl.debug('Request timeout occurs. Trying to poll for file: ' + pollFile);
                    yield this._pollForFile(pollFolderPath, pollFile, timeOutInMinutes);
                }
                else {
                    if (typeof error.valueOf() == 'string') {
                        throw error;
                    }
                    throw `${error.statusCode} - ${error.statusMessage}`;
                }
            }
        });
    }
    _getPostDeploymentScript(scriptType, inlineScript, scriptPath, isLinux) {
        if (scriptType === 'Inline Script') {
            tl.debug('creating kuduPostDeploymentScript_local file');
            var scriptFilePath = path.join(tl.getVariable('AGENT.TEMPDIRECTORY'), isLinux ? 'kuduPostDeploymentScript_local.sh' : 'kuduPostDeploymentScript_local.cmd');
            tl.writeFile(scriptFilePath, inlineScript);
            tl.debug('Created temporary script file : ' + scriptFilePath);
            return {
                "filePath": scriptFilePath,
                "isCreated": true
            };
        }
        if (!tl.exist(scriptPath)) {
            throw Error(tl.loc('ScriptFileNotFound', scriptPath));
        }
        var scriptExtension = path.extname(scriptPath);
        if (isLinux) {
            if (scriptExtension != '.sh') {
                throw Error(tl.loc('InvalidScriptFile', scriptPath));
            }
        }
        else {
            if (scriptExtension != '.bat' && scriptExtension != '.cmd') {
                throw Error(tl.loc('InvalidScriptFile', scriptPath));
            }
        }
        tl.debug('postDeployment script path to execute : ' + scriptPath);
        return {
            filePath: scriptPath,
            isCreated: false
        };
    }
    _warFileDeployment(packagePath, physicalPath, virtualPath) {
        return __awaiter(this, void 0, void 0, function* () {
            tl.debug('WAR: webAppPackage = ' + packagePath);
            let warFile = path.basename(packagePath.slice(0, packagePath.length - '.war'.length));
            let warExt = packagePath.slice(packagePath.length - '.war'.length);
            tl.debug('WAR: warFile = ' + warFile);
            warFile = warFile + ((virtualPath) ? "/" + virtualPath : "");
            tl.debug('WAR: warFile = ' + warFile);
            physicalPath = physicalPath + "/webapps/" + warFile;
            yield this.createPathIfRequired(physicalPath);
            return physicalPath;
        });
    }
    _appOfflineKuduService(physicalPath, enableFeature) {
        return __awaiter(this, void 0, void 0, function* () {
            if (enableFeature) {
                tl.debug('Trying to enable app offline mode.');
                var appOfflineFilePath = path.join(tl.getVariable('AGENT.TEMPDIRECTORY'), 'app_offline_temp.htm');
                tl.writeFile(appOfflineFilePath, '<h1>App Service is offline.</h1>');
                yield this._appServiceKuduService.uploadFile(physicalPath, 'app_offline.htm', appOfflineFilePath);
                tl.debug('App Offline mode enabled.');
            }
            else {
                tl.debug('Trying to disable app offline mode.');
                yield this._appServiceKuduService.deleteFile(physicalPath, 'app_offline.htm');
                tl.debug('App Offline mode disabled.');
            }
        });
    }
    _pollForFile(physicalPath, fileName, timeOutInMinutes) {
        return __awaiter(this, void 0, void 0, function* () {
            var attempts = 0;
            const retryInterval = 10;
            if (tl.getVariable('appservicedeploy.retrytimeout')) {
                timeOutInMinutes = Number(tl.getVariable('appservicedeploy.retrytimeout'));
                tl.debug('Retry timeout in minutes provided by user: ' + timeOutInMinutes);
            }
            var timeOutInSeconds = timeOutInMinutes * 60;
            var noOfRetry = timeOutInSeconds / retryInterval;
            tl.debug(`Polling started for file:  ${fileName} with retry count: ${noOfRetry}`);
            while (attempts < noOfRetry) {
                attempts += 1;
                var fileContent = yield this._appServiceKuduService.getFileContent(physicalPath, fileName);
                if (fileContent == null) {
                    tl.debug('File: ' + fileName + ' not found. retry after 5 seconds. Attempt: ' + attempts);
                    yield webClient.sleepFor(5);
                }
                else {
                    tl.debug('Found file:  ' + fileName);
                    return;
                }
            }
            if (attempts == noOfRetry) {
                throw new Error(tl.loc('PollingForFileTimeOut'));
            }
        });
    }
    _getUpdateHistoryRequest(isDeploymentSuccess, deploymentID, customMessage) {
        var artifactAlias = tl.getVariable(constants_1.AzureDeployPackageArtifactAlias);
        var status = isDeploymentSuccess ? constants_1.KUDU_DEPLOYMENT_CONSTANTS.SUCCESS : constants_1.KUDU_DEPLOYMENT_CONSTANTS.FAILED;
        var releaseId = tl.getVariable('release.releaseId');
        var releaseName = tl.getVariable('release.releaseName');
        var collectionUrl = tl.getVariable('system.TeamFoundationCollectionUri');
        var teamProject = tl.getVariable('system.teamProjectId');
        let buildId = '', buildNumber = '', buildProject = '', commitId = '', repoProvider = '', repoName = '', branch = '', repositoryUrl = '', author = '';
        if (releaseId && artifactAlias) {
            // Task is running in release determine build information of selected artifact using artifactAlias
            author = tl.getVariable('release.requestedfor') || tl.getVariable('agent.name');
            tl.debug(`Artifact Source Alias is: ${artifactAlias}`);
            commitId = tl.getVariable(`release.artifacts.${artifactAlias}.sourceVersion`);
            repoProvider = tl.getVariable(`release.artifacts.${artifactAlias}.repository.provider`);
            repoName = tl.getVariable(`release.artifacts.${artifactAlias}.repository.name`);
            branch = tl.getVariable(`release.artifacts.${artifactAlias}.sourcebranchname`) || tl.getVariable(`release.artifacts.${artifactAlias}.sourcebranch`);
            let artifactType = tl.getVariable(`release.artifacts.${artifactAlias}.type`);
            if (artifactType && artifactType.toLowerCase() == "tfvc") {
                repositoryUrl = `${collectionUrl}${buildProject}/_versionControl`;
                repoProvider = "tfsversioncontrol";
            }
            else if (artifactType && artifactType.toLowerCase() == "build") {
                buildId = tl.getVariable(`release.artifacts.${artifactAlias}.buildId`);
                buildNumber = tl.getVariable(`release.artifacts.${artifactAlias}.buildNumber`);
                buildProject = tl.getVariable(`release.artifacts.${artifactAlias}.projectId`);
            }
            else {
                repositoryUrl = tl.getVariable(`release.artifacts.${artifactAlias}.repository.uri`);
            }
        }
        else {
            // Task is running in build OR artifact alias not found so use primary artifact variables
            author = tl.getVariable('build.requestedfor') || tl.getVariable('agent.name');
            buildId = tl.getVariable('build.buildId');
            buildNumber = tl.getVariable('build.buildNumber');
            buildProject = teamProject;
            commitId = tl.getVariable('build.sourceVersion');
            repoName = tl.getVariable('build.repository.name');
            repoProvider = tl.getVariable('build.repository.provider');
            repositoryUrl = tl.getVariable("build.repository.uri") || "";
            branch = tl.getVariable("build.sourcebranchname") || tl.getVariable("build.sourcebranch");
        }
        deploymentID = !!deploymentID ? deploymentID : this.getDeploymentID();
        var message = {
            type: "deployment",
            commitId: commitId,
            buildId: buildId,
            releaseId: releaseId,
            buildNumber: buildNumber,
            releaseName: releaseName,
            repoProvider: repoProvider,
            repoName: repoName,
            collectionUrl: collectionUrl,
            teamProject: teamProject,
            buildProjectUrl: buildProject ? collectionUrl + buildProject : "",
            repositoryUrl: repositoryUrl,
            branch: branch,
            teamProjectName: tl.getVariable("system.teamproject")
        };
        if (!!customMessage) {
            // Append Custom Messages to original message
            for (var attribute in customMessage) {
                message[attribute] = customMessage[attribute];
            }
        }
        var deploymentLogType = message['type'];
        var active = false;
        if (deploymentLogType.toLowerCase() === "deployment" && isDeploymentSuccess) {
            active = true;
        }
        return {
            id: deploymentID,
            active: active,
            status: status,
            message: JSON.stringify(message),
            author: author,
            deployer: 'VSTS'
        };
    }
}
exports.KuduServiceUtility = KuduServiceUtility;

// SIG // Begin signature block
// SIG // MIInbAYJKoZIhvcNAQcCoIInXTCCJ1kCAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // L0DjCYt5JbwlTRNOYByzEzhxQpCNV43UZpEAUA8Bk32g
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
// SIG // 9hxwL30BElj9MYIZ+zCCGfcCAQEwbjBXMQswCQYDVQQG
// SIG // EwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWdu
// SIG // aW5nIFBDQSAyMDI0AhMzAAACHPrNxZvoL37EAAAAAAIc
// SIG // MA0GCWCGSAFlAwQCAQUAoIGuMBkGCSqGSIb3DQEJAzEM
// SIG // BgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAMBgor
// SIG // BgEEAYI3AgEVMC8GCSqGSIb3DQEJBDEiBCBDbjCHC3Kq
// SIG // O6Xka9FGTvg/mUCAUeeu66AQ3JhpS6kdsDBCBgorBgEE
// SIG // AYI3AgEMMTQwMqAUgBIATQBpAGMAcgBvAHMAbwBmAHSh
// SIG // GoAYaHR0cDovL3d3dy5taWNyb3NvZnQuY29tMA0GCSqG
// SIG // SIb3DQEBAQUABIIBAF66hBWg441aO/T+1olAOdl4/xw6
// SIG // WcnWj7jT9Ucq6xNl24DUKsgkioemeFNk4nJ+vZcSQ1tX
// SIG // 21J3t/xYbyaZHdelCBbN9TBg0huioiFJH7XbGTN6w4wH
// SIG // KDMCTj4cMwsB79JbxInLABMYA96a1mTWHxwk/ZXjtreS
// SIG // 9kDZ+2+q/ZjyMAvVb1jYuoWOi9/Uqs/tX19+Pv+EE9SZ
// SIG // zTrFC+dykoz8pD39fXOsDqikaMQ3YJcXr9ZG/pURgOzx
// SIG // hbB2B7NxyVxwrTbmdLT2++Euv3FBUOHbBn3k9vLL1Ly+
// SIG // arZUIadyCPmrH2hbDF6k2fmT4cVfmZNUu8y8Sa/Yt9P2
// SIG // 5z0RNnGhghetMIIXqQYKKwYBBAGCNwMDATGCF5kwgheV
// SIG // BgkqhkiG9w0BBwKggheGMIIXggIBAzEPMA0GCWCGSAFl
// SIG // AwQCAQUAMIIBWgYLKoZIhvcNAQkQAQSgggFJBIIBRTCC
// SIG // AUECAQEGCisGAQQBhFkKAwEwMTANBglghkgBZQMEAgEF
// SIG // AAQguTi38d45fEHd+XppqT0nDoODbpQo7DA+DgyCSzdE
// SIG // YUwCBmquN2+1exgTMjAyNjA5MjIxMjQ1MzAuOTQzWjAE
// SIG // gAIB9KCB2aSB1jCB0zELMAkGA1UEBhMCVVMxEzARBgNV
// SIG // BAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQx
// SIG // HjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEt
// SIG // MCsGA1UECxMkTWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0
// SIG // aW9ucyBMaW1pdGVkMScwJQYDVQQLEx5uU2hpZWxkIFRT
// SIG // UyBFU046NDAxQS0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1p
// SIG // Y3Jvc29mdCBUaW1lLVN0YW1wIFNlcnZpY2WgghH7MIIH
// SIG // KDCCBRCgAwIBAgITMwAAAhlesthUdfSxjQABAAACGTAN
// SIG // BgkqhkiG9w0BAQsFADB8MQswCQYDVQQGEwJVUzETMBEG
// SIG // A1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9u
// SIG // ZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MSYwJAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQ
// SIG // Q0EgMjAxMDAeFw0yNTA4MTQxODQ4MjZaFw0yNjExMTMx
// SIG // ODQ4MjZaMIHTMQswCQYDVQQGEwJVUzETMBEGA1UECBMK
// SIG // V2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwG
// SIG // A1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMS0wKwYD
// SIG // VQQLEyRNaWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRpb25z
// SIG // IExpbWl0ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNTIEVT
// SIG // Tjo0MDFBLTA1RTAtRDk0NzElMCMGA1UEAxMcTWljcm9z
// SIG // b2Z0IFRpbWUtU3RhbXAgU2VydmljZTCCAiIwDQYJKoZI
// SIG // hvcNAQEBBQADggIPADCCAgoCggIBAKahSMlJMyMsaS90
// SIG // NN1pi7suBvWCFEnM54Sq/nBzk/v7uz2q8SPeoMcW9Vq1
// SIG // rgMQfKoxi37GyJsfFd6LitZ1HH/kf57J12rOf4k4Ff05
// SIG // d0E0Rk9A3rlwTW6R6nPsAtTYk8gO+oC54q70gRKAc5a6
// SIG // TUBRJ7sHWzywi6U0tylkgruSdNm/kRVkf5HBc1cZ4aBN
// SIG // 4CGnlEbaxihgWRiiwV76oIJAxDbSpL7b0U99sS7wLy/0
// SIG // aUXruc9fGaIwrO9mUqGu+A8vGG2lrA5tzmTqSUWcWbDy
// SIG // gh2esTaoBSn9MTR49Lfb9EN1vts+YAFWmrCSQr0edkpd
// SIG // FydgDn95dC0nrV4FAOYA+SENUbxLJU5jZ0qLk6xiA9w9
// SIG // Z42O5gbtKboiHTytoyv9Vnnn9vmEeHEKVkJHgWZl4nYf
// SIG // QLlnZcMSkC9eSyeitncPMv7fzwYZi8rekAH9AnqVkXYG
// SIG // ZzMrVQFLlh8JWUVfSS2O2l/A+eXi/fnDi6V92xjTpjdu
// SIG // FKSFvKrWWql2nrBbyDlttyTS4WmkFbzm69XruxhP+TJ+
// SIG // N3vvw27XWJf2yz9iENcWBCXUm3FJAxX1typWRIfpwSg7
// SIG // WkZzUZG4CIMSGynU9/DikMGf2gOLkrIgIOpxD4lgRxrs
// SIG // rSKOcFO+TOVXY4RKqkx312LvASYuhk871k/vXpHzF3s6
// SIG // gpJLMWhvAgMBAAGjggFJMIIBRTAdBgNVHQ4EFgQUgGjq
// SIG // OR1mrTc6mZ9SBdX3A+p69yEwHwYDVR0jBBgwFoAUn6cV
// SIG // XQBeYl2D9OXSZacbUzUZ6XIwXwYDVR0fBFgwVjBUoFKg
// SIG // UIZOaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9w
// SIG // cy9jcmwvTWljcm9zb2Z0JTIwVGltZS1TdGFtcCUyMFBD
// SIG // QSUyMDIwMTAoMSkuY3JsMGwGCCsGAQUFBwEBBGAwXjBc
// SIG // BggrBgEFBQcwAoZQaHR0cDovL3d3dy5taWNyb3NvZnQu
// SIG // Y29tL3BraW9wcy9jZXJ0cy9NaWNyb3NvZnQlMjBUaW1l
// SIG // LVN0YW1wJTIwUENBJTIwMjAxMCgxKS5jcnQwDAYDVR0T
// SIG // AQH/BAIwADAWBgNVHSUBAf8EDDAKBggrBgEFBQcDCDAO
// SIG // BgNVHQ8BAf8EBAMCB4AwDQYJKoZIhvcNAQELBQADggIB
// SIG // AF8c1WSy1wRX6Aggk4mOzB13W+3IryUk36x2CQuTpNjT
// SIG // e+Tac0zE/Vdk3CEI30NwBVG4dTQQGLTFLsMQug+HHhFx
// SIG // uZVwJ275AvWI3i1Q0ciJl2GJn7e8/kKZfbdwv/GtLYqp
// SIG // zs/FHvPw2C7TE4L1jJ7KizYyCw2iJjn5xyN+kywoxhXv
// SIG // EWC1xnQlHTi5XwHTBnj8UkwN0wADnPhkG5j1o64Li1m8
// SIG // b55dzVY0b6wWVZMRTKFWR9H+6hsAzkoY6Z7+Z2J0OPLn
// SIG // y9Lgc+dkWzxnV+Bb/flBjqwaa5nB85iLrRbSXnNmOJLo
// SIG // zbUytsARoFrHBDlYRYmlXY3vFSyezFTShOU5rLhjN40y
// SIG // 69Z7keQBRrN1CpD+4N3EA+HByu13S4k5u3utOkCflqnk
// SIG // LAA2BPXb1PcCFGyPQ5eFHCBKxcPhR2lkk65HyeEry5oS
// SIG // p5eZIYaSdbBd8+ntQcXqVJYlx6s0S4h1ooViFhEhfCBx
// SIG // JRdzzsWz+FSahwYmL2lzFdEskYMKA+s13XW1J1/VkeiS
// SIG // 9gZagI4x8SDcHpbKf1YcQFk4c7jAOfC8bxP1QM43xReF
// SIG // pu2tWQC5iVcN6C/7P7saNTqeLXE/oX2fbjdYbQtSTeA7
// SIG // kahXy7bY7qAJlEKGzuc1BUc7wp/ApP4Yjvm80debKpI5
// SIG // cSzMjI6ZHP3n+ElFIpA+OvL1MIIHcTCCBVmgAwIBAgIT
// SIG // MwAAABXF52ueAptJmQAAAAAAFTANBgkqhkiG9w0BAQsF
// SIG // ADCBiDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hp
// SIG // bmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoT
// SIG // FU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEyMDAGA1UEAxMp
// SIG // TWljcm9zb2Z0IFJvb3QgQ2VydGlmaWNhdGUgQXV0aG9y
// SIG // aXR5IDIwMTAwHhcNMjEwOTMwMTgyMjI1WhcNMzAwOTMw
// SIG // MTgzMjI1WjB8MQswCQYDVQQGEwJVUzETMBEGA1UECBMK
// SIG // V2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwG
// SIG // A1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSYwJAYD
// SIG // VQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0EgMjAx
// SIG // MDCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIB
// SIG // AOThpkzntHIhC3miy9ckeb0O1YLT/e6cBwfSqWxOdcjK
// SIG // NVf2AX9sSuDivbk+F2Az/1xPx2b3lVNxWuJ+Slr+uDZn
// SIG // hUYjDLWNE893MsAQGOhgfWpSg0S3po5GawcU88V29YZQ
// SIG // 3MFEyHFcUTE3oAo4bo3t1w/YJlN8OWECesSq/XJprx2r
// SIG // rPY2vjUmZNqYO7oaezOtgFt+jBAcnVL+tuhiJdxqD89d
// SIG // 9P6OU8/W7IVWTe/dvI2k45GPsjksUZzpcGkNyjYtcI4x
// SIG // yDUoveO0hyTD4MmPfrVUj9z6BVWYbWg7mka97aSueik3
// SIG // rMvrg0XnRm7KMtXAhjBcTyziYrLNueKNiOSWrAFKu75x
// SIG // qRdbZ2De+JKRHh09/SDPc31BmkZ1zcRfNN0Sidb9pSB9
// SIG // fvzZnkXftnIv231fgLrbqn427DZM9ituqBJR6L8FA6PR
// SIG // c6ZNN3SUHDSCD/AQ8rdHGO2n6Jl8P0zbr17C89XYcz1D
// SIG // TsEzOUyOArxCaC4Q6oRRRuLRvWoYWmEBc8pnol7XKHYC
// SIG // 4jMYctenIPDC+hIK12NvDMk2ZItboKaDIV1fMHSRlJTY
// SIG // uVD5C4lh8zYGNRiER9vcG9H9stQcxWv2XFJRXRLbJbqv
// SIG // UAV6bMURHXLvjflSxIUXk8A8FdsaN8cIFRg/eKtFtvUe
// SIG // h17aj54WcmnGrnu3tz5q4i6tAgMBAAGjggHdMIIB2TAS
// SIG // BgkrBgEEAYI3FQEEBQIDAQABMCMGCSsGAQQBgjcVAgQW
// SIG // BBQqp1L+ZMSavoKRPEY1Kc8Q/y8E7jAdBgNVHQ4EFgQU
// SIG // n6cVXQBeYl2D9OXSZacbUzUZ6XIwXAYDVR0gBFUwUzBR
// SIG // BgwrBgEEAYI3TIN9AQEwQTA/BggrBgEFBQcCARYzaHR0
// SIG // cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9wcy9Eb2Nz
// SIG // L1JlcG9zaXRvcnkuaHRtMBMGA1UdJQQMMAoGCCsGAQUF
// SIG // BwMIMBkGCSsGAQQBgjcUAgQMHgoAUwB1AGIAQwBBMAsG
// SIG // A1UdDwQEAwIBhjAPBgNVHRMBAf8EBTADAQH/MB8GA1Ud
// SIG // IwQYMBaAFNX2VsuP6KJcYmjRPZSQW9fOmhjEMFYGA1Ud
// SIG // HwRPME0wS6BJoEeGRWh0dHA6Ly9jcmwubWljcm9zb2Z0
// SIG // LmNvbS9wa2kvY3JsL3Byb2R1Y3RzL01pY1Jvb0NlckF1
// SIG // dF8yMDEwLTA2LTIzLmNybDBaBggrBgEFBQcBAQROMEww
// SIG // SgYIKwYBBQUHMAKGPmh0dHA6Ly93d3cubWljcm9zb2Z0
// SIG // LmNvbS9wa2kvY2VydHMvTWljUm9vQ2VyQXV0XzIwMTAt
// SIG // MDYtMjMuY3J0MA0GCSqGSIb3DQEBCwUAA4ICAQCdVX38
// SIG // Kq3hLB9nATEkW+Geckv8qW/qXBS2Pk5HZHixBpOXPTEz
// SIG // tTnXwnE2P9pkbHzQdTltuw8x5MKP+2zRoZQYIu7pZmc6
// SIG // U03dmLq2HnjYNi6cqYJWAAOwBb6J6Gngugnue99qb74p
// SIG // y27YP0h1AdkY3m2CDPVtI1TkeFN1JFe53Z/zjj3G82jf
// SIG // ZfakVqr3lbYoVSfQJL1AoL8ZthISEV09J+BAljis9/kp
// SIG // icO8F7BUhUKz/AyeixmJ5/ALaoHCgRlCGVJ1ijbCHcNh
// SIG // cy4sa3tuPywJeBTpkbKpW99Jo3QMvOyRgNI95ko+ZjtP
// SIG // u4b6MhrZlvSP9pEB9s7GdP32THJvEKt1MMU0sHrYUP4K
// SIG // WN1APMdUbZ1jdEgssU5HLcEUBHG/ZPkkvnNtyo4JvbMB
// SIG // V0lUZNlz138eW0QBjloZkWsNn6Qo3GcZKCS6OEuabvsh
// SIG // VGtqRRFHqfG3rsjoiV5PndLQTHa1V1QJsWkBRH58oWFs
// SIG // c/4Ku+xBZj1p/cvBQUl+fpO+y/g75LcVv7TOPqUxUYS8
// SIG // vwLBgqJ7Fx0ViY1w/ue10CgaiQuPNtq6TPmb/wrpNPgk
// SIG // NWcr4A245oyZ1uEi6vAnQj0llOZ0dFtq0Z4+7X6gMTN9
// SIG // vMvpe784cETRkPHIqzqKOghif9lwY1NNje6CbaUFEMFx
// SIG // BmoQtB1VM1izoXBm8qGCA1YwggI+AgEBMIIBAaGB2aSB
// SIG // 1jCB0zELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hp
// SIG // bmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoT
// SIG // FU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEtMCsGA1UECxMk
// SIG // TWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0aW9ucyBMaW1p
// SIG // dGVkMScwJQYDVQQLEx5uU2hpZWxkIFRTUyBFU046NDAx
// SIG // QS0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1pY3Jvc29mdCBU
// SIG // aW1lLVN0YW1wIFNlcnZpY2WiIwoBATAHBgUrDgMCGgMV
// SIG // ADF2Kf1qqncm9Hp4oKy38ZdCJwM+oIGDMIGApH4wfDEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9z
// SIG // b2Z0IFRpbWUtU3RhbXAgUENBIDIwMTAwDQYJKoZIhvcN
// SIG // AQELBQACBQDuXKo1MCIYDzIwMjYwOTIyMDcxODEzWhgP
// SIG // MjAyNjA5MjMwNzE4MTNaMHQwOgYKKwYBBAGEWQoEATEs
// SIG // MCowCgIFAO5cqjUCAQAwBwIBAAICFkQwBwIBAAICEogw
// SIG // CgIFAO5d+7UCAQAwNgYKKwYBBAGEWQoEAjEoMCYwDAYK
// SIG // KwYBBAGEWQoDAqAKMAgCAQACAwehIKEKMAgCAQACAwGG
// SIG // oDANBgkqhkiG9w0BAQsFAAOCAQEApUK6N4potHXk7m77
// SIG // VFlPICdRc0AEl/3HywoPD798jbPRS9jUpmY4lZdqkqTy
// SIG // mAuopDvTQiJ9qnE4cIXRGMHlLiMGtsxFfxSJ3nyi/kJN
// SIG // BZcD9JfiuHY/XZD/PfiRA4O8H+kVtAA3GRqjqZPHmp8p
// SIG // oIN5rOn5D86jKdum6Bz2OJNTZBt9mujYYl1I96qjy5vw
// SIG // cd8a3P1PIP0ggbz0VygzA7He/3yRURakrVsco8fQzya/
// SIG // /2pvxC0ZGt1vwFWLCGgrx309O8gq0ctpz49sCeyxLSlZ
// SIG // 5doMQYEd7lzP1cGHgWzuYoJkfsVtWr9qFwAoLXx7rQpi
// SIG // u2RfwgmpfvK+kRo4FzGCBA0wggQJAgEBMIGTMHwxCzAJ
// SIG // BgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAw
// SIG // DgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3Nv
// SIG // ZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jvc29m
// SIG // dCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMzAAACGV6y2FR1
// SIG // 9LGNAAEAAAIZMA0GCWCGSAFlAwQCAQUAoIIBSjAaBgkq
// SIG // hkiG9w0BCQMxDQYLKoZIhvcNAQkQAQQwLwYJKoZIhvcN
// SIG // AQkEMSIEIAUEr5zeRtOupKOnaMB/e6AQmCdLmQxISe6D
// SIG // LEU1F7YKMIH6BgsqhkiG9w0BCRACLzGB6jCB5zCB5DCB
// SIG // vQQg3JF+t9xNctRBd9ldfM0HK7II8yPfty3u5pb5Njnm
// SIG // 7YYwgZgwgYCkfjB8MQswCQYDVQQGEwJVUzETMBEGA1UE
// SIG // CBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEe
// SIG // MBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSYw
// SIG // JAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQQ0Eg
// SIG // MjAxMAITMwAAAhlesthUdfSxjQABAAACGTAiBCD/Q8cL
// SIG // uTjoUmtm/JZpfg/fR980fKkPDHFc1rytgBeUPjANBgkq
// SIG // hkiG9w0BAQsFAASCAgALoy8dvZBb4tItgVEq43U03Eep
// SIG // 6okFoCCrWqzSn2Gu/1JRE5t7aX95j3GTQwt1FA1IUtJo
// SIG // BM9NiTOhaxP7ZOTVczxCLWqr4M6Ml3MpMg8QiFItVcUG
// SIG // ayxijqpUxt7pzT1uC3i0x4eUHM0SQSxlBm0sQS9lFCYe
// SIG // k1EYluOLE/JAcZphtnIGMgIA6sqjArM20POEg8eG6NMC
// SIG // XMoPpRuIxOK6vOc5KuFTsjRdVGKFuoq92TWzwIjonLJv
// SIG // iLek8FUs9Yl8+cUuQX+evJDyF0nwEKUWCJeCQ5FqSsSQ
// SIG // YbSjYhjtd2PfEr80dam+qN4lff+DdWTTpHx5HZMbkt5E
// SIG // aUoZbTKJRNKIMKcpQvjlSNZMQlCCAipDA0PQdgqk8P0v
// SIG // rsjLznJU3dh+gUSL/qUZ6D+xotQkhfAe4qS1MEAph5WA
// SIG // qtVH83KUSnGxOBInbTJNrBdrsQmZijE7EweRoqb6fAi/
// SIG // yu1Kx0ovhHFavedAboEVnpSXVq4+tfU5uHaPZHmMmO9d
// SIG // bvVdvAzhye1DjevMz1Woh9HUrndY9pfEM7Q0kvlQIIEZ
// SIG // FLMAYCFe7tZ0r+G0DVNj2uETJ0rbS6eTnkHtvQXJJ00M
// SIG // utrd7184hRdHaIF+UgdE4e6uTzl6ulEX1la0ACmaNZHc
// SIG // wTWd7zEOC1gBit+D2DXEA1pd1Qskl56pPmzKV6Dc/Q==
// SIG // End signature block
