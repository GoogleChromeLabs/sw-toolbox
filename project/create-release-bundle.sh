#!/bin/bash
set -e

#########################################################################
#
# GUIDE TO USE OF THIS SCRIPT
#
#########################################################################
#
# - This script is used by npm run bundle in this probject and serves
#   solely as an example
#
#########################################################################

if [ "$BASH_VERSION" = '' ]; then
 echo "    Please run this script via this command: './<Script Location>/<Script Name>.sh'"
 exit 1;
fi

if [ -z "$1" ]; then
  echo "    Bad input: Expected a directory as the first argument for the path to put the final bundle files into (i.e. ./tagged-release)";
  exit 1;
fi

# Copy over files that we want in the release
cp -r ./docs $1
cp -r ./lib $1
cp -r ./build $1
cp LICENSE $1
cp package.json $1
cp bower.json $1
cp README.md $1
