import subprocess
import json
import sys
import os

PROJECT_ID = 'floofgg'

def get_secret(secret_name):
    """Get secret content, handling UTF-8 BOM."""
    # Use shell=True on Windows to find gcloud
    result = subprocess.run(
        f'gcloud secrets versions access latest --secret={secret_name} --project={PROJECT_ID}',
        shell=True,
        capture_output=True,
        text=False
    )
    if result.returncode != 0:
        print(f"Error fetching {secret_name}: {result.stderr.decode('utf-8', errors='ignore')}")
        sys.exit(1)
    
    # Decode with utf-8-sig to handle BOM
    content = result.stdout.decode('utf-8-sig')
    return json.loads(content)

def update_secret(secret_name, content):
    """Update secret with new content."""
    import tempfile
    
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.json', delete=False) as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
        temp_path = f.name
    
    try:
        result = subprocess.run(
            f'gcloud secrets versions add {secret_name} --data-file={temp_path} --project={PROJECT_ID}',
            shell=True,
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"Error updating {secret_name}: {result.stderr}")
            sys.exit(1)
        print(f"Updated {secret_name}")
    finally:
        os.unlink(temp_path)

if __name__ == '__main__':
    print("Fetching PR-app-config secret...")
    pr_app_config = get_secret('PR-app-config')
    
    # Fetch OCR credentials from the pdf-ocr-credentials secret
    print("Fetching pdf-ocr-credentials secret...")
    ocr_credentials = get_secret('pdf-ocr-credentials')
    
    print("Adding GOOGLE_APPLICATION_CREDENTIALS_JSON field...")
    pr_app_config['GOOGLE_APPLICATION_CREDENTIALS_JSON'] = ocr_credentials
    
    print("Updating PR-app-config secret...")
    update_secret('PR-app-config', pr_app_config)
    
    print("Done! pdf-ocr-credentials secret is already deleted.")

