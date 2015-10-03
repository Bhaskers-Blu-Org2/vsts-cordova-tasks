/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Module dependencies
var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    glob = require("glob"),
    semver = require("semver"),
    exec = Q.nfbind(require('child_process').exec);

// Constants
var DEFAULT_CORDOVA_VERSION = "5.3.3",
    // Support plugin adds in two VS features and a set of bug fixes. Plugin needs to be local due to a bug in Cordova 5.1.1 when fetching from Git.
    SUPPORT_PLUGIN = path.join(__dirname,"cordova-plugin-vs-taco-support"),
    SUPPORT_PLUGIN_ID = "cordova-plugin-vs-taco-support",
    // cordova-lib is technically what we want to given that is what cordova gives us when you "requre"
    // the node the "cordova" node module. However, the "cordova" and "cordova-lib" package version 
    // numbers do not match in CLI < v3.7.0. Ex: 3.6.3-0.2.13 does not match cordova-lib's version. 
    CORDOVA = "cordova";


// Global vars
var cordovaCache = process.env["CORDOVA_CACHE"] || (process.platform === "darwin" || process.platform === "linux" ? path.join(process.env["HOME"],".cordova-cache") : path.join(process.env["APPDATA"], "cordova-cache")),
    defaultCordovaVersion = process.env["CORDOVA_DEFAULT_VERSION"] || DEFAULT_CORDOVA_VERSION,
    config = {
        projectPath: process.cwd(),
        addSupportPlugin: true,
        loadCordovaModule: true,
        cordovaPackageName: CORDOVA,
        cordovaVersion: undefined        
    },
    loadedCordovaVersion,
    cdv;

// Method to set options
function configure(obj) {
    if (obj.cordovaCache !== undefined) config.cordovaCache = obj.cordovaCache;
    if (obj.cordovaVersion !== undefined) config.cordovaVersion = obj.cordovaVersion;
    if (obj.projectPath !== undefined) config.projectPath = path.resolve(obj.projectPath);
    if (obj.loadCordovaModule !== undefined) config.loadCordovaModule = obj.loadCordovaModule;
    if (obj.addSupportPlugin !== undefined) config.addSupportPlugin = obj.addSupportPlugin;
    if (obj.cordovaPackageName !== undefined) config.cordovaPackageName = obj.cordovaPackageName;
    if(!fs.existsSync(config.projectPath)) {
        throw "Specified project path does not exist: \"" + config.projectPath + "\""
    }
}

// Gets and/or downloads the appropriate cordova node module for use based on options or taco.json
// Also installs support plugin if not already in the project
function setupCordova(obj) {
    if (obj !== undefined) {
        configure(obj);
    }

    // Check if Cordova already loaded
    if (cdv && config.cordovaVersion === loadedCordovaVersion) {
        return Q(cdv);
    }

    return cacheModule(config).then(function(result) {
        config.cordovaVersion = result.version;
        return getCordova(result.version, result.path, config.projectPath);
    });
}

// Install module method
function cacheModule(obj) {
    
    var prjPath = obj.projectPath || process.cwd();
    var pkgName = obj.cordovaPackageName || CORDOVA;
    var version;
    
    // Check if the specified version of Cordova is available in a local cache and install it if not 
    // Uses "CORDOVA_CACHE" environment variable or defaults of %APPDATA%\cordova-cache on windows and ~/.cordova-cache on OSX
    if (!fs.existsSync(cordovaCache)) {
        fs.mkdirSync(cordovaCache);
        console.log("Creating " + cordovaCache);
    }
    console.log("Module cache found at " + cordovaCache);

    // If no version is set, try to get the version from taco.json
    if (obj.cordovaVersion === undefined && pkgName == CORDOVA) {
        if (fs.existsSync(path.join(prjPath, "taco.json"))) {
            version = require(path.join(prjPath, "taco.json"))["cordova-cli"];
            console.log("Cordova version set to " + version + " based on the contents of taco.json");
        } else {
            version = defaultCordovaVersion;
            console.log("taco.json not found. Using default Cordova version of " + version);
        }
    } else {
        version = obj.cordovaVersion;
    }

    // Install correct cordova version if not available
    var versionPath = path.join(cordovaCache, version);
    var targetModulePath = path.join(versionPath, "node_modules", pkgName)
    var pkgStr = pkgName + "@" + version;
    if (!fs.existsSync(targetModulePath)) {  // Fix: Check module is there not just root path
        if(!fs.existsSync(versionPath)) {
            fs.mkdirSync(versionPath);
            fs.mkdirSync(path.join(versionPath, "node_modules")); // node_modules being present ensures correct install loc
        }
        console.log("Installing " + pkgStr + ". (This may take a few minutes.)");
        var cmd = "npm install " + pkgStr
        return exec(cmd, { cwd: versionPath })
            .then(handleExecReturn)
            .then(function() {
                return {
                    version: version,
                    path: targetModulePath
                }
            });
    } else {
        console.log(pkgStr + " already installed.");
        return Q({
            version: version,
            path: targetModulePath
        });
    }
    
}

// Main build method
function buildProject(cordovaPlatforms, args) {
    if (typeof (cordovaPlatforms) == "string") {
        cordovaPlatforms = [cordovaPlatforms];
    }

    return setupCordova().then(function (cordova) {
        // Add platforms if not done already
        var promise = addPlatformsToProject(config, cordova, cordovaPlatforms);
        //Build each platform with args in args object
        cordovaPlatforms.forEach(function (platform) {
            promise = promise.then(function () {
                // Build app with platform specific args if specified
                var callArgs = getCallArgs(platform, args);
                console.log("Queueing build for platform " + platform + " w/options: " + callArgs.options || "none");
                return cordova.raw.build(callArgs);
            });
        });
        return promise;
    });
}

// Prep for build by adding platforms and setting environment variables
function addPlatformsToProject(obj, cordova, cordovaPlatforms) {
    var promise = Q();
    cordovaPlatforms.forEach(function (platform) {
        console.log(path.join(obj.projectPath, "platforms", platform));
        if (!fs.existsSync(path.join(obj.projectPath, "platforms", platform))) {
            promise = promise.then(function () { return cordova.raw.platform('add', platform); });
        } else {
            console.log("Platform " + platform + " found.");
        }
    });
    return promise;
}

// Package project method - Just for iOS currently
function packageProject(cordovaPlatforms, args) {
    if (typeof (cordovaPlatforms) == "string") {
        cordovaPlatforms = [cordovaPlatforms];
    }

    return setupCordova().then(function (cordova) {
        var promise = Q(cordova);
        cordovaPlatforms.forEach(function (platform) {
            if (platform == "ios") {
                promise = promise.then(function() { return createIpa(args); });
            } else {
                console.log("Platform " + platform + " does not require a separate package step.");
            }
        });
        return promise;
    });
}

// Find the .app folder and use exec to call xcrun with the appropriate set of args
function createIpa(cordova, args) {
    
    return getInstalledPlatformVersion(config.projectPath, "ios").then(function(version) {        
        if(semver.lt(version, "3.9.0")) {
            var deferred = Q.defer();
            glob(config.projectPath + "/platforms/ios/build/device/*.app", function (err, matches) {
                if (err) {
                    deferred.reject(err);
                } else {
                    if (matches.length != 1) {
                        console.warn( "Skipping packaging. Expected one device .app - found " + matches.length);
                    } else {
                        var cmdString = "xcrun -sdk iphoneos PackageApplication \"" + matches[0] + "\" -o \"" +
                            path.join(path.dirname(matches[0]), path.basename(matches[0], ".app")) + ".ipa\" ";
                        
                        // Add additional command line args passed 
                        var callArgs = getCallArgs("ios", args);
                        callArgs.options.forEach(function (arg) {
                            cmdString += " " + arg;
                        });
        
                        console.log("Exec: " + cmdString);
                        return exec(cmdString)
                            .then(handleExecReturn)
                            .fail(function(err) {
                                deferred.reject(err);
                            })
                            .done(function() {
                                deferred.resolve();
                            });
                    }
                }
            });
            return deferred.promise;
        } else {
            console.log("Skipping packaging. Detected cordova-ios verison that auto-creates ipa.");
        }
    });
}

// Utility method that "requires" the correct version of cordova-lib, adds in the support plugin if not present, sets CORDOVA_HOME 
function getCordova(cordovaVersion, modulePath, projectPath) {
    // Setup environment
    if (cdv === undefined || loadedCordovaVersion != cordovaVersion) {
        loadedCordovaVersion = cordovaVersion;
        process.chdir(projectPath);
        process.env["CORDOVA_HOME"] = path.join(cordovaCache,"_cordova"); // Set platforms to cache in cache locaiton to avoid unexpected results
        process.env["PLUGMAN_HOME"] = path.join(cordovaCache,"_plugman"); // Set plugin cache in cache locaiton to avoid unexpected results
        // Install VS support plugin if not already present
        if(config.addSupportPlugin && !fs.existsSync(path.join(projectPath, "plugins", SUPPORT_PLUGIN_ID))) {
            cdv = require(modulePath);
            if(cdv.cordova) {
                cdv = cdv.cordova;
            }
            console.log("Adding support plugin.");
            return cdv.raw.plugin("add", SUPPORT_PLUGIN).then(function() { return cdv; });
        } else {
            // If loadCordovaModule = false, we're just installing and adding the plugin if required, so don't load module
            if(config.loadCordovaModule) {
                cdv = require(modulePath);
                if(cdv.cordova) {
                    cdv = cdv.cordova;
                }                
            }
            return Q(cdv);
        }
    } else {    
        return Q(cdv);
    }
}

// Utility method that coverts args into a consistant input understood by cordova-lib
function getCallArgs(platforms, args) {
    // Processes single platform string (or array of length 1) and an array of args or an object of args per platform
    args = args || [];
    if (typeof (platforms) == "string") {
        platforms = [platforms];
    }
    // If only one platform is specified, check if the args is an object and use the args for this platform if so
    if (platforms.length == 1) {
        if (args instanceof Array) {
            return { platforms: platforms, options: args };
        } else {
            return { platforms: platforms, options: args[platforms[0]] };
        }
    }
}


// Returns a promise that contains the installed platform version (vs the CLI version). Works in both new and old versions of the Cordova. (No cordova-lib API exists.)
function getInstalledPlatformVersion(projectPath, platform) {
    var platformJsonPath = path.join(projectPath, 'platforms', 'platforms.json')
    if(fs.existsSync(platformJsonPath)) {
        var platformsJson = require(path.join(projectPath, 'platforms', 'platforms.json'));
        return Q(platformsJson[platform]);
    }  else {
        return exec(path.join(projectPath, 'platforms', platform, 'cordova', 'version')).then(function(result) {
           return result[0].replace(/\r?\n|\r/g, ''); 
        });
    }
}

// Utility method to handle the return of exec calls - namely to send output to stdout / stderr
function handleExecReturn(result) {
    console.log("Exec complete.");
    console.log(result[0]);
    if (result[1] && result[1] !== "") {
        console.error(result[1]);
    }
}

// Public methods
module.exports = {
    configure: configure,
    setupCordova: setupCordova,
    buildProject: buildProject,
    packageProject: packageProject,
    getInstalledPlatformVersion: getInstalledPlatformVersion,
    cacheModule: cacheModule
};
