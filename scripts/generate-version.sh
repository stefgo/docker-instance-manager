#!/bin/bash

# Target path is the first argument
TARGET_PATH=$1

if [ -z "$TARGET_PATH" ]; then
    echo "Usage: $0 <target-path>"
    exit 1
fi

get_version() {
    # 1. Check if APP_VERSION environment variable is set
    if [ -n "$APP_VERSION" ]; then
        echo "$APP_VERSION"
        return
    fi

    # 2. Try to get exact tag match from git if available
    if [ -d ".git" ]; then
        if VERSION=$(git describe --tags --exact-match --dirty 2>/dev/null); then
            echo "$VERSION"
            return
        fi
    fi

    # 3. Fallback: Branch + Short Hash + Dirty
    # Try environment variables first (useful for CI)
    BRANCH=${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")}
    
    if [ -n "$GITHUB_SHA" ]; then
        HASH=$(echo "$GITHUB_SHA" | cut -c1-7)
    else
        HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi
    
    DIRTY=$( [ -d ".git" ] && git status --porcelain 2>/dev/null | grep -q . && echo "-dirty" || echo "" )
    
    echo "${BRANCH}-${HASH}${DIRTY}"
}

VERSION=$(get_version)
ABSOLUTE_PATH=$(readlink -f "$TARGET_PATH" 2>/dev/null || echo "$TARGET_PATH")
DIR=$(dirname "$ABSOLUTE_PATH")

# Create directory if it doesn't exist
mkdir -p "$DIR"

# Write version to file
echo -n "$VERSION" > "$ABSOLUTE_PATH"

echo "Version $VERSION written to $ABSOLUTE_PATH"
