#!/bin/bash
echo ""
echo "Copyright (c) Microsoft. All rights reserved."
echo "Licensed under the MIT license. See LICENSE file in the project root for full license information."
echo ""

if ! npm --version > /dev/null ; then
    echo "npm not found. please install npm and run again."
    return 1;
fi

if ! tfx --version > /dev/null ; then
    echo "tfx-cli not found. installing..."
    npm install -g tfx-cli
fi

echo "Installing Dependencies..."
npm install --only=prod
node bin/tfxupload.js --installonly

echo "Creating VSIX..."
tfx extension create --manifest-globs mobiledevopscordovaextension.json
