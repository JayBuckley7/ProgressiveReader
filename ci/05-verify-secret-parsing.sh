#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Verifying PR-app-config secret can be parsed as JSON..."

# Get the secret content
SECRET_CONTENT="$(gcloud secrets versions access latest --secret=PR-app-config --project="${PROJECT_ID}")"

# Try to parse it as JSON with Python (handling UTF-8 BOM)
echo "$SECRET_CONTENT" | python3 << 'PYTHON_SCRIPT'
import sys
import json

try:
    # Read from stdin
    content = sys.stdin.read()
    
    # Try with utf-8-sig to handle BOM
    if content.startswith('\ufeff'):
        content = content[1:]  # Remove BOM if present
    
    # Parse JSON
    data = json.loads(content)
    
    # Verify required keys exist
    required_keys = ['CLERK_SECRET_KEY', 'VITE_CLERK_PUBLISHABLE_KEY', 'OPENAI_API_KEYS']
    missing_keys = [key for key in required_keys if key not in data]
    
    if missing_keys:
        print(f"❌ Missing required keys: {missing_keys}")
        sys.exit(1)
    
    # Verify values are not empty
    for key in required_keys:
        value = data.get(key)
        if not value:
            print(f"❌ {key} is empty or missing")
            sys.exit(1)
    
    print(f"✅ Secret parsed successfully")
    print(f"✅ Found keys: {list(data.keys())}")
    print(f"✅ Required keys present: {required_keys}")
    sys.exit(0)
    
except json.JSONDecodeError as e:
    print(f"❌ Failed to parse secret as JSON: {e}")
    print(f"First 200 chars: {content[:200] if 'content' in locals() else 'N/A'}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
PYTHON_SCRIPT

PYTHON_EXIT=$?

if [ $PYTHON_EXIT -ne 0 ]; then
    echo "❌ Secret validation failed - build will not proceed"
    exit 1
fi

echo "✅ Secret parsing validation complete"

