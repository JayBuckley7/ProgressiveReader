#!/usr/bin/env python3
"""
Convert Nihonez JLPT capture HTML into ProgressiveReader JLPT JSON.

Usage:
  python parse_nihonez_html.py input.html --json out.json

Notes:
- Practice-page captures usually do not include answer keys.
- Review/result captures may mark the correct option directly with
  label.answer-choice.correct-answer, and may also populate
  .explanation with explicit "Correct Answer" text.
- Some captures contain only a partial answer key. In that case the
  output keeps the detected answers but marks the test as ungraded so
  the runner does not produce misleading scores.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Optional

from bs4 import BeautifulSoup
from bs4.element import NavigableString, Tag


BLOCK_TAGS = {
    "article",
    "aside",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ol",
    "p",
    "section",
    "ul",
}

UNDERLINE_CLASS_NAMES = {"underline"}


def clean_text(value: str) -> str:
    value = value.replace("\xa0", " ")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t\f\v]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def normalize_choice_text(value: str) -> str:
    return re.sub(r"\s+", "", value)


def is_points_summary(value: str) -> bool:
    return bool(re.fullmatch(r"Points:\s*\d+\s*/\s*\d+", clean_text(value), re.IGNORECASE))


def replace_ruby_markup(soup: BeautifulSoup) -> None:
    for ruby in soup.find_all("ruby"):
        reading_tag = ruby.find("rt")
        reading = clean_text(reading_tag.get_text(" ", strip=True)) if reading_tag else ""
        base_parts: list[str] = []
        for child in ruby.children:
            if isinstance(child, NavigableString):
                base_parts.append(str(child))
            elif isinstance(child, Tag) and child.name not in {"rt", "rp"}:
                base_parts.append(child.get_text(" ", strip=False))
        base = clean_text("".join(base_parts))
        if not base:
            base = clean_text(ruby.get_text(" ", strip=True))
        replacement = f"{base}({reading})" if base and reading else base or reading
        ruby.replace_with(replacement)


def convert_table_to_text(table: Tag) -> str:
    rows: list[str] = []
    for tr in table.find_all("tr"):
        cells: list[str] = []
        for cell in tr.find_all(["th", "td"]):
            text = clean_text(cell.get_text(" ", strip=True))
            if text:
                cells.append(text)
        if cells:
            rows.append(" | ".join(cells))
    return "\n".join(rows)


def html_to_text(node: Optional[Tag]) -> str:
    if node is None:
        return ""

    soup = BeautifulSoup(str(node), "html.parser")
    replace_ruby_markup(soup)

    for tag in soup.find_all(["script", "style"]):
        tag.decompose()

    for blank in soup.select(".blank-space"):
        blank.replace_with(" ___ ")

    for star in soup.select(".star"):
        star.replace_with(" ★ ")

    for img in soup.find_all("img"):
        alt = clean_text(img.get("alt", ""))
        img.replace_with(f" {alt} " if alt else " ")

    for br in soup.find_all("br"):
        br.replace_with("\n")

    for table in soup.find_all("table"):
        table.replace_with("\n" + convert_table_to_text(table) + "\n")

    for block in soup.find_all(BLOCK_TAGS):
        block.insert_after("\n")

    return clean_text(soup.get_text(" ", strip=False))


def is_underlined_tag(tag: Tag) -> bool:
    if tag.name == "u":
        return True

    classes = {str(value).strip().lower() for value in tag.get("class", [])}
    if UNDERLINE_CLASS_NAMES & classes:
        return True

    style = str(tag.get("style", ""))
    return bool(
        re.search(r"text-decoration(?:-line)?\s*:\s*[^;]*underline", style, re.IGNORECASE)
    )


def html_to_inline_markup(node: Optional[Tag]) -> str:
    if node is None:
        return ""

    soup = BeautifulSoup(str(node), "html.parser")
    root = soup.find()
    if root is None:
        return ""

    replace_ruby_markup(root)

    for tag in root.find_all(["script", "style"]):
        tag.decompose()

    for blank in root.select(".blank-space"):
        blank.replace_with(" ___ ")

    for star in root.select(".star"):
        star.replace_with(" 笘・")

    for img in root.find_all("img"):
        alt = clean_text(img.get("alt", ""))
        img.replace_with(f" {alt} " if alt else " ")

    for br in root.find_all("br"):
        br.replace_with(BeautifulSoup("<br/>", "html.parser").br)

    for tag in list(root.find_all(True)):
        if tag.name == "br":
            continue
        if is_underlined_tag(tag):
            tag.name = "u"
            tag.attrs = {}
            continue
        if tag.name in {"strong", "b"}:
            tag.name = "strong"
            tag.attrs = {}
            continue
        if tag.name in BLOCK_TAGS or tag.name == "span":
            tag.unwrap()
            continue
        tag.unwrap()

    markup = root.decode_contents(formatter="minimal")
    markup = markup.replace("\r\n", "\n").replace("\r", "\n")
    markup = re.sub(r">\s+<", "><", markup)
    markup = re.sub(r"[ \t\f\v]+", " ", markup)
    markup = re.sub(r" *\n *", "\n", markup)
    markup = re.sub(r"\n{3,}", "\n\n", markup)
    return markup.strip()


def find_level(*values: str) -> Optional[str]:
    for value in values:
        match = re.search(r"\bN([1-5])\b", value, re.IGNORECASE)
        if match:
            return f"N{match.group(1)}"
    return None


def detect_explicit_choice_number(source_text: str, choices: list[str]) -> tuple[Optional[int], str]:
    source_text = clean_text(source_text)
    if not source_text:
        return None, ""

    lower = source_text.lower()
    if "correct answer" not in lower and "正解" not in source_text:
        plain_number_match = re.fullmatch(r"([1-9])", source_text)
        if plain_number_match:
            index = int(plain_number_match.group(1)) - 1
            if 0 <= index < len(choices):
                return index, choices[index]
        return None, ""

    patterns = [
        r"correct answer.*?\banswer\s*([1-9])\b",
        r"correct answer.*?\(([1-9])\)",
        r"正解[^\d]{0,12}([1-9])",
    ]
    for pattern in patterns:
        match = re.search(pattern, source_text, re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        index = int(match.group(1)) - 1
        if 0 <= index < len(choices):
            return index, choices[index]

    return None, ""


def detect_marked_correct_choice(container: Tag, choices: list[str]) -> tuple[Optional[int], str]:
    for index, choice in enumerate(container.select("label.answer-choice")):
        if "correct-answer" not in choice.get("class", []):
            continue
        if 0 <= index < len(choices):
            return index, choices[index]
    return None, ""


def first_text(node: Optional[Tag], selector: str) -> str:
    target = node.select_one(selector) if node else None
    return html_to_text(target)


def parse_numeric_value(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def clean_optional_text(value: Any) -> str:
    if value is None:
        return ""
    return clean_text(str(value))


def parse_question_id(container: Tag) -> Optional[str]:
    container_id = container.get("id", "")
    match = re.search(r"question-(\d+)", container_id)
    if not match:
        return None
    return match.group(1)


def to_choice_index(value: Any, choice_count: int) -> Optional[int]:
    try:
        index = int(str(value).strip()) - 1
    except (TypeError, ValueError):
        return None
    if 0 <= index < choice_count:
        return index
    return None


def load_answer_lookup(path: Optional[Path]) -> dict[str, dict[str, Any]]:
    if path is None:
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    lookup: dict[str, dict[str, Any]] = {}

    if isinstance(payload, dict) and isinstance(payload.get("questions"), list):
        for item in payload["questions"]:
            if not isinstance(item, dict):
                continue
            question_id = clean_optional_text(item.get("question_id"))
            if not question_id:
                continue
            lookup[question_id] = item
        return lookup

    raw_question_results = payload.get("data", {}).get("question_results") if isinstance(payload, dict) else None
    if isinstance(raw_question_results, dict):
        for question_id, item in raw_question_results.items():
            if isinstance(item, dict):
                lookup[str(question_id)] = item

    return lookup


def parse_question(
    container: Tag,
    *,
    part_number: int,
    part_name: str,
    audio_url: Optional[str],
    parent_content: str,
    answer_lookup: dict[str, dict[str, Any]],
) -> dict:
    order = first_text(container, ".question-order") or None
    prompt = html_to_inline_markup(container.select_one(".question .question-content"))
    choices = [html_to_inline_markup(choice.select_one(".choice-text-furigana") or choice) for choice in container.select("label.answer-choice")]
    choices = [choice for choice in choices if choice]
    question_id = parse_question_id(container)
    answer_data = answer_lookup.get(question_id or "", {})

    answer_text = first_text(container, ".answer")
    explanation_text = first_text(container, ".explanation")
    listening_script_text = first_text(container, ".listening-script")

    correct_choice_index, correct_choice_text = detect_marked_correct_choice(container, choices)
    if correct_choice_index is None:
        correct_choice_index, correct_choice_text = detect_explicit_choice_number(explanation_text, choices)
    if correct_choice_index is None:
        correct_choice_index, correct_choice_text = detect_explicit_choice_number(answer_text, choices)
    if correct_choice_index is None and answer_data:
        mapped_index = to_choice_index(answer_data.get("correct_answer"), len(choices))
        if mapped_index is not None:
            correct_choice_index = mapped_index
            correct_choice_text = choices[mapped_index]

    explanation_candidates = [explanation_text, listening_script_text]
    if answer_text and not is_points_summary(answer_text):
        explanation_candidates.append(answer_text)
    if answer_data:
        normalized_explanation = clean_optional_text(answer_data.get("explanation"))
        normalized_listening_script = clean_optional_text(answer_data.get("listening_script"))
        explanation_candidates = []
        if audio_url and normalized_listening_script:
            explanation_candidates.append(normalized_listening_script)
        if normalized_explanation:
            explanation_candidates.append(normalized_explanation)
        if normalized_listening_script:
            explanation_candidates.append(normalized_listening_script)
        explanation_candidates.extend([explanation_text, listening_script_text])
        if answer_text and not is_points_summary(answer_text):
            explanation_candidates.append(answer_text)
    explanation = next((value for value in explanation_candidates if clean_text(value)), "")
    points_per_question = parse_numeric_value(answer_data.get("possible_points")) if answer_data else None

    return {
        "part": part_number,
        "question_number": order,
        "parent_question_number": None,
        "parent_content": parent_content,
        "prompt": prompt,
        "choices": choices,
        "correct_choice_index": correct_choice_index,
        "correct_choice_text": correct_choice_text,
        "explanation": explanation,
        "is_audio": bool(audio_url),
        "audio_url": audio_url,
        "points_per_question": points_per_question,
        "part_index": part_number,
        "part_name": part_name,
    }


def parse_passage_group(group: Tag) -> str:
    wrapper = group.select_one(".jlpt-passages-wrapper .jlpt-passages")
    return html_to_text(wrapper)


def build_meta_parts(parts: list[dict]) -> list[dict]:
    return [
        {
            "total": part["total"],
            "name": part["name"],
            "jp_name": part["section"],
            "time": None,
            "min_score": 0,
            "max_score": part.get("max_score", part["total"]),
            "require_audio": part["require_audio"],
        }
        for part in parts
    ]


def parse_html_document(html: str, source_name: str, answer_lookup: Optional[dict[str, dict[str, Any]]] = None) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    form = soup.select_one("form#test-form")
    if form is None:
        raise ValueError("Could not find form#test-form in the provided HTML.")
    answer_lookup = answer_lookup or {}

    source_url = ""
    source_meta = soup.select_one('meta[name="source-url"]')
    if source_meta:
        source_url = source_meta.get("content", "")

    title_text = clean_text(soup.title.get_text(" ", strip=True) if soup.title else "")
    level = find_level(title_text, source_url, source_name) or "N5"

    questions: list[dict] = []
    part_meta: list[dict] = []
    part_number = 0

    for section in form.find_all("div", class_="test-section"):
        section_name = first_text(section, ".test-section-title h2")

        for subsection in section.find_all("div", class_="test-subsection", recursive=False):
            part_number += 1
            subsection_title = clean_text(first_text(subsection, "h3")) or f"Part {part_number}"
            audio_source = subsection.select_one(".audio-player-container source")
            audio_url = audio_source.get("src") if audio_source else None

            question_count_before = len(questions)

            for child in subsection.find_all(recursive=False):
                if not isinstance(child, Tag):
                    continue

                child_classes = set(child.get("class", []))
                if "question-container" in child_classes:
                    questions.append(
                        parse_question(
                            child,
                            part_number=part_number,
                            part_name=subsection_title,
                            audio_url=audio_url,
                            parent_content="",
                            answer_lookup=answer_lookup,
                        )
                    )
                elif "passage-question-group" in child_classes:
                    parent_content = parse_passage_group(child)
                    for container in child.select(".questions-under-passage > .question-container"):
                        questions.append(
                            parse_question(
                                container,
                                part_number=part_number,
                                part_name=subsection_title,
                                audio_url=audio_url,
                                parent_content=parent_content,
                                answer_lookup=answer_lookup,
                            )
                        )

            part_total = len(questions) - question_count_before
            if part_total > 0:
                part_questions = questions[question_count_before:]
                part_max_score = sum(
                    parse_numeric_value(question.get("points_per_question")) or 1
                    for question in part_questions
                )
                part_meta.append(
                    {
                        "section": section_name,
                        "name": subsection_title,
                        "total": part_total,
                        "max_score": part_max_score,
                        "require_audio": bool(audio_url),
                    }
                )

    question_count = len(questions)
    answer_key_questions = sum(1 for question in questions if question["correct_choice_index"] is not None)
    answer_key_complete = answer_key_questions == question_count and question_count > 0
    answer_key_partial = 0 < answer_key_questions < question_count

    return {
        "questions": questions,
        "meta": {
            "_id": Path(source_name).stem,
            "type": "nihonez_capture",
            "level": level,
            "time": None,
            "parts": build_meta_parts(part_meta),
            "source_site": "nihonez",
            "source_url": source_url,
            "answer_key_present": answer_key_complete,
            "answer_key_complete": answer_key_complete,
            "answer_key_partial": answer_key_partial,
            "answer_key_questions": answer_key_questions,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html_file", type=str, help="Path to the Nihonez HTML capture")
    parser.add_argument("--json", type=str, help="Write parsed output to JSON")
    parser.add_argument(
        "--answers-json",
        type=str,
        help="Optional normalized Nihonez AJAX JSON with question_id/correct_answer data",
    )
    args = parser.parse_args()

    html_path = Path(args.html_file)
    output_path = Path(args.json) if args.json else html_path.with_suffix(".json")
    answers_path = Path(args.answers_json) if args.answers_json else None

    html = html_path.read_text(encoding="utf-8", errors="ignore")
    answer_lookup = load_answer_lookup(answers_path)
    parsed = parse_html_document(html, html_path.name, answer_lookup=answer_lookup)

    output_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")

    question_count = len(parsed["questions"])
    answered_count = sum(1 for question in parsed["questions"] if question["correct_choice_index"] is not None)
    print(f"Wrote JSON -> {output_path}")
    print(f"Questions parsed: {question_count}")
    print(f"Questions with detected answer keys: {answered_count}")
    if answered_count == 0:
        print("Warning: no answer key was found in the HTML capture. The runner can load this JSON, but scoring will not work.")
    elif answered_count < question_count:
        print("Warning: only a partial answer key was found. The runner will load this as ungraded practice to avoid misleading scores.")


if __name__ == "__main__":
    main()
