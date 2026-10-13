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
const os = require("os");
const path = require("path");
var process = require('process');
const fs = require("fs");
const tl = require("azure-pipelines-task-lib/task");
const tr = require("azure-pipelines-task-lib/toolrunner");
// used for escaping the path to the Invoke-Robocopy.ps1 script that is passed to the powershell command
let pathToScriptPSString = (filePath) => {
    // remove double quotes
    let result = filePath.replace(/"/g, '');
    // double-up single quotes and enclose in single quotes. this is to create a single-quoted string in powershell.
    result = result.replace(/'/g, "''");
    return `'${result}'`;
};
// used for escaping file paths that are ultimately passed to robocopy (via the powershell command)
let pathToRobocopyPSString = (filePath) => {
    // the path needs to be fixed-up due to a robocopy quirk handling trailing backslashes.
    //
    // according to http://ss64.com/nt/robocopy.html:
    //   If either the source or desination are a "quoted long foldername" do not include a
    //   trailing backslash as this will be treated as an escape character, i.e. "C:\some path\"
    //   will fail but "C:\some path\\" or "C:\some path\." or "C:\some path" will work.
    //
    // furthermore, PowerShell implicitly double-quotes arguments to external commands when the
    // argument contains unquoted spaces.
    //
    // note, details on PowerShell quoting rules for external commands can be found in the
    // source code here:
    // https://github.com/PowerShell/PowerShell/blob/v0.6.0/src/System.Management.Automation/engine/NativeCommandParameterBinder.cs
    // remove double quotes
    let result = filePath.replace(/"/g, '');
    // append a "." if the path ends with a backslash. e.g. "C:\some path\" -> "C:\some path\."
    if (result.endsWith('\\')) {
        result += '.';
    }
    // double-up single quotes and enclose in single quotes. this is to create a single-quoted string in powershell.
    result = result.replace(/'/g, "''");
    return `'${result}'`;
};
/**
 * Creates plain (not compressed) tar archive from files located in `filesPath`.
 * `filesPath` input may contain a file or a folder with files.
 * Puts created tar file to temp directory ($(Agent.TempDirectory)/`artifactName`.tar).
 *
 * @param filesPath path to a file or a directory of files to add to a tar archive
 * @param artifactName the name of the artifact. This will be used to determine tar archive name
 * @returns string
 */
function createTarArchive(filesPath, artifactName) {
    const tar = tl.tool(tl.which('tar', true));
    const outputFilePath = path.join(tl.getVariable('Agent.TempDirectory'), `${artifactName}.tar`);
    if (tl.stats(filesPath).isFile()) {
        // If filesPath is a file, we only have to add a single file
        tar.arg(['cf', outputFilePath, '--directory', path.dirname(filesPath), path.basename(filesPath)]);
    }
    else {
        // If filesPath is a directory, we have to add all files from that directory to the tar archive
        tar.arg(['cf', outputFilePath, '--directory', filesPath, '.']);
    }
    const tarExecResult = tar.execSync();
    if (tarExecResult.error || tarExecResult.code !== 0) {
        throw new Error(`Couldn't add artifact files to a tar archive: ${tarExecResult.error}`);
    }
    return outputFilePath;
}
/**
 * If the `StoreAsTar` input is set to false, return path to publish unaltered;
 * otherwise add all files from this path to a tar archive and return path to that archive
 *
 * @param pathToPublish value of `PathtoPublish` input
 * @param shouldStoreAsTar value of `PathtoPublish` input
 * @param artifactName value of `ArtifactName` input
 * @returns string
 */
function getPathToUploadAndCreateTarIfNeeded(pathToPublish, shouldStoreAsTar, artifactName) {
    if (!shouldStoreAsTar) {
        return pathToPublish;
    }
    return createTarArchive(pathToPublish, artifactName);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            tl.setResourcePath(path.join(__dirname, 'task.json'));
            const shouldStoreAsTar = tl.getBoolInput('StoreAsTar');
            const isWindows = os.platform() === 'win32';
            if (isWindows && shouldStoreAsTar) {
                tl.setResult(tl.TaskResult.Failed, tl.loc('TarExtractionNotSupportedInWindows'));
                return;
            }
            // pathToPublish is a folder or a single file that may be added to a tar archive later
            const pathToPublish = tl.getPathInput('PathtoPublish', true, true);
            var artifactName = tl.getInput('ArtifactName', true);
            // if FF EnableBuildArtifactsPlusSignWorkaround is enabled or AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND environment variable is set:
            // replacing '+' symbol by its representation ' '(space) - workaround for the DownloadBuildArtifactV0 task,
            // where downloading of part of artifact is not possible if there is a plus symbol
            const enableBuildArtifactsPlusSignWorkaround = process.env.AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND ? process.env.AZP_TASK_FF_ENABLE_BUILDARTIFACTS_PLUS_SIGN_WORKAROUND.toLowerCase() === "true" : false;
            if (enableBuildArtifactsPlusSignWorkaround)
                artifactName = artifactName.replace(/\+/g, ' ');
            // pathToUpload is an actual folder or file that will get uploaded
            const pathToUpload = getPathToUploadAndCreateTarIfNeeded(pathToPublish, shouldStoreAsTar, artifactName);
            let artifactType = tl.getInput('ArtifactType', true);
            let hostType = tl.getVariable('system.hostType');
            if ((hostType && hostType.toUpperCase() != 'BUILD') && (artifactType.toUpperCase() !== "FILEPATH")) {
                tl.setResult(tl.TaskResult.Failed, tl.loc('ErrorHostTypeNotSupported'));
                return;
            }
            artifactType = artifactType.toLowerCase();
            let data = {
                artifacttype: artifactType,
                artifactname: artifactName
            };
            let maxArtifactSize = getMaxArtifactSize();
            if (maxArtifactSize != 0) {
                let artifactSize = getArtifactSize(pathToUpload);
                if (artifactSize > maxArtifactSize) {
                    tl.warning(tl.loc('ArtifactSizeExceeded', artifactSize, maxArtifactSize));
                }
            }
            // upload or copy
            if (artifactType === "container") {
                data["containerfolder"] = artifactName;
                // add localpath to ##vso command's properties for back compat of old Xplat agent
                data["localpath"] = pathToUpload;
                tl.command("artifact.upload", data, pathToUpload);
            }
            else if (artifactType === "filepath") {
                let targetPath = tl.getInput('TargetPath', true);
                let artifactPath = path.join(targetPath, artifactName);
                data['artifactlocation'] = targetPath; // artifactlocation for back compat with old xplat agent
                if (os.platform() == 'win32') {
                    tl.mkdirP(artifactPath);
                    // create the artifact. at this point, mkdirP already succeeded so the path is good.
                    // the artifact should get cleaned up during retention even if the copy fails in the
                    // middle
                    tl.command("artifact.associate", data, targetPath);
                    let parallel = tl.getBoolInput('Parallel', false);
                    let parallelCount = 1;
                    if (parallel) {
                        parallelCount = getParallelCount();
                    }
                    // copy the files
                    let script = path.join(__dirname, 'Invoke-Robocopy.ps1');
                    let command = `& ${pathToScriptPSString(script)} -Source ${pathToRobocopyPSString(pathToUpload)} -Target ${pathToRobocopyPSString(artifactPath)} -ParallelCount ${parallelCount}`;
                    if (tl.stats(pathToUpload).isFile()) {
                        let parentFolder = path.dirname(pathToUpload);
                        let file = path.basename(pathToUpload);
                        command = `& ${pathToScriptPSString(script)} -Source ${pathToRobocopyPSString(parentFolder)} -Target ${pathToRobocopyPSString(artifactPath)} -ParallelCount ${parallelCount} -File '${file}'`;
                    }
                    let powershell = new tr.ToolRunner('powershell.exe');
                    powershell.arg('-NoLogo');
                    powershell.arg('-Sta');
                    powershell.arg('-NoProfile');
                    powershell.arg('-NonInteractive');
                    powershell.arg('-ExecutionPolicy');
                    powershell.arg('Unrestricted');
                    powershell.arg('-Command');
                    powershell.arg(command);
                    powershell.on('stdout', (buffer) => {
                        process.stdout.write(buffer);
                    });
                    powershell.on('stderr', (buffer) => {
                        process.stderr.write(buffer);
                    });
                    let execOptions = { silent: true };
                    yield powershell.exec(execOptions);
                }
                else {
                    // file share artifacts are not currently supported on OSX/Linux.
                    tl.setResult(tl.TaskResult.Failed, tl.loc('ErrorFileShareLinux'));
                    return;
                }
            }
        }
        catch (err) {
            tl.setResult(tl.TaskResult.Failed, tl.loc('PublishBuildArtifactsFailed', err.message));
        }
    });
}
function getParallelCount() {
    let result = 8;
    let inputValue = tl.getInput('ParallelCount', false);
    if (Number.isNaN(Number(inputValue))) {
        tl.warning(tl.loc('UnexpectedParallelCount', inputValue));
    }
    else {
        let parsedInput = parseInt(inputValue);
        if (parsedInput < 1) {
            tl.warning(tl.loc('UnexpectedParallelCount', parsedInput));
            result = 1;
        }
        else if (parsedInput > 128) {
            tl.warning(tl.loc('UnexpectedParallelCount', parsedInput));
            result = 128;
        }
        else {
            result = parsedInput;
        }
    }
    return result;
}
function getMaxArtifactSize() {
    let result = 0;
    let inputValue = tl.getInput('MaxArtifactSize', false);
    if (!(Number.isNaN(Number(inputValue)))) {
        result = parseInt(inputValue);
    }
    return result;
}
function getArtifactSize(pathToUpload) {
    let totalSize = 0;
    if (tl.stats(pathToUpload).isFile()) {
        totalSize = tl.stats(pathToUpload).size;
    }
    else if (tl.stats(pathToUpload).isDirectory()) {
        const files = fs.readdirSync(pathToUpload);
        files.forEach(file => {
            totalSize = totalSize + getArtifactSize(path.join(pathToUpload, file));
        });
    }
    return totalSize;
}
run();

// SIG // Begin signature block
// SIG // MIInbgYJKoZIhvcNAQcCoIInXzCCJ1sCAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // S/Yu4fWCyleuqgTJLxJP8xA/r7NT6qfR1J00B9FhDGOg
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
// SIG // 9hxwL30BElj9MYIZ/TCCGfkCAQEwbjBXMQswCQYDVQQG
// SIG // EwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWdu
// SIG // aW5nIFBDQSAyMDI0AhMzAAACHPrNxZvoL37EAAAAAAIc
// SIG // MA0GCWCGSAFlAwQCAQUAoIGuMBkGCSqGSIb3DQEJAzEM
// SIG // BgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAMBgor
// SIG // BgEEAYI3AgEVMC8GCSqGSIb3DQEJBDEiBCAKUtbO/ekl
// SIG // W1qkgfTJjw1YEU855epNhClEFTrIHv/FyzBCBgorBgEE
// SIG // AYI3AgEMMTQwMqAUgBIATQBpAGMAcgBvAHMAbwBmAHSh
// SIG // GoAYaHR0cDovL3d3dy5taWNyb3NvZnQuY29tMA0GCSqG
// SIG // SIb3DQEBAQUABIIBACRdNlBBHsBUg0ZwemYKnP7CXj1a
// SIG // EPQAaql0YVC99F9BLl4g17chl5ifiEc6okXgYZwShIYp
// SIG // F0It1SuBhlza0snPaAZ/q7ybk5F14+hr9cUSrt1bxmCz
// SIG // fQKXqlk4QRjkr2hWptBdMim0V14xi2+4KGyR+izMJL9b
// SIG // uyf+gDpyZYLSJcGeRJ4R1ocqkVZpdweigRuXQcYzK+8P
// SIG // fbAYhCCTJNM/yb2aEYO+LVfj/JAA0N1jJdbrpSlpD5ca
// SIG // 22IE/+xfVvHn+HSVIrBweKeDk2aO6gHfaLDbxD41rUFD
// SIG // aJybMI4HV5bl47bo61D9yWAA46ciMhRn4pPmk9dGBJQ4
// SIG // RXW7RbWhghevMIIXqwYKKwYBBAGCNwMDATGCF5swgheX
// SIG // BgkqhkiG9w0BBwKggheIMIIXhAIBAzEPMA0GCWCGSAFl
// SIG // AwQCAQUAMIIBWQYLKoZIhvcNAQkQAQSgggFIBIIBRDCC
// SIG // AUACAQEGCisGAQQBhFkKAwEwMTANBglghkgBZQMEAgEF
// SIG // AAQg8mqmZOwKp8IMnsXNALtKaP1pItzDn6zuzEwvHbR0
// SIG // xNsCBmqJBv1OhhgSMjAyNjA4MjQwNTIyMTQuMjVaMASA
// SIG // AgH0oIHZpIHWMIHTMQswCQYDVQQGEwJVUzETMBEGA1UE
// SIG // CBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEe
// SIG // MBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMS0w
// SIG // KwYDVQQLEyRNaWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRp
// SIG // b25zIExpbWl0ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNT
// SIG // IEVTTjo0MzFBLTA1RTAtRDk0NzElMCMGA1UEAxMcTWlj
// SIG // cm9zb2Z0IFRpbWUtU3RhbXAgU2VydmljZaCCEf4wggco
// SIG // MIIFEKADAgECAhMzAAACHUvAkoc4hX45AAEAAAIdMA0G
// SIG // CSqGSIb3DQEBCwUAMHwxCzAJBgNVBAYTAlVTMRMwEQYD
// SIG // VQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25k
// SIG // MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // JjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBD
// SIG // QSAyMDEwMB4XDTI1MDgxNDE4NDgzM1oXDTI2MTExMzE4
// SIG // NDgzM1owgdMxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
// SIG // YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
// SIG // VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xLTArBgNV
// SIG // BAsTJE1pY3Jvc29mdCBJcmVsYW5kIE9wZXJhdGlvbnMg
// SIG // TGltaXRlZDEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNO
// SIG // OjQzMUEtMDVFMC1EOTQ3MSUwIwYDVQQDExxNaWNyb3Nv
// SIG // ZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIICIjANBgkqhkiG
// SIG // 9w0BAQEFAAOCAg8AMIICCgKCAgEAorSgaAA8oOl4ph57
// SIG // 4zw29egUN8DDepRHLX8FM1zHNJmXG6KrSqUKwzcKafop
// SIG // uYdPTETTCvb9aJfESuAU0iGNUFI/D6R0kvdfpe2oPX+E
// SIG // 3sbTQvGi4JPH5qdIYUaJ45V/4bqe8eNvbWzpC+ZKjH19
// SIG // 3DeiI1XAI918JoQmBhlEXo/Ton1721luZJgincsf5LjM
// SIG // Y3jX84WyXUSX3dsS7h/7xVI+w1yjg7pa+0y3o/me2Tsv
// SIG // 6UJUdSTQap5ORGSfCnclnP1z3IiiWIWr3Vo7aIPWsgJz
// SIG // q3m5GxpxUHCQk8qzUhk50y/uB+LGE3WIK2C77iy9iFsS
// SIG // fSLUnyMEzGRDW9mXHT4PH7Ozz6CHqQEiNvwcHqlvlCh1
// SIG // pHQh1NXQSAqOoVBs5mi6easf6yxWTfe5DrR79503r8pU
// SIG // 6VqC2Y9XMRU4wH9QbYXYsIUZ33Jmndy22W1LBDAbxBPQ
// SIG // HCBlncGDU3BgdhVUVLe80mggFO98FdkWho67w4kPdCTR
// SIG // kvdvkY8PrQYE/nQjHXCa0g7LcMttZb6ejMHfQ+tUWXv6
// SIG // +nZ4Ynkr2OkaxclFCw4RIYNMWD26AWbQj/WEdzga18fK
// SIG // tw66L5gzXPza6jFBfPJeKE3H8QAuwpirmH4ms+5nUjNN
// SIG // QOmNgqJn0U1+3Yn7ClswD79YN0r3fdbYBMDApBZJpNlK
// SIG // 7q7HXRsCAwEAAaOCAUkwggFFMB0GA1UdDgQWBBSEWfBx
// SIG // NEamZtXm8gl92Yq80jfxXTAfBgNVHSMEGDAWgBSfpxVd
// SIG // AF5iXYP05dJlpxtTNRnpcjBfBgNVHR8EWDBWMFSgUqBQ
// SIG // hk5odHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3Bz
// SIG // L2NybC9NaWNyb3NvZnQlMjBUaW1lLVN0YW1wJTIwUENB
// SIG // JTIwMjAxMCgxKS5jcmwwbAYIKwYBBQUHAQEEYDBeMFwG
// SIG // CCsGAQUFBzAChlBodHRwOi8vd3d3Lm1pY3Jvc29mdC5j
// SIG // b20vcGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMFRpbWUt
// SIG // U3RhbXAlMjBQQ0ElMjAyMDEwKDEpLmNydDAMBgNVHRMB
// SIG // Af8EAjAAMBYGA1UdJQEB/wQMMAoGCCsGAQUFBwMIMA4G
// SIG // A1UdDwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOCAgEA
// SIG // kdweB4yxvLspLKq0D+miyD4Q0EcxVFpNZuJxiR54gWRk
// SIG // eTDDuymNeB03JhlsBpbwSYJ5uZSgDBCvwHED2VL8lJpF
// SIG // lOprJzxsXWC2NTfA+O+PO5Fk5jw6LHh6jeBADDEdQAx3
// SIG // Hqi7Zm0JwvQ93z5f6dtxkm29WqOcHYXRXfAQwy1hSrLX
// SIG // yfeblqR66jpP/9n0fCkWU4ggsUjQpQ2Ngj1DV09J4Y3y
// SIG // 7p9Nd81+Xs6qYo++7RKm8qiB/5NDeigOLjlAeFgiEXIR
// SIG // UJW+mJyqpQw+OORlaqcFjR8Hu0G+/7bMdek68YX+kPpD
// SIG // Bk7Ue+I/xgiYJ1xcDRBn/vczLtN72+RIlD4UgXYLuBSC
// SIG // k//pDEPX5z39Cr+rkc6E4Y28FPk4BhloAyvp628P4xfE
// SIG // lQY8TcxraUbZShypocE6ny95D1K1BkltZmrHVKCxmgln
// SIG // uOlM15NKIrXFlXCzdqpCtIwQ417wNAVF/QDPvzzbumPd
// SIG // Ti6fb0tLbScYobV6zvbBsMsKEME4Tj1b9oIXC8dybJq4
// SIG // nbboEXYpRwi1QAbpSNrn+PxGW9uf1q63FnMJu4gm3Oh6
// SIG // 3njW/iVf723quzyHrSijWMgY0HiRiHQi0Jyu0h8MdhRU
// SIG // p7mxbmLQckPiOFwAlIaUN/k725y/aLWpkRU6fqmLlEOy
// SIG // H5WpyLd23AYy9r8v+Qoba6swggdxMIIFWaADAgECAhMz
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
// SIG // ahC0HVUzWLOhcGbyoYIDWTCCAkECAQEwggEBoYHZpIHW
// SIG // MIHTMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGlu
// SIG // Z3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMV
// SIG // TWljcm9zb2Z0IENvcnBvcmF0aW9uMS0wKwYDVQQLEyRN
// SIG // aWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRpb25zIExpbWl0
// SIG // ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNTIEVTTjo0MzFB
// SIG // LTA1RTAtRDk0NzElMCMGA1UEAxMcTWljcm9zb2Z0IFRp
// SIG // bWUtU3RhbXAgU2VydmljZaIjCgEBMAcGBSsOAwIaAxUA
// SIG // uoO+BKbfXzqyfi9GLEdWHkCLeT+ggYMwgYCkfjB8MQsw
// SIG // CQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQ
// SIG // MA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9z
// SIG // b2Z0IENvcnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3Nv
// SIG // ZnQgVGltZS1TdGFtcCBQQ0EgMjAxMDANBgkqhkiG9w0B
// SIG // AQsFAAIFAO42KGUwIhgPMjAyNjA4MjQwMjE4MTNaGA8y
// SIG // MDI2MDgyNTAyMTgxM1owdzA9BgorBgEEAYRZCgQBMS8w
// SIG // LTAKAgUA7jYoZQIBADAKAgEAAgIeeQIB/zAHAgEAAgIS
// SIG // 1TAKAgUA7jd55QIBADA2BgorBgEEAYRZCgQCMSgwJjAM
// SIG // BgorBgEEAYRZCgMCoAowCAIBAAIDB6EgoQowCAIBAAID
// SIG // AYagMA0GCSqGSIb3DQEBCwUAA4IBAQA+q0Xx/kiq8mQR
// SIG // 49pSeUOK76MLBLLPFJxl4H3nDz1pTSPXmvMkOlfrH2IB
// SIG // Zalt9Js7DxWQbGLFlFbXd+7HCMWKpMKV0TqwJiYvcn6K
// SIG // ZvetcrO6N8U0WE2bgKH0wzvm9m0t5R7+7q+YoGAWtVRy
// SIG // Jxm89vjQYu6hc+SQHUN1mo30MFtJKDVZxeGSJMfe/RgK
// SIG // +rlRTWk3Ec+CZ1w1xp553CaNzm7I+BSdhIDsqahwtu4/
// SIG // Vmga8DA5IIHjnOdF37V2UmZzsSinX4OQog5Qi3UE8Ba5
// SIG // bGUwCq4LtMKOaTywun7TgEBiloGka4eL/l+iO2yOmhSd
// SIG // /wCjtS5D2166gMX1j6gxMYIEDTCCBAkCAQEwgZMwfDEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9z
// SIG // b2Z0IFRpbWUtU3RhbXAgUENBIDIwMTACEzMAAAIdS8CS
// SIG // hziFfjkAAQAAAh0wDQYJYIZIAWUDBAIBBQCgggFKMBoG
// SIG // CSqGSIb3DQEJAzENBgsqhkiG9w0BCRABBDAvBgkqhkiG
// SIG // 9w0BCQQxIgQgwpOCgD9StTmbfAjDMYOcwTU//yec4Hzf
// SIG // L0erYve9J6cwgfoGCyqGSIb3DQEJEAIvMYHqMIHnMIHk
// SIG // MIG9BCCxtpXMXEiLJzrqM77ep4rTNwrMOj6gpWN9hZvp
// SIG // j5QFUTCBmDCBgKR+MHwxCzAJBgNVBAYTAlVTMRMwEQYD
// SIG // VQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25k
// SIG // MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // JjAkBgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBD
// SIG // QSAyMDEwAhMzAAACHUvAkoc4hX45AAEAAAIdMCIEIJmf
// SIG // J/uj9MJl4PvQgLU0ygAy4Tu7i9QtBXm9ljPzykbxMA0G
// SIG // CSqGSIb3DQEBCwUABIICAFats3UUGoNVx1ildT3HRdC4
// SIG // x2YSS1Dn4qf2SvIEbkZZ8K/NCFEANPbsJC6FtjP3/3IV
// SIG // fOPAJj7sqVse5k2J7OiDkshVymmBDbbBwMt2lKTSPHLg
// SIG // HCRwNA9w632x24rgB+Zh+U2BUSa/5waZJTnD4uNYG1uQ
// SIG // vuRddnDSEk1o2bv6InRlLZv62OKA0Zf+XO1FlyMeC80g
// SIG // OKGzd4IXxl1RiGPKLGdlTF8bTVypijo2UO/47t2APTju
// SIG // jYKeZeh987SgoBulSB/oNOtODSHFn+qDRiSyTOXlbOuB
// SIG // BGD/9bAEL4EmhWkmAvWuSA2EnxFSkqRgILPSw6hw92j7
// SIG // 1rh4UWTt3+H9QczK8/upgnrLpvP5teLgH/Hg9bmyvISw
// SIG // RciWZxXjp4m+8JyHJkZe82zaf70lzUw/Zt3jWUaCEuxM
// SIG // rQ4a9VpMQQKz2OBWrElOceOZeQrRvbDX0MYv+foGEawR
// SIG // SwP2WJSLCh4fcOgH3+IwgDlB81rsrGvzMx50QGMx9PRW
// SIG // bpzcoHL/Z355s8+CmmyLniQ88fCqzEPH6u/ojUbD65p3
// SIG // nVlCGfbfqTKBTMIRUrDXeRUEtSjgUPcpsDW/2M9kluKp
// SIG // yDzgMjE1vbPA5GG42DaTauuCXHcINLZWaOpc7fTC32dp
// SIG // nNk4ld4jIXJV340rQNWaII8NZdCbBf3DOH5F21ktdlw5
// SIG // End signature block
