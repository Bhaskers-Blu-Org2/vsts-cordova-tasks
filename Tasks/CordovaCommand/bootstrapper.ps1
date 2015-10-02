#
#  Copyright (c) Microsoft. All rights reserved.  
#  Licensed under the MIT license. See LICENSE file in the project root for full license information.
#

param (
    [string]$cordovaCommand,
    [string]$cordovaArgs,
    [string]$cordovaVersion,
    [string]$cwd
) 

import-module "Microsoft.TeamFoundation.DistributedTask.Task.Internal"
import-module "Microsoft.TeamFoundation.DistributedTask.Task.Common"
 
$debug=Get-TaskVariable -Context $distributedTaskContext -Name "System.Debug"
 
# Set env vars as expected by node script
$Env:INPUT_CORDOVACOMMAND = $cordovaCommand
$Env:INPUT_CORDOVAARGS = $cordovaArgs
$Env:INPUT_CORDOVAVERSION = $cordovaVersion
$Env:INPUT_CWD = $cwd
$Env:SYSTEM_DEBUG = $debug

# Node has an annoying habit of outputting warnings to standard error, so redirect stderr to stdout and call script
$node = Get-Command -Name node -ErrorAction Ignore
if(!$node)
{
    throw (Get-LocalizedString -Key "Unable to locate {0}" -ArgumentList 'node')
}

#cordova Script is in same spot as this powershell script
$scriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Invoke-Tool -Path $node.Path -Arguments "cordova-command-task.js ##vso-task-powershell" -WorkingFolder $scriptRoot -WarningPattern "(^npm |^Note: |^Build option --|^WARN: )" 