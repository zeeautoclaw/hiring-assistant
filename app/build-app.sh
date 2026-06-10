#!/bin/bash
# Compile Screening.swift and assemble a double-clickable .app bundle.
set -euo pipefail
cd "$(dirname "$0")/.."

ARCH=$(uname -m)
APP="Hiring Assistant.app"
BIN="$APP/Contents/MacOS/HiringAssistant"

echo "Compiling ($ARCH, macOS 13)…"
rm -rf "$APP" ScreeningAgent.app
mkdir -p "$APP/Contents/MacOS"
swiftc -O -parse-as-library -target "${ARCH}-apple-macos13.0" -o "$BIN" app/Screening.swift

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Hiring Assistant</string>
  <key>CFBundleDisplayName</key><string>Hiring Assistant</string>
  <key>CFBundleIdentifier</key><string>local.zee.hiring-assistant</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleExecutable</key><string>HiringAssistant</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
</dict>
</plist>
PLIST

codesign --force --deep --sign - "$APP" 2>/dev/null || echo "(ad-hoc codesign skipped)"
echo "Built $APP"
