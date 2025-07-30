#!/usr/bin/env python3
"""
EditKanji.py - Edit JLPT levels in kanjiapi_full.json

Usage:
    python EditKanji.py <kanji> <jlpt_level>

Examples:
    python EditKanji.py 誰 "JLPT N5"
    python EditKanji.py 火 "JLPT N4"
    python EditKanji.py 水 "N3"
    python EditKanji.py 木 "5"
"""

import json
import sys
import re
import os
from typing import Optional

JSON_FILE = "frontend/src/data/jlpt/kanjiapi_full.json"

def parse_jlpt_level(level_str: str) -> Optional[int]:
    """
    Parse JLPT level from various string formats.
    
    Accepts:
    - "JLPT N5", "N5", "5"
    - "JLPT N4", "N4", "4"
    - etc.
    
    Returns the numeric level (1-5) or None if invalid.
    """
    level_str = level_str.strip().upper()
    
    # Match patterns like "JLPT N5", "N5", "5"
    patterns = [
        r'JLPT\s*N?(\d)',  # "JLPT N5" or "JLPT 5"
        r'N(\d)',          # "N5"
        r'^(\d)$'          # "5"
    ]
    
    for pattern in patterns:
        match = re.match(pattern, level_str)
        if match:
            level = int(match.group(1))
            if 1 <= level <= 5:
                return level
    
    return None

def load_kanji_data() -> dict:
    """Load the kanjiapi_full.json file."""
    if not os.path.exists(JSON_FILE):
        print(f"❌ Error: {JSON_FILE} not found!")
        print("Make sure you're running this from the project root directory.")
        sys.exit(1)
    
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading JSON file: {e}")
        sys.exit(1)

def save_kanji_data(data: dict) -> None:
    """Save the updated data back to the JSON file."""
    try:
        # Create backup
        backup_file = JSON_FILE + ".backup"
        if os.path.exists(JSON_FILE):
            with open(JSON_FILE, 'r', encoding='utf-8') as src, \
                 open(backup_file, 'w', encoding='utf-8') as dst:
                dst.write(src.read())
            print(f"📋 Backup created: {backup_file}")
        
        # Save updated data
        with open(JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        
        print(f"✅ Successfully updated {JSON_FILE}")
        
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        sys.exit(1)

def main():
    if len(sys.argv) != 3:
        print(__doc__)
        print("\n❌ Error: Please provide exactly 2 arguments: <kanji> <jlpt_level>")
        print("\nExamples:")
        print('  python EditKanji.py 誰 "JLPT N5"')
        print('  python EditKanji.py 火 "N4"')
        print('  python EditKanji.py 水 "3"')
        sys.exit(1)
    
    kanji = sys.argv[1]
    level_str = sys.argv[2]
    
    # Validate inputs
    if len(kanji) != 1:
        print(f"❌ Error: '{kanji}' should be a single kanji character")
        sys.exit(1)
    
    jlpt_level = parse_jlpt_level(level_str)
    if jlpt_level is None:
        print(f"❌ Error: Invalid JLPT level '{level_str}'")
        print("Valid formats: 'JLPT N5', 'N5', '5' (levels 1-5)")
        sys.exit(1)
    
    # Load data
    print(f"📂 Loading {JSON_FILE}...")
    data = load_kanji_data()
    
    if 'kanjis' not in data:
        print("❌ Error: Invalid JSON structure - 'kanjis' key not found")
        sys.exit(1)
    
    # Check if kanji exists
    if kanji not in data['kanjis']:
        print(f"❌ Error: Kanji '{kanji}' not found in database")
        print(f"Available kanji count: {len(data['kanjis'])}")
        sys.exit(1)
    
    # Show current info
    kanji_info = data['kanjis'][kanji]
    old_jlpt = kanji_info.get('jlpt')
    old_level_str = f"N{old_jlpt}" if old_jlpt else "None"
    
    print(f"\n📝 Kanji: {kanji}")
    print(f"Current JLPT level: {old_level_str}")
    print(f"New JLPT level: N{jlpt_level}")
    
    if kanji_info.get('meanings'):
        print(f"Meanings: {', '.join(kanji_info['meanings'])}")
    
    # Update the JLPT level
    data['kanjis'][kanji]['jlpt'] = jlpt_level
    
    # Save the updated data
    save_kanji_data(data)
    
    print(f"\n🎉 Successfully changed {kanji} from {old_level_str} to N{jlpt_level}")

if __name__ == "__main__":
    main()