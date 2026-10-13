"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FailTaskError = void 0;
const path = require("path");
const tl = require("azure-pipelines-task-lib/task");
const fs = require("fs");
const utils = require("./utils.js");
var repoRoot = tl.getVariable('System.DefaultWorkingDirectory');
var rootFolderOrFile = makeAbsolute(path.normalize(tl.getPathInput('rootFolderOrFile', true, false).trim()));
var includeRootFolder = tl.getBoolInput('includeRootFolder', true);
var archiveType = tl.getInput('archiveType', true);
var archiveFile = path.normalize(tl.getPathInput('archiveFile', true, false).trim());
var replaceExistingArchive = tl.getBoolInput('replaceExistingArchive', true);
var verbose = tl.getBoolInput('verbose', false);
var quiet = tl.getBoolInput('quiet', false);
tl.debug('repoRoot: ' + repoRoot);
var win = tl.osType().match(/^Win/);
tl.debug('win: ' + win);
// archivers
var xpTarLocation;
var xpZipLocation;
// 7zip
var xpSevenZipLocation;
var winSevenZipLocation = path.join(__dirname, '7zip/7z.exe');
function getSevenZipLocation() {
    if (win) {
        return winSevenZipLocation;
    }
    else {
        if (typeof xpTarLocation == "undefined") {
            xpSevenZipLocation = tl.which('7z', true);
        }
        return xpSevenZipLocation;
    }
}
function findFiles() {
    if (includeRootFolder) {
        if (!fs.existsSync(rootFolderOrFile)) {
            tl.warning(`No file or directory found - ${rootFolderOrFile}`);
        }
        return [path.basename(rootFolderOrFile)];
    }
    else {
        var fullPaths = tl.ls('-A', [rootFolderOrFile]);
        var baseNames = [];
        for (var i = 0; i < fullPaths.length; i++) {
            baseNames[i] = path.basename(fullPaths[i]);
        }
        return baseNames;
    }
}
function makeAbsolute(normalizedPath) {
    tl.debug('makeAbsolute:' + normalizedPath);
    var result = normalizedPath;
    if (!path.isAbsolute(normalizedPath)) {
        result = path.join(repoRoot, normalizedPath);
        tl.debug('Relative file path: ' + normalizedPath + ' resolving to: ' + result);
    }
    return result;
}
function createFileList(files) {
    const tempDirectory = tl.getVariable('Agent.TempDirectory');
    const fileName = Math.random().toString(36).replace('0.', '');
    const file = path.resolve(tempDirectory, fileName);
    try {
        fs.writeFileSync(file, files.reduce((prev, cur) => prev + cur + "\n", ""), { encoding: "utf8" });
    }
    catch (error) {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
        throw error;
    }
    return file;
}
function getOptions() {
    var dirName;
    if (includeRootFolder) {
        dirName = path.dirname(rootFolderOrFile);
        tl.debug("cwd (include root folder)= " + dirName);
        return { cwd: dirName, outStream: process.stdout, errStream: process.stderr };
    }
    else {
        var stats = tl.stats(rootFolderOrFile);
        if (stats.isFile()) {
            dirName = path.dirname(rootFolderOrFile);
        }
        else {
            dirName = rootFolderOrFile;
        }
        tl.debug("cwd (exclude root folder)= " + dirName);
        return { cwd: dirName, outStream: process.stdout, errStream: process.stderr };
    }
}
function sevenZipArchive(archive, compression, files) {
    tl.debug('Creating archive with 7-zip: ' + archive);
    var sevenZip = tl.tool(getSevenZipLocation());
    sevenZip.arg('a');
    sevenZip.arg('-t' + compression);
    if (verbose) {
        // Set highest logging level
        sevenZip.arg('-bb3');
    }
    const sevenZipCompression = tl.getInput('sevenZipCompression', false);
    if (sevenZipCompression) {
        sevenZip.arg('-mx=' + mapSevenZipCompressionLevel(sevenZipCompression));
    }
    sevenZip.arg(archive);
    const fileList = createFileList(files);
    sevenZip.arg('@' + fileList);
    return handleExecResult(sevenZip.execSync(getOptions()), archive);
}
// map from YAML-friendly value to 7-Zip numeric value
function mapSevenZipCompressionLevel(sevenZipCompression) {
    switch (sevenZipCompression.toLowerCase()) {
        case "ultra":
            return "9";
        case "maximum":
            return "7";
        case "normal":
            return "5";
        case "fast":
            return "3";
        case "fastest":
            return "1";
        case "none":
            return "0";
        default:
            return "5";
    }
}
// linux & mac only
function zipArchive(archive, files) {
    tl.debug('Creating archive with zip: ' + archive);
    if (typeof xpZipLocation == "undefined") {
        xpZipLocation = tl.which('zip', true);
    }
    var zip = tl.tool(xpZipLocation);
    zip.arg('-r');
    // Verbose gets priority over quiet
    if (verbose) {
        zip.arg('-v');
    }
    else if (quiet) {
        zip.arg('-q');
    }
    zip.arg(archive);
    zip.arg('--');
    for (var i = 0; i < files.length; i++) {
        zip.arg(files[i]);
        console.log(tl.loc('Filename', files[i]));
    }
    return handleExecResult(zip.execSync(getOptions()), archive);
}
// linux & mac only
function tarArchive(archive, compression, files) {
    tl.debug('Creating archive with tar: ' + archive + ' using compression: ' + compression);
    if (typeof xpTarLocation == "undefined") {
        xpTarLocation = tl.which('tar', true);
    }
    var tar = tl.tool(xpTarLocation);
    if (tl.exist(archive)) {
        tar.arg('-r'); // append files to existing tar
    }
    else {
        tar.arg('-c'); // create new tar otherwise
    }
    if (verbose) {
        tar.arg('-v');
    }
    if (compression) {
        tar.arg('--' + compression);
    }
    tar.arg('-f');
    tar.arg(archive);
    tar.arg('--');
    for (var i = 0; i < files.length; i++) {
        tar.arg(files[i]);
    }
    return handleExecResult(tar.execSync(getOptions()), archive);
}
function handleExecResult(execResult, archive) {
    if (execResult.code != tl.TaskResult.Succeeded) {
        tl.debug('execResult: ' + JSON.stringify(execResult));
        failTask(tl.loc('ArchiveCreationFailedWithError', archive, execResult.code, execResult.stdout, execResult.stderr, execResult.error));
    }
}
function failTask(message) {
    throw new FailTaskError(message);
}
class FailTaskError extends Error {
}
exports.FailTaskError = FailTaskError;
/**
 * Windows only
 * standard gnu-tar extension formats with recognized auto compression formats
 * https://www.gnu.org/software/tar/manual/html_section/tar_69.html
 *
 * Computes the name of the tar to use inside a compressed tar.
 * E.g. foo.tar.gz is expected to have foo.tar inside
 */
function computeTarName(archiveName) {
    var lowerArchiveName = archiveName.toLowerCase();
    //standard full extensions
    //                     gzip        xz        bzip2
    var fullExtensions = ['.tar.gz', '.tar.xz', '.tar.bz2'];
    for (var i = 0; i < fullExtensions.length; i++) {
        if (lowerArchiveName.endsWith(fullExtensions[i])) {
            return archiveName.substring(0, archiveName.lastIndexOf('.'));
        }
    }
    //standard abbreviated extensions
    //                 gzip    gzip    bzip2   bzip2   bzip2   xz
    var extensions = ['.tgz', '.taz', '.tz2', 'tbz2', '.tbz', '.txz'];
    for (var i = 0; i < extensions.length; i++) {
        if (lowerArchiveName.endsWith(extensions[i])) {
            return archiveName.substring(0, archiveName.lastIndexOf('.')) + '.tar';
        }
    }
    // if 7zip falls down here, or if a .tz2 file is encountered, there is occasionally strange
    // behavior resulting in archives that are correct but are renamed
    // e.g. test.tz2 has test inside of it instead of test.tar (7z decides to rename it)
    // e.g. test_tgz has an outer name of test_tgz.gz (7z decides to add the .gz to it).
    //non standard name
    //foo.tar.anything --> foo.tar
    if (lowerArchiveName.lastIndexOf('.tar.') > 0) {
        return archiveName.substring(0, lowerArchiveName.lastIndexOf('.tar.') + 4);
    }
    // foo.anything --> foo.tar
    else if (lowerArchiveName.lastIndexOf('.') > 0) {
        return archiveName.substring(0, lowerArchiveName.lastIndexOf('.')) + '.tar';
    }
    // foo --> foo.tar
    return lowerArchiveName + '.tar';
}
function createArchive(files) {
    if (win) { // windows only
        if (archiveType == "default" || archiveType == "zip") { //default is zip format
            sevenZipArchive(archiveFile, "zip", files);
        }
        else if (archiveType == "tar") {
            var tarCompression = tl.getInput('tarCompression', true);
            if (tarCompression == "none") {
                sevenZipArchive(archiveFile, archiveType, files);
            }
            else {
                var tarFile = computeTarName(archiveFile);
                var tarExists = tl.exist(tarFile);
                try {
                    if (tarExists) {
                        console.log(tl.loc('TarExists', tarFile));
                    }
                    // this file could already exist, but not checking because by default files will be added to it
                    // create the tar file
                    sevenZipArchive(tarFile, archiveType, files);
                    // compress the tar file
                    var sevenZipCompressionFlag = tarCompression;
                    if (tarCompression == 'gz') {
                        sevenZipCompressionFlag = 'gzip';
                    }
                    else if (tarCompression == 'bz2') {
                        sevenZipCompressionFlag = 'bzip2';
                    }
                    sevenZipArchive(archiveFile, sevenZipCompressionFlag, [tarFile]);
                }
                finally {
                    // delete the tar file if we created it.
                    if (!tarExists) {
                        tl.rmRF(tarFile);
                    }
                }
            }
        }
        else {
            sevenZipArchive(archiveFile, archiveType, files);
        }
    }
    else { // not windows
        if (archiveType == "default" || archiveType == "zip") { //default is zip format
            zipArchive(archiveFile, files);
        }
        else if (archiveType == "tar") {
            var tarCompression = tl.getInput('tarCompression', true);
            var tarCompressionFlag;
            if (tarCompression == "none") {
                tarCompressionFlag = null;
            }
            else if (tarCompression == "gz") {
                tarCompressionFlag = "gz";
            }
            else if (tarCompression == "bz2") {
                tarCompressionFlag = "bzip2";
            }
            else if (tarCompression == "xz") {
                tarCompressionFlag = "xz";
            }
            tarArchive(archiveFile, tarCompressionFlag, files);
        }
        else {
            sevenZipArchive(archiveFile, archiveType, files);
        }
    }
}
function doWork() {
    try {
        tl.setResourcePath(path.join(__dirname, 'task.json'));
        // replaceExistingArchive before creation?
        if (tl.exist(archiveFile)) {
            if (replaceExistingArchive) {
                try {
                    var stats = tl.stats(archiveFile);
                    if (stats.isFile()) {
                        console.log(tl.loc('RemoveBeforeCreation', archiveFile));
                        tl.rmRF(archiveFile);
                    }
                    else {
                        failTask(tl.loc('ArchiveFileExistsButNotAFile', archiveFile));
                    }
                }
                catch (e) {
                    failTask(tl.loc('FailedArchiveFile', archiveFile, e));
                }
            }
            else {
                console.log(tl.loc('AlreadyExists', archiveFile));
            }
        }
        // Find matching archive files
        var files = findFiles();
        utils.reportArchivePlan(files).forEach(line => console.log(line));
        tl.debug(`Listing all ${files.length} files to archive:`);
        files.forEach(file => tl.debug(file));
        //ensure output folder exists
        var destinationFolder = path.dirname(archiveFile);
        tl.debug("Checking for archive destination folder:" + destinationFolder);
        if (!tl.exist(destinationFolder)) {
            tl.debug("Destination folder does not exist, creating:" + destinationFolder);
            tl.mkdirP(destinationFolder);
        }
        createArchive(files);
        tl.setResult(tl.TaskResult.Succeeded, 'Successfully created archive: ' + archiveFile);
    }
    catch (e) {
        tl.debug(e.message);
        tl.error(e);
        tl.setResult(tl.TaskResult.Failed, e.message);
    }
}
doWork();

// SIG // Begin signature block
// SIG // MIInbwYJKoZIhvcNAQcCoIInYDCCJ1wCAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // Qz2lolH+E+eUvxFbTaq6+4x8oLcC2/sYk6bez5HENtCg
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
// SIG // 9hxwL30BElj9MYIZ/jCCGfoCAQEwbjBXMQswCQYDVQQG
// SIG // EwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBTaWdu
// SIG // aW5nIFBDQSAyMDI0AhMzAAACHPrNxZvoL37EAAAAAAIc
// SIG // MA0GCWCGSAFlAwQCAQUAoIGuMBkGCSqGSIb3DQEJAzEM
// SIG // BgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAMBgor
// SIG // BgEEAYI3AgEVMC8GCSqGSIb3DQEJBDEiBCAO83PNkHkO
// SIG // JZs0pGloyUBrRiHs5Uye7Jnw8B5lT3oFCjBCBgorBgEE
// SIG // AYI3AgEMMTQwMqAUgBIATQBpAGMAcgBvAHMAbwBmAHSh
// SIG // GoAYaHR0cDovL3d3dy5taWNyb3NvZnQuY29tMA0GCSqG
// SIG // SIb3DQEBAQUABIIBAEjMnQ0Ksl2pd3+VVadGSjwcEsLR
// SIG // xNI6e8QEV78qQkc3vnOaCLwNUf45kWh8TWM/O90I3SwO
// SIG // autxtoKVYbFlCLPEqNxtl9W+oOlWEm5vXG7lDzoOpUZT
// SIG // Sp7L++CXqFb1GiKlfw2hIKlWw9Y5nBuwjVQWpxHDGTPz
// SIG // FSZrGlZBzNZBJ9iutUDI2W93aYvHKFUN6u8BGCG0Bxhk
// SIG // s4S7gqJU/JXo5rg1IXll0YslT0FfCYyTaPcmsarSZhKj
// SIG // fPvsSl17mLtXdnCv+1nUtX/f3h7DpbGQAFL+g5EcOBHA
// SIG // p3SmNnxNE83XkC2YPOGbs0+SappXdA3E/sku7VCi7Kqk
// SIG // FuVvKNChghewMIIXrAYKKwYBBAGCNwMDATGCF5wwgheY
// SIG // BgkqhkiG9w0BBwKggheJMIIXhQIBAzEPMA0GCWCGSAFl
// SIG // AwQCAQUAMIIBWgYLKoZIhvcNAQkQAQSgggFJBIIBRTCC
// SIG // AUECAQEGCisGAQQBhFkKAwEwMTANBglghkgBZQMEAgEF
// SIG // AAQgyOFXlH/QcfWW3GKDquPRLMGrmk++Xd28OJvR1Ka7
// SIG // Ix0CBmqINbjUkBgTMjAyNjA4MjQwNTIyMTQuODM1WjAE
// SIG // gAIB9KCB2aSB1jCB0zELMAkGA1UEBhMCVVMxEzARBgNV
// SIG // BAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQx
// SIG // HjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEt
// SIG // MCsGA1UECxMkTWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0
// SIG // aW9ucyBMaW1pdGVkMScwJQYDVQQLEx5uU2hpZWxkIFRT
// SIG // UyBFU046NkIwNS0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1p
// SIG // Y3Jvc29mdCBUaW1lLVN0YW1wIFNlcnZpY2WgghH+MIIH
// SIG // KDCCBRCgAwIBAgITMwAAAhFFGDmbQ8/8bAABAAACETAN
// SIG // BgkqhkiG9w0BAQsFADB8MQswCQYDVQQGEwJVUzETMBEG
// SIG // A1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9u
// SIG // ZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MSYwJAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQ
// SIG // Q0EgMjAxMDAeFw0yNTA4MTQxODQ4MTNaFw0yNjExMTMx
// SIG // ODQ4MTNaMIHTMQswCQYDVQQGEwJVUzETMBEGA1UECBMK
// SIG // V2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwG
// SIG // A1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMS0wKwYD
// SIG // VQQLEyRNaWNyb3NvZnQgSXJlbGFuZCBPcGVyYXRpb25z
// SIG // IExpbWl0ZWQxJzAlBgNVBAsTHm5TaGllbGQgVFNTIEVT
// SIG // Tjo2QjA1LTA1RTAtRDk0NzElMCMGA1UEAxMcTWljcm9z
// SIG // b2Z0IFRpbWUtU3RhbXAgU2VydmljZTCCAiIwDQYJKoZI
// SIG // hvcNAQEBBQADggIPADCCAgoCggIBAM+5uzMQHS+VWsq5
// SIG // O47DKNxp4TfOZLRwmRLxHI+ASHHBynfzSgu7j76V+XYT
// SIG // ut1ulTOYgsZJRvKkHlVaz2ir4/HWGCQuwzbeDTd15VXQ
// SIG // v76L3ibjz4Uyf7u1/qWJldqnoU1Tzjgdf4aZredUs4MW
// SIG // XMzHZxZfl9ntT4LrUgOQgIff18+TVtAsZ2Fc/INFacYP
// SIG // gat9mppLUV6/JtwUhIFLPI4FkT1czxxHM6W4ZaBhhHx2
// SIG // kTph4VSiKjfiYTMHhI1NjVzNluoZt9o/0B/yPylqjTX2
// SIG // HIR2htMSZY1U2KFCj6XEA7oR/XUChILxsY9lOf9xatXp
// SIG // uHTuiIdOJukfrbca+mPKESR/WYWd7HIhQSL2YexNmBVz
// SIG // oz+DBsm0spUEzwxBQLRx4KZLJHhFIbDw0fVb1loXpIUM
// SIG // d6l2gCofgJC5s/4aRN3tMvkSCjtgERI1CyQCoH/kfUJz
// SIG // b6jHjJM/Txq47Io6lhswdpNiTcmlGCpW5kMHjmm7AoqI
// SIG // mNnyW4po1chQBpOQHmHXVBcbyRoEVQh+wXgTygKuzDDp
// SIG // kgkzjGdEsOs8jceFIYeWNLidGTqEypwdyn3Tf22v3ihx
// SIG // XhIYt1qgH808YstKzL4bH7F2Su86HJamkb1ZfEOPCde+
// SIG // Pnsq4sqWPR4VPqIYImIuLkBgw1XUw3ig7aAv4Q9gp/gE
// SIG // c8BNaxXxAgMBAAGjggFJMIIBRTAdBgNVHQ4EFgQUYn1F
// SIG // A8Dp6iHL32+d/sldBGZ+znAwHwYDVR0jBBgwFoAUn6cV
// SIG // XQBeYl2D9OXSZacbUzUZ6XIwXwYDVR0fBFgwVjBUoFKg
// SIG // UIZOaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9w
// SIG // cy9jcmwvTWljcm9zb2Z0JTIwVGltZS1TdGFtcCUyMFBD
// SIG // QSUyMDIwMTAoMSkuY3JsMGwGCCsGAQUFBwEBBGAwXjBc
// SIG // BggrBgEFBQcwAoZQaHR0cDovL3d3dy5taWNyb3NvZnQu
// SIG // Y29tL3BraW9wcy9jZXJ0cy9NaWNyb3NvZnQlMjBUaW1l
// SIG // LVN0YW1wJTIwUENBJTIwMjAxMCgxKS5jcnQwDAYDVR0T
// SIG // AQH/BAIwADAWBgNVHSUBAf8EDDAKBggrBgEFBQcDCDAO
// SIG // BgNVHQ8BAf8EBAMCB4AwDQYJKoZIhvcNAQELBQADggIB
// SIG // AKRCnZzHiCFIlOj2rWf6m68Ig82FDCkXMwuAaf12NUvT
// SIG // ZhyPtnN3XKcB9kjpg33byCKre5ka4LwT2DryfQrWUuXn
// SIG // iK7DmwtG9IICk79sK04FhvqpLajRRIUHoqXVETSzevLh
// SIG // wJuXncAcrXdZMMua+gfd5JcQ7JXTplVrcP54I+5JzdPZ
// SIG // rgpsK9eyZ7DBXKCDfx+fbPtUWDe1YnePu54/BXL2Mva2
// SIG // 2TjJ3Qc7E4qLBdTPmjCCV9pNxFRVbLgy+/0eaaSPU4O3
// SIG // lkDlijGRz3bAN2alsw7oSak86BUkEoZ2Xpwvsav8/QYR
// SIG // zxRW1LX4wKBuhAz40kCWF5qII2vDhGtfccJ4d8Fbn3j/
// SIG // nJPv9IMTYu4PpDulmjptOdheLIg/MYulL++S++/fJR7z
// SIG // 04XMRx7IF6jGOfdndcFKH97S/3g2kNFIZ2AlPMhpFNly
// SIG // Z3LTjZwSgL1EQL39qoiFg4+C6XJtMwO1bqH7iUdU6bsn
// SIG // OadY2udmzWQQVagDsMg4QJqlrCVwI2F57LAv3yZHnt9e
// SIG // BYfhiMjILwD0UnIKkWaldenUwWL6HvsNZ/8FrP8kk1LM
// SIG // Q8OE/wCE3LuTwLC5wlaQKw6xS0Uxcrrfnh1KBulGGX4/
// SIG // P0bLkONiDbHtaW/3D5uxtpXCybZCCk/NMbwdS4mjbz0w
// SIG // VRHJjUrxVDNMa12V3GHMVV4mMIIHcTCCBVmgAwIBAgIT
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
// SIG // BmoQtB1VM1izoXBm8qGCA1kwggJBAgEBMIIBAaGB2aSB
// SIG // 1jCB0zELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hp
// SIG // bmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoT
// SIG // FU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEtMCsGA1UECxMk
// SIG // TWljcm9zb2Z0IElyZWxhbmQgT3BlcmF0aW9ucyBMaW1p
// SIG // dGVkMScwJQYDVQQLEx5uU2hpZWxkIFRTUyBFU046NkIw
// SIG // NS0wNUUwLUQ5NDcxJTAjBgNVBAMTHE1pY3Jvc29mdCBU
// SIG // aW1lLVN0YW1wIFNlcnZpY2WiIwoBATAHBgUrDgMCGgMV
// SIG // ACsqfKtlXYAKtVRpM3ez2cFeszXNoIGDMIGApH4wfDEL
// SIG // MAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24x
// SIG // EDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jv
// SIG // c29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UEAxMdTWljcm9z
// SIG // b2Z0IFRpbWUtU3RhbXAgUENBIDIwMTAwDQYJKoZIhvcN
// SIG // AQELBQACBQDuNf/JMCIYDzIwMjYwODIzMjMyNDU3WhgP
// SIG // MjAyNjA4MjQyMzI0NTdaMHcwPQYKKwYBBAGEWQoEATEv
// SIG // MC0wCgIFAO41/8kCAQAwCgIBAAICMyECAf8wBwIBAAIC
// SIG // EokwCgIFAO43UUkCAQAwNgYKKwYBBAGEWQoEAjEoMCYw
// SIG // DAYKKwYBBAGEWQoDAqAKMAgCAQACAwehIKEKMAgCAQAC
// SIG // AwGGoDANBgkqhkiG9w0BAQsFAAOCAQEAd5KlN3qqQD3y
// SIG // K1lQZ5Axm1xzHpcvSHpk13NTmqXbJcOJQggMvyzxke3c
// SIG // 4Ntu1vCKFkx0nvzPWqls0xL2fsg4WUtQFOPFQhIPicIR
// SIG // nPwWMMby2i9RgQy6nKrvuAdSShPZsTdK5g82mgPBAr91
// SIG // ZEwdyTXeVUMxJ2YFlwVOQ4YYNEEtXtlOTpJYr54dZyg7
// SIG // S4OSt2ZH5juq+LHQe0CCMOQ86WiYQ2THxmaUgMUW1IC8
// SIG // Q6PqpXTOyzAN4ib4ktV4mlXI4hZDHCpX2oPrZkM0VyDO
// SIG // PgAWCiarS9qcSf/HyNieuVKPbL9Mttvw7thjI/yX5593
// SIG // JPayJleeTNbEkglP8ZRqbzGCBA0wggQJAgEBMIGTMHwx
// SIG // CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
// SIG // MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jv
// SIG // c29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwAhMzAAACEUUY
// SIG // OZtDz/xsAAEAAAIRMA0GCWCGSAFlAwQCAQUAoIIBSjAa
// SIG // BgkqhkiG9w0BCQMxDQYLKoZIhvcNAQkQAQQwLwYJKoZI
// SIG // hvcNAQkEMSIEIDjtkaYcNrdp6pWOlplPDA66MACvzwdD
// SIG // IqVeiht9Fbe7MIH6BgsqhkiG9w0BCRACLzGB6jCB5zCB
// SIG // 5DCBvQQgLK0zqZrvh06tWlxcL5YYxfKdp1AjTQhF/zli
// SIG // xzQzJrcwgZgwgYCkfjB8MQswCQYDVQQGEwJVUzETMBEG
// SIG // A1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9u
// SIG // ZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MSYwJAYDVQQDEx1NaWNyb3NvZnQgVGltZS1TdGFtcCBQ
// SIG // Q0EgMjAxMAITMwAAAhFFGDmbQ8/8bAABAAACETAiBCCj
// SIG // N1zvhBZ3NwBr6R6wGLbeAjFHpEvGExwF0QLCS6DG2TAN
// SIG // BgkqhkiG9w0BAQsFAASCAgBErae4HrhjSfpUelgZNdXj
// SIG // V2a5452YF/nmh+o9cWc0TBpKcrxW/1ovihMoCAuu1r07
// SIG // CIwZGmOfOunuMhgIMsw8wnie45EoQ3hqLFTRuY/0tMUL
// SIG // +KkNvnkuQ3NNNixeS6OwZNTHYEg0aUCy2N8okX2S2rEv
// SIG // HrS1yJoH4QrQslevBdknIEQULoAwCmStfct+2tCXcEcy
// SIG // /qxPhSRRsM0q5q8XZFe6TMfwbUjJNcTRO3XQo8wv/g3z
// SIG // /+bazqA8yPuazKIeefkf7B4cKG3j8akzp0ZvO33DUE86
// SIG // u8kP1j0Q1Q+7fvefdO2gGb/JI4xc1Yz2Nj0csFHTxCMk
// SIG // KqGSA9O1n+MYSutKWh0CwHvHIaFFcW9pjphciUNzwwgX
// SIG // aiNA93yB665fr9Mn6w6aITnoRWYFd6l2lSNYz6Vm9ziD
// SIG // dn5NB2MLD8vB43bwBxfVw0tU7FmY3fEVaB8azkPXZ5yO
// SIG // wt9W4tpqhX6oTf9ck/j6GRwCXwgi51a9udm3AE36rFVt
// SIG // Me0ezNNH585pvRJkINuwPtDtt1ygX7wXSZ8lDBFnHNQA
// SIG // 1+QifK8sm1eRW2vQh7j3U3XF5G/xZjUv5s13HvQlXtwF
// SIG // 4hCBYwjTI1pLVpy1P7Eyj9IEvraP2QJ5kITltiggSZcb
// SIG // kiyRS5rQV8QxIbUYjhWVatfO721cy4RcAu1NhSK05fRyzA==
// SIG // End signature block
