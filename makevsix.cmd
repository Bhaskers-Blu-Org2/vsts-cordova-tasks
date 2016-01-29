@ECHO OFF
REM
REM  Copyright (c) Microsoft. All rights reserved.  
REM  Licensed under the MIT license. See LICENSE file in the project root for full license information.
REM

CALL npm --version > NUL
IF NOT %ERRORLEVEL%==0 GOTO FAILED

CALL vset --version > NUL
IF NOT %ERRORLEVEL%==0 GOTO VSETINSTALL

:NPMINSTALL
ECHO Installing Dependencies...
CALL npm install --only=prod
IF NOT %ERRORLEVEL%==0 GOTO INSTALLFAILED
CALL node bin/tfxupload.js --installonly
IF NOT %ERRORLEVEL%==0 GOTO INSTALLFAILED

:CREATEVSIX
ECHO Creating vsix...
CALL vset package -m mobiledevopscordovaextension.json
IF NOT %ERRORLEVEL%==0 GOTO FAILED

EXIT /B 0

:VSETINSTALL
ECHO Installing vset...
CALL npm install -g vset
IF %ERRORLEVEL%==0 GOTO CREATEVSIX

:INSTALLFAILED
ECHO Failed to install npm packages. Ensure Node.js is installed and node and npm are in your path.
EXIT /B %ERRORLEVEL%

:FAILED
ECHO Vsix creation failed
EXIT /B 1