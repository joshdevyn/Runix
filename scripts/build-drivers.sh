#!/bin/bash

SOURCE_DIR=${1:-"drivers"}
DEST_DIR=${2:-"bin"}

echo "Building drivers from $SOURCE_DIR to $DEST_DIR"

# Create destination directory if it doesn't exist
DRIVERS_DEST_DIR="$DEST_DIR/drivers"
mkdir -p "$DRIVERS_DEST_DIR"

# Initialize driver manifest
DRIVER_MANIFEST="{\"drivers\":[]}"

# Process each driver directory
for DRIVER_SOURCE in "$SOURCE_DIR"/*/; do
  if [ -d "$DRIVER_SOURCE" ]; then
    DRIVER_NAME=$(basename "$DRIVER_SOURCE")
    echo "Processing driver: $DRIVER_NAME"
    
    # Create destination directory
    DRIVER_DEST="$DRIVERS_DEST_DIR/$DRIVER_NAME"
    mkdir -p "$DRIVER_DEST"
    
    # Copy all files
    cp -R "$DRIVER_SOURCE"* "$DRIVER_DEST" 2>/dev/null || :
    
    # Default executable name based on driver name
    EXECUTABLE_NAME="$DRIVER_NAME"
    EXECUTABLE_REL_PATH="$EXECUTABLE_NAME"
    
    # Look for package.json to build node drivers
    if [ -f "$DRIVER_SOURCE/package.json" ]; then
      echo "  Found package.json, compiling NodeJS driver"
      
      # Install dependencies and compile
      pushd "$DRIVER_DEST" > /dev/null
      
      # Install production dependencies
      npm install --production --no-package-lock > /dev/null 2>&1
      
      # Create a driver.js wrapper file
      cat > driver.js << EOF
const path = require('path');
const port = process.env.RUNIX_DRIVER_PORT || process.argv[2]?.replace('--port=', '') || process.argv[3] || 8000;

// Set port in environment
process.env.RUNIX_DRIVER_PORT = port;

// Load the actual driver implementation
require('./index.js');
EOF
      
      # Create a temporary package.json for pkg if it doesn't exist
      if [ ! -f "package.json" ]; then
        cat > package.json << EOF
{
  "name": "${DRIVER_NAME}",
  "version": "1.0.0",
  "bin": "driver.js",
  "pkg": {
    "assets": ["**/*", "!node_modules/pkg/**/*"],
    "targets": ["node18-linux-x64", "node18-macos-x64"]
  }
}
EOF
      else
        # Add pkg configuration using jq if available
        if command -v jq &> /dev/null; then
          # Add pkg configuration if missing
          jq '. + {pkg: {assets: ["**/*", "!node_modules/pkg/**/*"], targets: ["node18-linux-x64", "node18-macos-x64"]}}' package.json > package.json.tmp
          mv package.json.tmp package.json
          
          # Ensure bin entry points to driver.js
          jq '. + {bin: "driver.js"}' package.json > package.json.tmp
          mv package.json.tmp package.json
        fi
      fi
      
      # Compile with pkg
      if [ -f "node_modules/.bin/pkg" ]; then
        echo "  Creating standalone executable with pkg"
        ./node_modules/.bin/pkg . --output "$EXECUTABLE_NAME" > /dev/null 2>&1
        if [ -f "$EXECUTABLE_NAME" ]; then
          echo "  Successfully created $EXECUTABLE_NAME"
          chmod +x "$EXECUTABLE_NAME"
        else
          echo "  Failed to create executable. Using Node.js fallback."
          EXECUTABLE_REL_PATH="driver.js"
        fi
      else
        # Try global pkg
        if command -v pkg &> /dev/null || command -v npx &> /dev/null; then
          npx pkg . --output "$EXECUTABLE_NAME" > /dev/null 2>&1
          if [ -f "$EXECUTABLE_NAME" ]; then
            echo "  Successfully created $EXECUTABLE_NAME using npx pkg"
            chmod +x "$EXECUTABLE_NAME"
          else
            echo "  Failed to create executable. Using Node.js fallback."
            EXECUTABLE_REL_PATH="driver.js"
          fi
        else
          echo "  pkg not found. Using Node.js fallback."
          EXECUTABLE_REL_PATH="driver.js"
        fi
      fi
      
      popd > /dev/null
    else
      # No package.json found, just use index.js
      echo "  No package.json found, using direct JS execution"
      EXECUTABLE_REL_PATH="index.js"
    fi
    
    # Set up driver info for manifest with proper executable
    DRIVER_INFO="{\"name\":\"$DRIVER_NAME\",\"path\":\"$DRIVER_DEST\",\"executable\":\"$EXECUTABLE_REL_PATH\",\"transport\":\"websocket\"}"
    
    # Check for driver.json to incorporate metadata
    if [ -f "$DRIVER_DEST/driver.json" ]; then
      echo "  Found driver.json configuration"
      if command -v jq &> /dev/null; then
        # Extract values from driver.json
        DRIVER_NAME_FROM_JSON=$(jq -r '.name // empty' "$DRIVER_DEST/driver.json")
        DRIVER_TRANSPORT=$(jq -r '.transport // empty' "$DRIVER_DEST/driver.json")
        
        # Update driver info with values from driver.json
        if [ ! -z "$DRIVER_NAME_FROM_JSON" ]; then
          DRIVER_INFO=$(echo $DRIVER_INFO | jq ".name = \"$DRIVER_NAME_FROM_JSON\"")
        fi
        
        if [ ! -z "$DRIVER_TRANSPORT" ]; then
          DRIVER_INFO=$(echo $DRIVER_INFO | jq ".transport = \"$DRIVER_TRANSPORT\"")
        fi
      fi
    fi
    
    # Always ensure we use our compiled executable
    DRIVER_INFO=$(echo $DRIVER_INFO | jq ".executable = \"$EXECUTABLE_REL_PATH\"")
    
    # Add driver to manifest
    DRIVER_MANIFEST=$(echo $DRIVER_MANIFEST | jq ".drivers += [$DRIVER_INFO]")
    
    echo "  Processed $DRIVER_NAME driver files to $DRIVER_DEST"
  fi
done

# Save driver manifest
MANIFEST_PATH="$DEST_DIR/driver-manifest.json"
echo $DRIVER_MANIFEST | jq . > "$MANIFEST_PATH"
echo "Created driver manifest at $MANIFEST_PATH"

echo "Driver build completed successfully"
