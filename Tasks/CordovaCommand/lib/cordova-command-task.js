/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/

var path = require('path'),
    taskLibrary = require('./vso-task-lib-proxy.js'),
    buildUtilities = require('taco-team-build');


var buildSourceDirectory = taskLibrary.getVariable('build.sourceDirectory') || taskLibrary.getVariable('build.sourcesDirectory');
//Process working directory
var workingDirectory = taskLibrary.getInput('cwd', /*required*/ false) || buildSourceDirectory;
taskLibrary.cd(workingDirectory);

callCordova().fail(function (err) {
    console.error(err.message);
    taskLibrary.debug('taskRunner fail');
    taskLibrary.exit(1);
});

// Main Cordova command exec
function callCordova() {
    var cordovaConfig = {
        nodePackageName: 'cordova',
        projectPath: workingDirectory
    };

    var version = taskLibrary.getInput('cordovaVersion', /*required*/ false);
    if (version) {
        cordovaConfig.moduleVersion = version;
    }

    return buildUtilities.cacheModule(cordovaConfig).then(function (cordovaModule) {
        taskLibrary.debug('Cordova Module Path: ' + cordovaModule.path);

        var cordovaExecutable = process.platform == 'win32' ? 'cordova.cmd' : 'cordova';
        var cordovaCmd = path.resolve(cordovaModule.path, '..', '.bin', cordovaExecutable);
        var commandRunner = new taskLibrary.ToolRunner(cordovaCmd);


        var rawCmd = taskLibrary.getInput('cordovaCommand', /* required */ true);
        commandRunner.arg(rawCmd);
        
        var rawArgs = taskLibrary.getInput('cordovaArgs', /* required */ false);
        if (rawArgs) {
            commandRunner.arg(rawArgs);
        }

        return commandRunner.exec();
    });
}

