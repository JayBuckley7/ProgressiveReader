#!/usr/bin/env bash
set -eu

echo "剥 Verifying PR-app-config secret can be parsed as JSON..."

# Get the secret content and save to temp file to preserve BOM
TEMP_FILE=$(mktemp)
gcloud secrets versions access latest --secret=PR-app-config --project="${PROJECT_ID}" > "$TEMP_FILE"

# Try to parse it as JSON with Python (handling UTF-8 BOM)
python3 - "$TEMP_FILE" << 'PYTHON_SCRIPT'
import sys
import json

try:
    # Read from the temp file (passed as command line argument)
    with open(sys.argv[1], 'rb') as f:
        raw_content = f.read()
    
    # Decode with utf-8-sig to handle BOM automatically
    content = raw_content.decode('utf-8-sig')
    
    # Parse JSON
    data = json.loads(content)
    
    # Verify required keys exist
    required_keys = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'OPENAI_API_KEYS']
    missing_keys = [key for key in required_keys if key not in data]
    
    if missing_keys:
        print(f"笶・Missing required keys: {missing_keys}")
        sys.exit(1)
    
    # Verify values are not empty
    for key in required_keys:
        value = data.get(key)
        if not value:
            print(f"笶・{key} is empty or missing")
            sys.exit(1)
    
    print(f"笨・Secret parsed successfully")
    print(f"笨・Found keys: {list(data.keys())}")
    print(f"笨・Required keys present: {required_keys}")
    sys.exit(0)
    
except json.JSONDecodeError as e:
    print(f"笶・Failed to parse secret as JSON: {e}")
    if 'content' in locals():
        print(f"First 200 chars: {content[:200]}")
        print(f"Raw bytes (first 20): {raw_content[:20]}")
    sys.exit(1)
except Exception as e:
    print(f"笶・Unexpected error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYTHON_SCRIPT

PYTHON_EXIT=$?

# Clean up temp file
rm -f "$TEMP_FILE"

if [ $PYTHON_EXIT -ne 0 ]; then
    echo "笶・Secret validation failed - build will not proceed"
    exit 1
fi

echo "笨・Secret parsing validation complete"

