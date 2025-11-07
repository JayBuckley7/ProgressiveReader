#!/usr/bin/env python3
"""
Extract Q/A data from JLPT-style HTML blocks.

Usage:
  python parse_qa_html.py input.html --json out.json --csv out.csv

What it does:
- Finds each .question-entry (a sub-question).
- Pulls the question number, question text (with bolded target words preserved),
  all answer choices (radio label text), the marked "Correct answer : ...", and
  the "Explain:" text.
- Normalizes whitespace and strips labels.
"""

import re
import json
import argparse
from pathlib import Path
from bs4 import BeautifulSoup

def clean_text(s: str) -> str:
    if s is None:
        return ""
    # Replace multiple whitespace/newlines with single spaces and trim.
    return re.sub(r"\s+", " ", s).strip()

def text_with_ruby(elem) -> str:
    """
    Convert ruby annotations to inline readable text: 漢字(読み)
    If you prefer to drop furigana, swap this to elem.get_text(" ", strip=True).
    """
    if elem is None:
        return ""
    # Clone
    elem = BeautifulSoup(str(elem), "html.parser")
    # Replace <rt> with parentheses around its text after its base
    for ruby in elem.find_all("ruby"):
        # join base text + (rt) if present
        base = "".join(ruby.find_all(string=True, recursive=False)).strip()
        rt = ruby.find("rt")
        reading = f"({clean_text(rt.get_text())})" if rt else ""
        ruby.replace_with((base + reading).strip())
    return clean_text(elem.get_text(" "))

def text_with_ruby_and_strong(elem) -> str:
    """
    Convert ruby annotations to inline readable text and preserve <strong> tags as HTML.
    Returns HTML string with <strong> tags preserved.
    """
    if elem is None:
        return ""
    # Clone to avoid modifying original
    elem = BeautifulSoup(str(elem), "html.parser")
    
    # Replace <rt> with parentheses around its text after its base
    for ruby in elem.find_all("ruby"):
        base = "".join(ruby.find_all(string=True, recursive=False)).strip()
        rt = ruby.find("rt")
        reading = f"({clean_text(rt.get_text())})" if rt else ""
        ruby.replace_with((base + reading).strip())
    
    # Get inner HTML preserving <strong> tags
    # Use decode_contents() to get HTML string
    inner_html = elem.decode_contents()
    
    # Remove outer div wrapper if present (like <div class="question-content">...</div>)
    # Strip div tags but keep their content
    inner_html = re.sub(r'^<div[^>]*>', '', inner_html)
    inner_html = re.sub(r'</div>$', '', inner_html)
    
    # Clean up whitespace but preserve HTML tags
    # Replace multiple spaces/newlines with single space, but be careful around tags
    result = re.sub(r'\s+', ' ', inner_html).strip()
    
    return result

def get_question_text(qcontent_div) -> str:
    """
    Pulls the main question text. Keeps bolded <strong> and <ruby> meaning.
    """
    if qcontent_div is None:
        return ""
    # Many samples put the text directly; sometimes nested <p> or spans.
    # We remove the radio/answer areas and 'Correct answer' blocks later.
    return text_with_ruby_and_strong(qcontent_div)

def parse_question_entry(entry):
    """
    Parse one .question-entry block.
    """
    item = {
        "part": None,
        "question_number": None,   # e.g., "1.3"
        "parent_question_number": None,  # e.g., "5" for sub-question 5.1
        "parent_content": "",  # Content from parent question-box (reading passages, etc.)
        "prompt": "",
        "choices": [],
        "correct_choice_index": None,  # integer index in choices
        "correct_choice_text": None,
        "explanation": "",
        "is_audio": False,  # True if this is an audio question
        "audio_url": None  # URL to audio file if is_audio is True
    }

    # Part (walk up to nearest .question-item to read part-x)
    part_container = entry.find_parent(class_=re.compile(r"\bquestion-item\b"))
    if part_container:
        if part_container.has_attr("class"):
            for cls in part_container["class"]:
                m = re.match(r"part-(\d+)", cls)
                if m:
                    item["part"] = int(m.group(1))
        
        # Check for audio attribute (only mark as audio if data-audio exists and has a value)
        if part_container.has_attr("data-audio"):
            audio_url = part_container["data-audio"]
            if audio_url and audio_url.strip():
                item["is_audio"] = True
                item["audio_url"] = audio_url.strip()

    # Find parent question-box (the reading passage/context)
    # Structure: question-entry is inside question-sub, which is sibling to question-box
    question_sub = entry.find_parent(class_="question-sub")
    if question_sub:
        # Find the previous sibling question-box
        prev_sibling = question_sub.find_previous_sibling(class_="question-box")
        if prev_sibling:
            # Get the question number from parent
            parent_num_div = prev_sibling.select_one(".question-number")
            if parent_num_div:
                item["parent_question_number"] = clean_text(parent_num_div.get_text())
            
            # Get the parent content (reading passage, etc.)
            parent_content_div = prev_sibling.select_one(".question-content")
            if parent_content_div:
                item["parent_content"] = text_with_ruby_and_strong(parent_content_div)

    # Question number like "1.3" often shown in .question-number inside .question-sub-content
    num_div = entry.select_one(".question-sub-content .question-number, .question-number")
    if num_div:
        item["question_number"] = clean_text(num_div.get_text())

    # Prompt: usually inside .question-content within the .question-sub-content
    qtext_div = entry.select_one(".question-sub-content .question-content, .question-content")
    if qtext_div:
        # Remove nested .answer-content / .answer-result if incorrectly nested
        for trash in qtext_div.select(".answer-content, .answer-result"):
            trash.decompose()
        item["prompt"] = get_question_text(qtext_div)

    # Choices: labels under .answer-content .answer-item label
    choices = []
    for label in entry.select(".answer-content .answer-item label"):
        text = clean_text(text_with_ruby(label))
        if text:
            choices.append(text)
    item["choices"] = choices

    # Correct answer and explanation (from .answer-result)
    # Text looks like "Correct answer : せんせい"
    correct_text = None
    explanation = []
    ans_result = entry.select_one(".answer-result")
    if ans_result:
        # Try to find the "Correct answer : ..." text
        cands = ans_result.find_all(string=re.compile(r"Correct answer\s*:"))
        if cands:
            # Use the last match in case multiple
            raw = clean_text(cands[-1])
            # Extract the right-hand side after the colon
            m = re.search(r"Correct answer\s*:\s*(.+)$", raw)
            if m:
                correct_text = m.group(1).strip()

        # Explanation may be inside elements like .test-explain or <p> under .answer-result
        exp_block = ans_result.select_one(".test-explain") or ans_result
        # Gather paragraph-like blocks, fallback to full text
        paras = exp_block.find_all(["p", "div", "span"], recursive=True)
        if paras:
            for p in paras:
                pt = clean_text(text_with_ruby(p))
                if pt:
                    explanation.append(pt)
        else:
            explanation.append(clean_text(text_with_ruby(exp_block)))

    # If we captured correct_text, try to resolve which choice index it maps to
    if correct_text and choices:
        # Exact match first
        try:
            idx = choices.index(correct_text)
            item["correct_choice_index"] = idx
            item["correct_choice_text"] = choices[idx]
        except ValueError:
            # Some "Correct answer" show the surface with extra notes; try relaxed match.
            norm = correct_text.replace(" ", "")
            best_idx = None
            for i, c in enumerate(choices):
                if c.replace(" ", "") == norm:
                    best_idx = i
                    break
            # Also try substring match if still not found
            if best_idx is None:
                for i, c in enumerate(choices):
                    if norm in c.replace(" ", "") or c.replace(" ", "") in norm:
                        best_idx = i
                        break
            if best_idx is not None:
                item["correct_choice_index"] = best_idx
                item["correct_choice_text"] = choices[best_idx]
            else:
                item["correct_choice_text"] = correct_text  # keep raw if not aligned

    # Explanation join
    item["explanation"] = " ".join(e for e in explanation if e).strip()

    return item

def parse_html(html: str):
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # Each sub-question is under .question-entry in your sample.
    for entry in soup.select(".question-entry"):
        # Heuristic: skip entries with no .answer-content and no .answer-result (not a QA row)
        if not entry.select_one(".answer-content") and not entry.select_one(".answer-result"):
            continue
        results.append(parse_question_entry(entry))

    return results

def write_json(objs, path: Path):
    path.write_text(json.dumps(objs, ensure_ascii=False, indent=2), encoding="utf-8")

def write_csv(objs, path: Path):
    import csv
    # Flatten choices into semicolon-joined string
    fieldnames = [
        "part", "question_number", "prompt",
        "choices", "correct_choice_index", "correct_choice_text", "explanation"
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for o in objs:
            row = o.copy()
            row["choices"] = "; ".join(o.get("choices", []))
            w.writerow(row)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html_file", type=str, help="Path to the input HTML file")
    ap.add_argument("--json", type=str, help="Write parsed output to JSON")
    ap.add_argument("--csv", type=str, help="Write parsed output to CSV")
    args = ap.parse_args()

    html = Path(args.html_file).read_text(encoding="utf-8")
    data = parse_html(html)

    # Always show a preview in stdout
    print(json.dumps(data[:3], ensure_ascii=False, indent=2))  # preview first 3

    if args.json:
        write_json(data, Path(args.json))
        print(f"Wrote JSON -> {args.json}")
    if args.csv:
        write_csv(data, Path(args.csv))
        print(f"Wrote CSV  -> {args.csv}")

if __name__ == "__main__":
    main()
