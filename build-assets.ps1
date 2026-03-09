$ErrorActionPreference = "Stop"

Write-Host "Installing minification tooling..."
npm install --save-dev terser clean-css-cli

Write-Host "Building app.min.js..."
npx terser app.js -c -m -o app.min.js

Write-Host "Building styles.min.css..."
npx cleancss -o styles.min.css styles.css

Write-Host "Minified assets created: app.min.js, styles.min.css"
