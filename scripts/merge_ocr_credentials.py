#!/usr/bin/env python3
"""Merge pdf-ocr-credentials into PR-app-config secret."""
import subprocess
import json
import sys

def get_secret(secret_name, project_id):
    """Get secret content, handling UTF-8 BOM."""
    result = subprocess.run(
        ['gcloud', 'secrets', 'versions', 'access', 'latest',
         f'--secret={secret_name}', f'--project={project_id}'],
        capture_output=True,
        text=False  # Get raw bytes
    )
    if result.returncode != 0:
        print(f"Error fetching {secret_name}: {result.stderr.decode('utf-8', errors='ignore')}")
        sys.exit(1)
    
    # Decode with utf-8-sig to handle BOM
    content = result.stdout.decode('utf-8-sig')
    return json.loads(content)

def update_secret(secret_name, content, project_id):
    """Update secret with new content."""
    # Write to temp file
    import tempfile
    import os
    
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.json', delete=False) as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
        temp_path = f.name
    
    try:
        # Create new version
        result = subprocess.run(
            ['gcloud', 'secrets', 'versions', 'add', secret_name,
             f'--data-file={temp_path}', f'--project={project_id}'],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"Error updating {secret_name}: {result.stderr}")
            sys.exit(1)
        print(f"Updated {secret_name}")
    finally:
        os.unlink(temp_path)

def delete_secret(secret_name, project_id):
    """Delete secret."""
    result = subprocess.run(
        ['gcloud', 'secrets', 'delete', secret_name,
         f'--project={project_id}', '--quiet'],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"Error deleting {secret_name}: {result.stderr}")
        sys.exit(1)
    print(f"Deleted {secret_name}")

if __name__ == '__main__':
    PROJECT_ID = 'floofgg'
    
    print("Fetching secrets...")
    pdf_ocr_creds = get_secret('pdf-ocr-credentials', PROJECT_ID)
    pr_app_config = get_secret('PR-app-config', PROJECT_ID)
    
    print("Merging pdf-ocr-credentials into PR-app-config...")
    # Add the OCR credentials as a field
    pr_app_config['GOOGLE_APPLICATION_CREDENTIALS_JSON'] = pdf_ocr_creds
    
    print("Updating PR-app-config secret...")
    update_secret('PR-app-config', pr_app_config, PROJECT_ID)
    
    print("Deleting pdf-ocr-credentials secret...")
    delete_secret('pdf-ocr-credentials', PROJECT_ID)
    
    print("Done!")

