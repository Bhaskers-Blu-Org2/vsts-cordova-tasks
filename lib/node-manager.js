
/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/

// TODO:
//  - Install and use correct default npm version on Windows for realzies - Right now just does latest node 2 for < 5.0.0 and 3 otherwise
//  - Download w/o curl on Windows

var Q = require("q"),
    path = require("path"),
    fs = require("fs"),
    semver = require("semver"),
    shelljs = require("shelljs"),
    exec = Q.nfbind(require("child_process").exec),
    spawn = require("child_process").spawnSync;

var NODE_VERSION_CACHE = process.env["NODE_VERSION_CACHE"] || process.platform == "win32" ? path.join(process.env["APPDATA"], "node-version-cache") : path.join(process.env["HOME"], ".node-version-cache")
var nodePath;

function setupMinNode(minVersion, targetVersion, /*optional*/ installNpmOnWindows) {
    var nodeCli = shelljs.which("node");
    return exec("\"" + nodeCli + "\" --version")
        .then(function (version) {
        version = removeExecOutputNoise(version);
        if (semver.lt(version, minVersion)) {
            console.log("Node < " + minVersion + ", downloading node " + targetVersion);
            return setupNode(targetVersion, installNpmOnWindows);
        } else {
            console.log("Found node " + version);
            nodePath = path.dirname(nodeCli);
        }
    });
}

function setupMaxNode(maxVersion, targetVersion, /*optional*/ installNpmOnWindows) {
    var nodeCli = shelljs.which("node");
    return exec("\"" + nodeCli + "\" --version")
        .then(function (version) {
        version = removeExecOutputNoise(version);
        if (semver.gt(version, maxVersion)) {
            console.log("Node > " + maxVersion + ", downloading node " + targetVersion);
            return setupNode(targetVersion, installNpmOnWindows);
        } else {
            console.log("Found node " + version);
            nodePath = path.dirname(nodeCli);
        }
    });
}

function useSystemNode() {
    // shelljs which returns some strange object which is treated as an object and not a string in this case. the + "" is to force the cast to string, in which case this works correctly.
    nodePath = path.dirname(shelljs.which("node") + "");
    return Q();
}

function setupNode(targetVersion, /*optional*/ installNpmOnWindows) {
    if (!fs.existsSync(NODE_VERSION_CACHE)) {
        shelljs.mkdir("-p", NODE_VERSION_CACHE);
    }

    var curlPath = shelljs.which("curl");
    if (!curlPath) {
        console.error("curl was not found in PATH. curl needs to be in the path on Windows. You can get curl by installing the Git Command Line Tools (www.git-scm.com/downloads)");
        process.exit(1);
        return null;
    }

    if (process.platform == "win32") {
        var promise = Q();
        nodePath = path.join(NODE_VERSION_CACHE, "node-win-x86-" + targetVersion);
        process.env.PATH = nodePath + path.delimiter + process.env.PATH;
        process.env.PATH = path.join(nodePath, "node_modules", ".bin") + path.delimiter + process.env.PATH;  // If npm happens to be installed - does no harm if not
        // Download node version if not found     
        if (!fs.existsSync(nodePath)) {
            shelljs.mkdir("-p", nodePath);
            var curlCmdArgs = ["-o", path.join(nodePath, "node.exe"), "https://nodejs.org/dist/v" + targetVersion + "/win-x86/node.exe"];
            promise = promise.then(function () {
                var spawnCurlResult = spawn(curlPath, curlCmdArgs, { stdio: "inherit" });
                if (spawnCurlResult.status > 0) {
                    console.error("failed command: " + curlPath);
                    process.exit(spawnCurlResult.status);;
                }
            })
        }

        // TODO: If "installNpmOnWindows" set, download correct npm version and add node_modules/.bin into path. 
        //       There does not appear to be a great way to do this w/o the Windows MSI
        //       Right now it simply grabs the latest npm 2.x.x when Node target is < 5.0.0 and npm 3.x.x when 5.0.0 or up.
        //       Uses whatever npm version is found to install npm locally.        
        if (typeof (installNpmOnWindows) === "undefined") {
            installNpmOnWindows = true;
        }
        if (installNpmOnWindows && !fs.existsSync(path.join(nodePath, "node_modules", "npm"))) {
            // Use cmd to temporarly switch to cache drive letter and path and do npm install npm
            var shellCmd = shelljs.which("cmd");
            var npmVersion = semver.lt(targetVersion, "5.0.0") ? "^2.11.3" : "^3.5.2";
            var shellCmdArgs = ["/c cd " + nodePath.substr(0, 2) + " && cd \"" + nodePath + "\" && npm install --force npm@" + npmVersion];
            promise = promise.then(function () {
                execSync([shellCmd].concat(shellCmdArgs).join(" "), { stdio: "inherit" });
            })
            .fail(function (err) {
                console.error("failed command:");
                console.log(err);
                process.exit(1);;
            });
        }
        return promise;
    } else {
        var folderName = process.platform == "darwin" ? ("node-v" + targetVersion + "-darwin-x64") : ("node-v" + targetVersion + "-linux-x86");
        console.log("Node target: " + folderName)
        nodePath = path.join(NODE_VERSION_CACHE, folderName, "bin");
        process.env.PATH = nodePath + path.delimiter + process.env.PATH;
        // Download node version if not found - npm also grabbed, installed, and used     
        if (!fs.existsSync(nodePath)) {
            return Q().then(function () {
                var gzPath = path.join(NODE_VERSION_CACHE, folderName + ".tar.gz");
                console.log("Downloading " + gzPath);
                var curlArgs = ["-o", gzPath, "http://nodejs.org/dist/v" + targetVersion + "/" + folderName + ".tar.gz"];
                var spawnResult = spawn(curlPath, curlArgs, { stdio: "inherit" });
                if (spawnResult.status > 0) {
                    console.error("failed command: " + curlPath);
                    process.exit(spawnResult.status);;
                }
            }).then(function () {
                var gzPath = path.join(NODE_VERSION_CACHE, folderName + ".tar.gz");
                console.log("Extracting " + gzPath);
                var shellBash = shelljs.which("bash");
                var args = ["-c", "cd " + NODE_VERSION_CACHE.replace(" ", "\\ ") + "; gunzip -c " + folderName + ".tar.gz | tar xopf -"];
                var spawnResult = spawn(shellBash, args, { stdio: "inherit" });
                if (spawnResult.status > 0) {
                    console.error("failed command: " + shellBash);
                    process.exit(spawnResult.status);;
                }

                return Q();
            });
        } else {
            return Q();
        }
    }
}

function removeExecOutputNoise(input) {
    var output = input + "";
    return output.trim().replace(/[",\n\r\f\v]/gm, "");
}

module.exports = {
    setupNode: setupNode,
    setupMaxNode: setupMaxNode,
    setupMinNode: setupMinNode,
    useSystemNode: useSystemNode,
    getNodePath: function () {
        return nodePath;
    }
}