# Vendored auth packages

Source: [snort-auth-js](https://github.com/Siddhartha-Sharma/snort-auth-js/tree/be425f066fcf93cdaa086bfa3901616f94c53e64)

First implementor: **aurelia-commerce-ui**. Package versions, SHA-256 and npm integrity values are recorded in `auth-provenance.json`. All archives match the installed lockfile.

These are private local packages, not npm-registry dependencies. Commit the active tarballs and package-lock.json. Run `npm ci` in this repository; no sibling repository is needed at build/runtime.

To update: review the source commit, run the module's pack scripts, copy the selected archives here, install them and regenerate/review provenance. Upgrade matching client/React peers together. Never put project secrets or database backups in vendor.
