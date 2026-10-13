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
var path = require('path');
var url = require('url');
var fs = require('fs');
const tl = require("azure-pipelines-task-lib/task");
const WebApi_1 = require("azure-devops-node-api/WebApi");
const BuildInterfaces_1 = require("azure-devops-node-api/interfaces/BuildInterfaces");
const engine = require("artifact-engine/Engine");
const webHandlers = require("typed-rest-client/Handlers");
const DownloadHandlerContainer_1 = require("./DownloadHandlers/DownloadHandlerContainer");
const DownloadHandlerContainerZip_1 = require("./DownloadHandlers/DownloadHandlerContainerZip");
const DownloadHandlerFilePath_1 = require("./DownloadHandlers/DownloadHandlerFilePath");
const download_helper_1 = require("./download_helper");
const file_helper_1 = require("./file_helper");
var taskJson = require('./task.json');
tl.setResourcePath(path.join(__dirname, 'task.json'));
const area = 'DownloadBuildArtifacts';
const DefaultParallelProcessingLimit = 8;
var ErrorDisplayMode;
(function (ErrorDisplayMode) {
    ErrorDisplayMode[ErrorDisplayMode["ShowError"] = 0] = "ShowError";
    ErrorDisplayMode[ErrorDisplayMode["ShowWarning"] = 1] = "ShowWarning";
    ErrorDisplayMode[ErrorDisplayMode["DoNotShowError"] = 2] = "DoNotShowError";
})(ErrorDisplayMode || (ErrorDisplayMode = {}));
function getDefaultProps() {
    var hostType = (tl.getVariable('SYSTEM.HOSTTYPE') || "").toLowerCase();
    return {
        hostType: hostType,
        definitionName: '[NonEmail:' + (hostType === 'release' ? tl.getVariable('RELEASE.DEFINITIONNAME') : tl.getVariable('BUILD.DEFINITIONNAME')) + ']',
        processId: hostType === 'release' ? tl.getVariable('RELEASE.RELEASEID') : tl.getVariable('BUILD.BUILDID'),
        processUrl: hostType === 'release' ? tl.getVariable('RELEASE.RELEASEWEBURL') : (tl.getVariable('SYSTEM.TEAMFOUNDATIONSERVERURI') + tl.getVariable('SYSTEM.TEAMPROJECT') + '/_build?buildId=' + tl.getVariable('BUILD.BUILDID')),
        taskDisplayName: tl.getVariable('TASK.DISPLAYNAME'),
        jobid: tl.getVariable('SYSTEM.JOBID'),
        agentVersion: tl.getVariable('AGENT.VERSION'),
        agentOS: tl.getVariable('AGENT.OS'),
        agentName: tl.getVariable('AGENT.NAME'),
        version: taskJson.version
    };
}
function publishEvent(feature, properties) {
    try {
        var splitVersion = (process.env.AGENT_VERSION || '').split('.');
        var major = parseInt(splitVersion[0] || '0');
        var minor = parseInt(splitVersion[1] || '0');
        let telemetry = '';
        if (major > 2 || (major == 2 && minor >= 120)) {
            telemetry = `##vso[telemetry.publish area=${area};feature=${feature}]${JSON.stringify(Object.assign(getDefaultProps(), properties))}`;
        }
        else {
            if (feature === 'reliability') {
                let reliabilityData = properties;
                telemetry = "##vso[task.logissue type=error;code=" + reliabilityData.issueType + ";agentVersion=" + tl.getVariable('Agent.Version') + ";taskId=" + area + "-" + JSON.stringify(taskJson.version) + ";]" + reliabilityData.errorMessage;
            }
        }
        console.log(telemetry);
        ;
    }
    catch (err) {
        tl.warning("Failed to log telemetry, error: " + err);
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var promise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            var buildType = tl.getInput("buildType", true);
            var isCurrentBuild = buildType.toLowerCase() === 'current';
            var isSpecificBuildWithTriggering = tl.getBoolInput("specificBuildWithTriggering", false);
            var projectId = null;
            var definitionId = null;
            var definitionIdSpecified = null;
            var definitionIdTriggered = null;
            var buildId = null;
            var buildVersionToDownload = tl.getInput("buildVersionToDownload", false);
            var allowPartiallySucceededBuilds = tl.getBoolInput("allowPartiallySucceededBuilds", false);
            var branchName = tl.getInput("branchName", false);
            var downloadPath = path.normalize(tl.getInput("downloadPath", true));
            var cleanDestinationFolder = tl.getBoolInput("cleanDestinationFolder", false);
            var downloadType = tl.getInput("downloadType", true);
            var tagFiltersInput = tl.getInput("tags", false);
            var tagFilters = [];
            if (!!tagFiltersInput) {
                tagFilters = tagFiltersInput.split(",");
            }
            const checkDownloadedFiles = tl.getBoolInput('checkDownloadedFiles', false);
            const shouldExtractTars = tl.getBoolInput('extractTars');
            const isWin = process.platform === 'win32';
            if (shouldExtractTars && isWin) {
                reject(tl.loc('TarExtractionNotSupportedInWindows'));
                return;
            }
            var endpointUrl = tl.getVariable("System.TeamFoundationCollectionUri");
            var accessToken = tl.getEndpointAuthorizationParameter('SYSTEMVSSCONNECTION', 'AccessToken', false);
            var credentialHandler = (0, WebApi_1.getHandlerFromToken)(accessToken);
            var webApi = new WebApi_1.WebApi(endpointUrl, credentialHandler);
            const retryLimitRequest = parseInt(tl.getVariable('VSTS_HTTP_RETRY')) ? parseInt(tl.getVariable("VSTS_HTTP_RETRY")) : 4;
            const retryLimitDownload = parseInt(tl.getInput('retryDownloadCount', false)) ? parseInt(tl.getInput('retryDownloadCount', false)) : 4;
            const retryRedirectLimitDownload = parseInt(tl.getInput('retryRedirectDownloadCount', false)) ? parseInt(tl.getInput('retryRedirectDownloadCount', false)) : 1;
            var templatePath = path.join(__dirname, 'vsts.handlebars.txt');
            var buildApi = yield executeWithRetries("getBuildApi", () => webApi.getBuildApi(), retryLimitRequest).catch((reason) => {
                reject(reason);
                return;
            });
            var artifacts = [];
            // Clean destination folder if requested
            if (cleanDestinationFolder) {
                (0, file_helper_1.cleanUpFolder)(downloadPath);
            }
            if (isCurrentBuild) {
                projectId = tl.getVariable("System.TeamProjectId");
                definitionId = '';
                buildId = parseInt(tl.getVariable("Build.BuildId"));
            }
            else {
                var releaseAlias = tl.getVariable("release.triggeringartifact.alias");
                var triggeringBuildFound = false;
                definitionIdSpecified = tl.getInput("definition", true);
                if (isSpecificBuildWithTriggering) {
                    let hostType = tl.getVariable('system.hostType');
                    if ((hostType && hostType.toUpperCase() != 'BUILD')) {
                        // try to use alias to grab triggering artifact for release, starting with definition to verify parity with specified definition
                        definitionIdTriggered = tl.getVariable("release.artifacts." + releaseAlias + ".definitionId");
                        if (definitionIdTriggered == definitionIdSpecified) {
                            // populate values using the triggering build
                            projectId = tl.getVariable("release.artifacts." + releaseAlias + ".projectId");
                            definitionId = definitionIdTriggered;
                            buildId = parseInt(tl.getVariable("release.artifacts." + releaseAlias + ".buildId"));
                            // verify that the triggerring bruild's info was found
                            if (projectId && definitionId && buildId) {
                                triggeringBuildFound = true;
                            }
                        }
                    }
                    else {
                        //Verify that the triggering build's definition is the same as the specified definition
                        definitionIdTriggered = tl.getVariable("build.triggeredBy.definitionId");
                        if (definitionIdTriggered == definitionIdSpecified) {
                            // populate values using the triggering build
                            projectId = tl.getVariable("build.triggeredBy.projectId");
                            definitionId = definitionIdTriggered;
                            buildId = parseInt(tl.getVariable("build.triggeredBy.buildId"));
                            // verify that the triggerring bruild's info was found
                            if (projectId && definitionId && buildId) {
                                triggeringBuildFound = true;
                            }
                        }
                    }
                }
                if (!triggeringBuildFound) {
                    // Triggering build info not found, or requested, default to specified build info
                    projectId = tl.getInput("project", true);
                    definitionId = definitionIdSpecified;
                    buildId = parseInt(tl.getInput("buildId", buildVersionToDownload == "specific"));
                }
                // if the definition name includes a variable then definitionIdSpecified is a name vs a number
                if (!!definitionIdSpecified && Number.isNaN(parseInt(definitionIdSpecified))) {
                    var definitions = yield executeWithRetries("getBuildDefinitions", () => buildApi.getDefinitions(projectId, definitionIdSpecified), retryLimitRequest).catch((reason) => {
                        reject(reason);
                        return;
                    });
                    if (!definitions || definitions.length < 1) {
                        reject(tl.loc("InvalidBuildDefinitionName", definitionIdSpecified));
                        return;
                    }
                    definitionId = String(definitions[0].id);
                    console.log(tl.loc("DefinitionNameMatchFound", definitionIdSpecified, definitionId));
                }
                if (!definitionId) {
                    reject(tl.loc("UnresolvedDefinitionId"));
                    return;
                }
            }
            // verify that buildId belongs to the definition selected
            if (definitionId) {
                var build;
                if (buildVersionToDownload != "specific" && !triggeringBuildFound) {
                    var resultFilter = BuildInterfaces_1.BuildResult.Succeeded;
                    if (allowPartiallySucceededBuilds) {
                        resultFilter |= BuildInterfaces_1.BuildResult.PartiallySucceeded;
                    }
                    var branchNameFilter = (buildVersionToDownload == "latest") ? null : branchName;
                    // get latest successful build filtered by branch
                    var buildsForThisDefinition = yield executeWithRetries("getBuildId", () => buildApi.getBuilds(projectId, [parseInt(definitionId)], null, null, null, null, null, null, BuildInterfaces_1.BuildStatus.Completed, resultFilter, tagFilters, null, null, null, null, null, BuildInterfaces_1.BuildQueryOrder.FinishTimeDescending, branchNameFilter), retryLimitRequest).catch((reason) => {
                        reject(reason);
                        return;
                    });
                    if (!buildsForThisDefinition || buildsForThisDefinition.length == 0) {
                        if (buildVersionToDownload == "latestFromBranch")
                            reject(tl.loc("LatestBuildFromBranchNotFound", branchNameFilter));
                        else
                            reject(tl.loc("LatestBuildNotFound"));
                        return;
                    }
                    build = buildsForThisDefinition[0];
                    console.log(tl.loc("LatestBuildFound", build.id));
                    buildId = build.id;
                }
                if (!build) {
                    build = yield executeWithRetries("getBuild", () => buildApi.getBuild(projectId, buildId), retryLimitRequest).catch((reason) => {
                        reject(reason);
                        return;
                    });
                }
                if (build) {
                    if (!build.definition || build.definition.id !== parseInt(definitionId)) {
                        reject(tl.loc("BuildIdBuildDefinitionMismatch", buildId, definitionId));
                        return;
                    }
                }
                else {
                    reject(tl.loc("BuildNotFound", buildId));
                    return;
                }
            }
            console.log(tl.loc("DownloadingArtifactsForBuild", buildId));
            // populate output variable 'BuildNumber' with buildId
            tl.setVariable('BuildNumber', buildId.toString());
            // populate itempattern and artifacts based on downloadType
            if (downloadType === 'single') {
                var artifactName = tl.getInput("artifactName", true);
                // if FF EnableBuildArtifactsPlusSignWorkaround is enabled or AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND environment variable is set:
                // replacing '+' symbol by its representation ' '(space) - workaround for the DownloadBuildArtifactV0 task,
                // where downloading of part of artifact is not possible if there is a plus symbol
                const enableBuildArtifactsPlusSignWorkaround = process.env.AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND ? process.env.AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND.toLowerCase() === "true" : false;
                if (enableBuildArtifactsPlusSignWorkaround)
                    artifactName = artifactName.replace(/\+/g, ' ');
                var artifact = yield executeWithRetries("getArtifact", () => buildApi.getArtifact(projectId, buildId, artifactName), retryLimitRequest).catch((reason) => {
                    reject(reason);
                    return;
                });
                if (!artifact) {
                    reject(tl.loc("BuildArtifactNotFound", artifactName, buildId));
                    return;
                }
                artifacts.push(artifact);
            }
            else {
                var buildArtifacts = yield executeWithRetries("getArtifacts", () => buildApi.getArtifacts(projectId, buildId), retryLimitRequest).catch((reason) => {
                    reject(reason);
                });
                if (!buildArtifacts) {
                    tl.warning(tl.loc("NoArtifactsFound", buildId));
                    resolve();
                    return;
                }
                console.log(tl.loc("LinkedArtifactCount", buildArtifacts.length));
                artifacts = artifacts.concat(buildArtifacts);
            }
            if (artifacts) {
                var downloadPromises = [];
                artifacts.forEach(function (artifact, index, artifacts) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const downloaderOptions = configureDownloaderOptions();
                        const config = {
                            artifactInfo: artifact,
                            downloadPath: downloadPath,
                            downloaderOptions: downloaderOptions,
                            checkDownloadedFiles: checkDownloadedFiles
                        };
                        if (artifact.resource.type.toLowerCase() === "container") {
                            var handler = new webHandlers.PersonalAccessTokenCredentialHandler(accessToken);
                            // this variable uses to force enable zip download option, it is used only in test purpose and shouldn't be used for other reasons
                            const forceEnableZipDownloadOption = tl.getVariable("DownloadBuildArtifacts.ForceEnableDownloadZipForCanary");
                            const forceEnableZipDownloadOptionBool = forceEnableZipDownloadOption ? forceEnableZipDownloadOption.toLowerCase() == 'true' : false;
                            var isPullRequestFork = tl.getVariable("SYSTEM.PULLREQUEST.ISFORK");
                            var isPullRequestForkBool = isPullRequestFork ? isPullRequestFork.toLowerCase() == 'true' : false;
                            var isZipDownloadDisabled = tl.getVariable("SYSTEM.DisableZipDownload");
                            var isZipDownloadDisabledBool = isZipDownloadDisabled ? isZipDownloadDisabled.toLowerCase() != 'false' : false;
                            var preferRedirectString = tl.getVariable("system.preferRedirectGetContainerItem");
                            var preferRedirect = preferRedirectString ? preferRedirectString.toLowerCase() === 'true' : false;
                            // Disable zip download if selective itemPattern provided
                            if (downloaderOptions.itemPattern !== "**") {
                                isZipDownloadDisabledBool = true;
                            }
                            if (isWin && ((!isZipDownloadDisabledBool && isPullRequestForkBool) || forceEnableZipDownloadOptionBool)) {
                                const operationName = `Download zip - ${artifact.name}`;
                                const handlerConfig = Object.assign(Object.assign({}, config), { projectId, buildId, handler, endpointUrl });
                                const downloadHandler = new DownloadHandlerContainerZip_1.DownloadHandlerContainerZip(handlerConfig);
                                const downloadPromise = executeWithRetries(operationName, () => downloadHandler.downloadResources(), retryLimitDownload).catch((reason) => {
                                    reject(reason);
                                    return;
                                });
                                downloadPromises.push(downloadPromise);
                                yield downloadPromise;
                            }
                            else {
                                const operationName = `Download container - ${artifact.name}`;
                                if (!preferRedirect || retryRedirectLimitDownload < 0) {
                                    // Keep current logic exactly as-is, for complete safety do not refactor yet
                                    const handlerConfig = Object.assign(Object.assign({}, config), { endpointUrl, templatePath, handler, preferRedirect: false });
                                    const downloadHandler = new DownloadHandlerContainer_1.DownloadHandlerContainer(handlerConfig);
                                    const downloadPromise = executeWithRetries(operationName, () => downloadHandler.downloadResources(), retryLimitDownload, ErrorDisplayMode.DoNotShowError).catch((reason) => {
                                        reject(reason);
                                        return;
                                    });
                                    downloadPromises.push(downloadPromise);
                                    yield downloadPromise;
                                }
                                else {
                                    var redirectTemplatePath = path.join(__dirname, 'vsts.redirect.handlebars.txt');
                                    // In this new flow, attempt to download through following the redirect but fall back to downloading from TFS if this fails.
                                    const downloaderOptions = configureDownloaderOptions(retryRedirectLimitDownload);
                                    const handlerConfig = Object.assign(Object.assign({}, config), { downloaderOptions, endpointUrl, templatePath: redirectTemplatePath, handler, preferRedirect: true });
                                    const downloadHandler = new DownloadHandlerContainer_1.DownloadHandlerContainer(handlerConfig);
                                    const downloadPromise = executeWithRetries(operationName, () => downloadHandler.downloadResources(), retryRedirectLimitDownload, ErrorDisplayMode.ShowWarning).catch((reason) => {
                                        console.log(tl.loc("FollowingDownloadRedirectFailed", reason));
                                        publishEvent('download-redirect', { "redirectLimit": retryRedirectLimitDownload, "err": JSON.stringify(reason, Object.getOwnPropertyNames(reason)) });
                                        const handlerConfig = Object.assign(Object.assign({}, config), { endpointUrl, templatePath, handler, preferRedirect: false });
                                        const downloadHandler = new DownloadHandlerContainer_1.DownloadHandlerContainer(handlerConfig);
                                        const fallbackDownloadPromise = executeWithRetries(operationName, () => downloadHandler.downloadResources(), retryLimitDownload).catch((reason) => {
                                            reject(reason);
                                            return;
                                        });
                                        return fallbackDownloadPromise; // fall back to the original one
                                    });
                                    downloadPromises.push(downloadPromise);
                                    yield downloadPromise;
                                }
                            }
                        }
                        else if (artifact.resource.type.toLowerCase() === "filepath") {
                            const operationName = `Download by FilePath - ${artifact.name}`;
                            const downloadHandler = new DownloadHandlerFilePath_1.DownloadHandlerFilePath(config);
                            const downloadPromise = executeWithRetries(operationName, () => downloadHandler.downloadResources(), retryLimitDownload).catch((reason) => {
                                reject(reason);
                                return;
                            });
                            downloadPromises.push(downloadPromise);
                            yield downloadPromise;
                        }
                        else {
                            console.log(tl.loc("UnsupportedArtifactType", artifact.resource.type));
                        }
                    });
                });
                Promise.all(downloadPromises).then((tickets) => {
                    console.log(tl.loc('ArtifactsSuccessfullyDownloaded', downloadPath));
                    if (shouldExtractTars) {
                        (0, file_helper_1.extractTarsIfPresent)(tickets, downloadPath);
                    }
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            }
        }));
        return promise;
    });
}
function executeWithRetries(operationName, operation, retryCount, errorDisplayMode = ErrorDisplayMode.ShowError) {
    var executePromise = new Promise((resolve, reject) => {
        executeWithRetriesImplementation(operationName, operation, retryCount, resolve, reject, retryCount, errorDisplayMode);
    });
    return executePromise;
}
function executeWithRetriesImplementation(operationName, operation, currentRetryCount, resolve, reject, retryCountLimit, errorDisplayMode) {
    operation().then((result) => {
        resolve(result);
    }).catch((error) => {
        if (currentRetryCount <= 0) {
            if (errorDisplayMode == ErrorDisplayMode.ShowError) {
                tl.error(tl.loc("OperationFailed", operationName, error));
            }
            else if (errorDisplayMode == ErrorDisplayMode.ShowWarning) {
                tl.warning(tl.loc("OperationFailed", operationName, error));
            }
            reject(error);
        }
        else {
            console.log(tl.loc('RetryingOperation', operationName, currentRetryCount));
            currentRetryCount = currentRetryCount - 1;
            setTimeout(() => executeWithRetriesImplementation(operationName, operation, currentRetryCount, resolve, reject, retryCountLimit, errorDisplayMode), getRetryIntervalInSeconds(retryCountLimit - currentRetryCount) * 1000);
        }
    });
}
function getRetryIntervalInSeconds(retryCount) {
    let MaxRetryLimitInSeconds = 360;
    let baseRetryIntervalInSeconds = 5;
    var exponentialBackOff = baseRetryIntervalInSeconds * Math.pow(3, (retryCount + 1));
    return exponentialBackOff < MaxRetryLimitInSeconds ? exponentialBackOff : MaxRetryLimitInSeconds;
}
function configureDownloaderOptions(maxRetries) {
    const downloaderOptions = new engine.ArtifactEngineOptions();
    const debugMode = tl.getVariable('System.Debug');
    downloaderOptions.verbose = debugMode ? debugMode.toLowerCase() !== 'false' : false;
    const artifactDownloadLimit = tl.getVariable('release.artifact.download.parallellimit');
    const taskInputParallelLimit = tl.getInput('parallelizationLimit', false);
    downloaderOptions.parallelProcessingLimit = (0, download_helper_1.resolveParallelProcessingLimit)(artifactDownloadLimit, taskInputParallelLimit, DefaultParallelProcessingLimit);
    downloaderOptions.itemPattern = tl.getInput('itemPattern', false) || '**';
    if (maxRetries !== undefined) {
        downloaderOptions.retryLimit = maxRetries;
    }
    return downloaderOptions;
}
main()
    .then((result) => tl.setResult(tl.TaskResult.Succeeded, ""))
    .catch((err) => {
    publishEvent('reliability', { issueType: 'error', errorMessage: JSON.stringify(err, Object.getOwnPropertyNames(err)) });
    tl.setResult(tl.TaskResult.Failed, err);
});

// SIG // Begin signature block
// SIG // MIInRAYJKoZIhvcNAQcCoIInNTCCJzECAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // aDCo4lRbTdv6z6mjULUTHY8nQMhrbRz96NnKDjSoVuSg
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
// SIG // SIb3DQEJBDEiBCCcBuR1lJaMlZpWMwaKqqj5i9XzYZ0Z
// SIG // 7+ppGNB/bL7BSDBCBgorBgEEAYI3AgEMMTQwMqAUgBIA
// SIG // TQBpAGMAcgBvAHMAbwBmAHShGoAYaHR0cDovL3d3dy5t
// SIG // aWNyb3NvZnQuY29tMA0GCSqGSIb3DQEBAQUABIIBACWD
// SIG // K7rohdQcy4pW6qp9nHn52XCxdmJaaXUE9MWpYwf7W9As
// SIG // SrXnYXX2MBmqmfArx5pGnGCER6qBZd+nTrH3ZJcBm51H
// SIG // 1jfQBukjKMXCJgRf46o3ytbeGcuC1Ls566bCdihUM7cR
// SIG // uJHB0PJNegSML+9XlY3xGfPhdVBkkfg/HAdWSVZfJXH0
// SIG // rr90pOQ1e1NhkrXTyWWxoHtCzvrm5Qr9L/6K5Lnl9pP1
// SIG // +uyJzcN3NwLtJM6ciwjgRT/z2exmhszAMAXx2HI/1MrX
// SIG // d5r+gK77/OGGm8TdctY0RlDuIjtsXf9HP8LrgX+TkHlc
// SIG // Dw50XwJU5YKdJS93TXvcQZf+QNC4jUChgheUMIIXkAYK
// SIG // KwYBBAGCNwMDATGCF4Awghd8BgkqhkiG9w0BBwKgghdt
// SIG // MIIXaQIBAzEPMA0GCWCGSAFlAwQCAQUAMIIBUgYLKoZI
// SIG // hvcNAQkQAQSgggFBBIIBPTCCATkCAQEGCisGAQQBhFkK
// SIG // AwEwMTANBglghkgBZQMEAgEFAAQgLohdq9p1BCcr5613
// SIG // LTTPNCkyfpSqFMnqvOwfR7LP7BACBmqpf+/67hgTMjAy
// SIG // NjEwMDEwOTQwMjMuNjU2WjAEgAIB9KCB0aSBzjCByzEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjElMCMGA1UECxMcTWljcm9z
// SIG // b2Z0IEFtZXJpY2EgT3BlcmF0aW9uczEnMCUGA1UECxMe
// SIG // blNoaWVsZCBUU1MgRVNOOkEwMDAtMDVFMC1EOTQ3MSUw
// SIG // IwYDVQQDExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2
// SIG // aWNloIIR6jCCByAwggUIoAMCAQICEzMAAAIruwBQ/007
// SIG // mqEAAQAAAiswDQYJKoZIhvcNAQELBQAwfDELMAkGA1UE
// SIG // BhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNV
// SIG // BAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBD
// SIG // b3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgUENBIDIwMTAwHhcNMjYwMjE5MTk0MDEx
// SIG // WhcNMjcwNTE3MTk0MDExWjCByzELMAkGA1UEBhMCVVMx
// SIG // EzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Jl
// SIG // ZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3Jh
// SIG // dGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJpY2Eg
// SIG // T3BlcmF0aW9uczEnMCUGA1UECxMeblNoaWVsZCBUU1Mg
// SIG // RVNOOkEwMDAtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNy
// SIG // b3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkq
// SIG // hkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAl95oujg97MlK
// SIG // kJuEKoJKyj23LCv0Md32HLS/PlTNbjmN26KIuRscGrk4
// SIG // EH+iRRyE06MUu4I6ipSvDhS8y+lE5dI8RCubeg7jnICV
// SIG // 3b7rYpqE5TktAt5MiE1wQF6I/4KeoUUfc+lkYqdSrZIp
// SIG // W93SVwo0Kk/T9grro6/lc/K/mfow5dPY4v4nP+Bt+K95
// SIG // lcI7P/xp8fT7t9VfK1xYnDYgM8abm2sKW3fKan85Vk9r
// SIG // 5xt5BfZejIkRG7yd1xy1MB0LIdLf060hcf7P8gqqSVmC
// SIG // eqApRu9Lb7BR9GkT/MAeHD/whWtiC75NuotznCQZfqai
// SIG // ox00gcvZr8EzxA5Z83KNDbfEeqUj012YAbLHB4aCnwtF
// SIG // kJjs2NpHl2wJkU3GTMl8+b/wCW5qCNMtOwWs77eTZF3X
// SIG // RvUxK0FsLbBciCqxJQ4Fnx3gqE7tcLtnIg93Su9s93Gt
// SIG // oM6BA8U9o/QVyFCmok803UD0bADGjt3VNM2hsDDJcLUi
// SIG // cg4deGBIGaFLub0vDLoDKnazY6Yci+ucioY6QFm4WJCB
// SIG // zv9LmY7vebT/M2TalyEYeLXX1hyTwE5/a/nMZMrodsdF
// SIG // S3X8dZZivV9zYx9DbYALOSQf8DpZMrrncZhU31lckay9
// SIG // +4rKTmfGjwBYL8kenDU5BqZBaN+SUY3IjZmYlOKk/VLc
// SIG // vleYLnRZNY8CAwEAAaOCAUkwggFFMB0GA1UdDgQWBBQ+
// SIG // Fo7kE1CW7W3d45r2ZLtBWdnlNjAfBgNVHSMEGDAWgBSf
// SIG // pxVdAF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSg
// SIG // UqBQhk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // b3BzL2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIw
// SIG // UENBJTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBe
// SIG // MFwGCCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRp
// SIG // bWUtU3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNV
// SIG // HRMBAf8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMI
// SIG // MA4GA1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOC
// SIG // AgEAzvwirHIhDPJK9X6h+E5X0+uhDaE48V8PNdKchKtD
// SIG // 3a4C8H4E98ftYM+wkB7VHXr6jEOah8gy4ZuqU/ddQmJB
// SIG // jfuoPjFO3zGE6+nd0sYnicASKFpH0eIO0orRszClOOuS
// SIG // hGHo33XaFIKLwv8XEaWgCzuad/wNuPAcoSYjLbQUDQ7b
// SIG // E/x2ghcERQlEW8v3/HNZJMvBfMZAlxc/vzLWeXdZVhY8
// SIG // DiNoHmR1qvV4oQzoHnuZ0tpKKOVep/FxtttFE3r1X/qY
// SIG // JqSB+9Vyg1SGExhmSbOsj5Xydml6sNTBODUeqJDbGNz9
// SIG // TN9R+gzGEXyRjQTXqefeZFxod2MwN3AosoPo5iefIf30
// SIG // 7454CKblBXzg6Q4xcdInNWKCwDcYQhd0YUvamDOyuNDR
// SIG // ISrIWLmgJCBtlwSmIoN6/9P29LI74wcLOeQGKJzJtwPK
// SIG // nF/+pPVX3NJr/XbaJx7lhnwNm/qhNqqQp4cxm3Qx6u4j
// SIG // kmRMNNZzbqQDH9XONZPSKE0Ns94sOsOGWaCzsoOEyjG6
// SIG // dZK6U+La4qf8t9Ar+ZIcqggzaml0KQZDmDjfC4LaEN2p
// SIG // lTl+4seY3a58f71MU1EooF761nS+1JPJKZktM7aNk6Mu
// SIG // 2k+aAcwk734/YifwTfxNb4RQZISQr2ez1b7DEp005pMd
// SIG // hWpdpVZM7bgCOOHw/7siyXWjEEswggdxMIIFWaADAgEC
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
// SIG // BgNVBAsTHm5TaGllbGQgVFNTIEVTTjpBMDAwLTA1RTAt
// SIG // RDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3Rh
// SIG // bXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUACaw/dMpB
// SIG // 6aP9ABm+5ZsL7ArakTmggYMwgYCkfjB8MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0BAQsFAAIF
// SIG // AO5oazIwIhgPMjAyNjEwMDEwNTE2MzRaGA8yMDI2MTAw
// SIG // MjA1MTYzNFowdDA6BgorBgEEAYRZCgQBMSwwKjAKAgUA
// SIG // 7mhrMgIBADAHAgEAAgIhNjAHAgEAAgISMDAKAgUA7mm8
// SIG // sgIBADA2BgorBgEEAYRZCgQCMSgwJjAMBgorBgEEAYRZ
// SIG // CgMCoAowCAIBAAIDB6EgoQowCAIBAAIDAYagMA0GCSqG
// SIG // SIb3DQEBCwUAA4IBAQA6Wm7JaOhE/canPIVORz++w6VU
// SIG // 6ZxqNmJ6iw6yWMPaeOghjPwFXRPjSCYATBa0kGEoMQ6N
// SIG // 5oLCY95EcFV4zpdEzUKmkuNY3he81xRKWSz4GkdMMlh9
// SIG // rCpC4Y1/gNPz9C7d/vwi5r2Ab7QTeNYKiIMLqJ6v7v3x
// SIG // CnAxR+DG7NfZ9MY+2AnL9uIYJShtc2FFSUtKc4OL3bgV
// SIG // OWMWsxcjK8NTuaHqO8pPxAGnhB6h5D47o3J6JMGarJ7v
// SIG // TxdN122b/UTRgA75VYA2tSCvWv94xfIUii3xtP9eRSn+
// SIG // Fpao8jGk+ulh0h2F5ue7ApkxJjHb48rxg86ZaJOWU2dJ
// SIG // Nsx+Ml+zMYIEDTCCBAkCAQEwgZMwfDELMAkGA1UEBhMC
// SIG // VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcT
// SIG // B1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jw
// SIG // b3JhdGlvbjEmMCQGA1UEAxMdTWljcm9zb2Z0IFRpbWUt
// SIG // U3RhbXAgUENBIDIwMTACEzMAAAIruwBQ/007mqEAAQAA
// SIG // AiswDQYJYIZIAWUDBAIBBQCgggFKMBoGCSqGSIb3DQEJ
// SIG // AzENBgsqhkiG9w0BCRABBDAvBgkqhkiG9w0BCQQxIgQg
// SIG // LT9OJEw6Lu/u6f2UWMmxU7YMt3QKat0Fie2bWI24uxkw
// SIG // gfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHkMIG9BCByDiP0
// SIG // P5BX7WAPjNjmPtQcd2owQ+v1gwLT09rxZL9uUjCBmDCB
// SIG // gKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMT
// SIG // HU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMz
// SIG // AAACK7sAUP9NO5qhAAEAAAIrMCIEIIaT1YI2IRLcpQv1
// SIG // iZDJ0/a0zBV0wO4AqCooHTyLZjVjMA0GCSqGSIb3DQEB
// SIG // CwUABIICAHWCVw3614jkplQKMySt2DX9umTjEnLQcUe4
// SIG // m2CTVZkeDdS/8jfQq4tR3hQ8/+bJO9meA1tf5ajmbiJb
// SIG // Uulhq1vLzo4hBN1nlkR83CzS0jW5C8SDi1yDSaDTwsEs
// SIG // VDTVotRw7VtqoNAdGOf/3J16ioIw8BaXx8I84TcaIYdP
// SIG // GMXkW59UMG2UQ4Km0WYU+S1Ve8/7vX1OudDXrYTZqagK
// SIG // NPJ5115gu8k8QoGr5bQ30XthjNvFjBOiVXy8I524dA+Y
// SIG // lE9Xozl2xrRkXA5z2IT5PyV96zm9evkZZmf4Y/rcVPLv
// SIG // e+M3dJVnd1zu31M9XuNgvsTHN2XzhM632ra+BCcHFcDm
// SIG // n20m7kqgNOMPmGuXy22auf/lITjqqNPWVMZMtQ8nQJXa
// SIG // HyAIThAr3nPQrsWKcTjgenhKQYOB/ff4HBt0VcwfdQgf
// SIG // SiexHWyKt1uULdwDI5EtnKANA5AisrlPxNcm0SUSiFoi
// SIG // pl0hWmILRSsbDhyfJqFkX9EkSGb6MIniDQ/gIpWXnUb4
// SIG // 81k7MkIYGflpJuv72Jr5ncZ3YU1rql9jJBXcbwLC6zZC
// SIG // A91P7PqE2g55MmzE5gbYhD56Z8uUUS3+P11AXPX57ODD
// SIG // YfU1wn/97WRBZL8gUYry9Sl6S8c62XLmmJaVLVuLvJl5
// SIG // ysBDlJrU0N6WXch7odO111B3rklnv7Qy
// SIG // End signature block
