import json
import re
from typing import Any


REQUIRED_KEYS = {"score", "evidence", "kpi_mapping", "gaps", "follow_up_questions"}
SCORE_KEYS = {"value", "label", "band", "justification", "confidence", "confidence_reason"}
EVIDENCE_KEYS = {"quote", "signal", "dimension", "interpretation"}
KPI_KEYS = {"kpi", "evidence", "system_or_personal", "note"}
GAP_KEYS = {"dimension", "detail"}
FOLLOW_UP_KEYS = {"question", "target_gap", "looking_for"}

VALID_BANDS = {"Need Attention", "Productivity", "Performance"}
CANONICAL_BANDS = {band.lower(): band for band in VALID_BANDS}
VALID_SIGNALS = {"positive", "negative", "neutral"}
VALID_DIMENSIONS = {"execution", "systems_building", "kpi_impact", "change_management"}
VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_SYSTEM_PERSONAL = {"system", "personal"}
VALID_KPI_IDS = {
    "lead_generation",
    "lead_conversion",
    "upselling",
    "cross_selling",
    "nps",
    "pat",
    "tat",
    "quality",
}

# Common hallucinations or specific rubric labels used as dimensions
DIMENSION_MAPPING = {
    "problem_identifier": "execution",
    "problem_solver": "systems_building",
    "innovative": "systems_building",
    "experimental": "systems_building",
    "nps": "kpi_impact",
    "lead_generation": "kpi_impact",
    "lead_conversion": "kpi_impact",
    "upselling": "kpi_impact",
    "cross_selling": "kpi_impact",
    "pat": "kpi_impact",
    "tat": "kpi_impact",
    "quality": "kpi_impact",
    "behavior": "execution",
    "reliability": "execution",
}

# Common hallucinations for KPI IDs
KPI_MAPPING = {
    "net_promoter_score": "nps",
    "turnaround_time": "tat",
    "profit_after_tax": "pat",
}


class ParseError(Exception):
    pass


def strip_markdown(text: str) -> str:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ParseError("No JSON object found in LLM response")
    return match.group(0)


def check_truncation(text: str) -> None:
    open_braces = text.count("{")
    close_braces = text.count("}")
    if open_braces != close_braces:
        raise ParseError(
            f"JSON appears truncated: {open_braces} open braces vs {close_braces} close braces. "
            "Increase num_predict in Ollama payload."
        )


def fix_trailing_commas(text: str) -> str:
    return re.sub(r",\s*([}\]])", r"\1", text)


def extract_json(raw: str) -> dict[str, Any]:
    json_str = strip_markdown(raw)
    check_truncation(json_str)
    json_str = fix_trailing_commas(json_str)

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ParseError(f"JSON decode failed: {exc}") from exc

    normalize_enum_casing(data)
    validate(data)
    return data


def normalize_enum_casing(data: Any) -> None:
    if not isinstance(data, dict):
        return

    score = data.get("score")
    if isinstance(score, dict):
        if isinstance(score.get("confidence"), str):
            score["confidence"] = score["confidence"].lower()
        if isinstance(score.get("band"), str):
            band_key = score["band"].strip().lower()
            score["band"] = CANONICAL_BANDS.get(band_key, score["band"].strip())

    evidence = data.get("evidence")
    if isinstance(evidence, list):
        for item in evidence:
            if not isinstance(item, dict):
                continue
            for key in ("signal", "dimension"):
                if isinstance(item.get(key), str):
                    val = item[key].lower().strip().replace(" ", "_")
                    if key == "dimension" and val not in VALID_DIMENSIONS:
                        val = DIMENSION_MAPPING.get(val, val)
                    item[key] = val

    kpi_mapping = data.get("kpi_mapping")
    if isinstance(kpi_mapping, list):
        for item in kpi_mapping:
            if not isinstance(item, dict):
                continue
            for key in ("kpi", "system_or_personal"):
                if isinstance(item.get(key), str):
                    val = item[key].lower().strip().replace(" ", "_")
                    if key == "kpi" and val not in VALID_KPI_IDS:
                        val = KPI_MAPPING.get(val, val)
                    item[key] = val

    gaps = data.get("gaps")
    if isinstance(gaps, list):
        for item in gaps:
            if isinstance(item, dict) and isinstance(item.get("dimension"), str):
                val = item["dimension"].lower().strip().replace(" ", "_")
                if val not in VALID_DIMENSIONS:
                    val = DIMENSION_MAPPING.get(val, val)
                item["dimension"] = val


def validate(data: dict[str, Any]) -> None:
    if not isinstance(data, dict):
        raise ParseError("Response JSON must be an object")

    _require_exact_keys(data, REQUIRED_KEYS, "top-level object")
    _validate_score(data["score"])
    _validate_evidence(data["evidence"])
    _validate_kpi_mapping(data["kpi_mapping"])
    _validate_gaps(data["gaps"])
    _validate_follow_up_questions(data["follow_up_questions"])
    _validate_required_gap_coverage(data)


def _require_exact_keys(obj: Any, expected: set[str], label: str) -> None:
    if not isinstance(obj, dict):
        raise ParseError(f"{label} must be an object")

    actual = set(obj.keys())
    missing = expected - actual
    extra = actual - expected
    if missing:
        raise ParseError(f"{label} missing required keys: {sorted(missing)}")
    if extra:
        raise ParseError(f"{label} has unexpected keys: {sorted(extra)}")


def _require_non_empty_string(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ParseError(f"{label} must be a non-empty string")


def _validate_score(score: Any) -> None:
    _require_exact_keys(score, SCORE_KEYS, "score")

    if not isinstance(score["value"], int):
        raise ParseError("score.value must be an integer")
    if not 1 <= score["value"] <= 10:
        raise ParseError(f"score.value {score['value']} out of range 1-10")
    if score["band"] not in VALID_BANDS:
        raise ParseError(f"Invalid score.band: {score['band']}")
    if score["confidence"] not in VALID_CONFIDENCE:
        raise ParseError(f"Invalid score.confidence: {score['confidence']}")

    for key in ("label", "justification", "confidence_reason"):
        _require_non_empty_string(score[key], f"score.{key}")


def _validate_evidence(evidence: Any) -> None:
    if not isinstance(evidence, list) or not 3 <= len(evidence) <= 6:
        length = len(evidence) if isinstance(evidence, list) else "non-list"
        raise ParseError(f"evidence must have 3-6 items, got {length}")

    for index, item in enumerate(evidence):
        _require_exact_keys(item, EVIDENCE_KEYS, f"evidence[{index}]")
        if item["signal"] not in VALID_SIGNALS:
            raise ParseError(f"Invalid evidence[{index}].signal: {item['signal']}")
        if item["dimension"] not in VALID_DIMENSIONS:
            raise ParseError(f"Invalid evidence[{index}].dimension: {item['dimension']}")
        for key in EVIDENCE_KEYS:
            _require_non_empty_string(item[key], f"evidence[{index}].{key}")


def _validate_kpi_mapping(kpi_mapping: Any) -> None:
    if not isinstance(kpi_mapping, list):
        raise ParseError("kpi_mapping must be a list")

    for index, item in enumerate(kpi_mapping):
        _require_exact_keys(item, KPI_KEYS, f"kpi_mapping[{index}]")
        if item["kpi"] not in VALID_KPI_IDS:
            raise ParseError(f"Invalid kpi_mapping[{index}].kpi: {item['kpi']}")
        if item["system_or_personal"] not in VALID_SYSTEM_PERSONAL:
            raise ParseError(
                f"Invalid kpi_mapping[{index}].system_or_personal: {item['system_or_personal']}"
            )
        for key in KPI_KEYS:
            _require_non_empty_string(item[key], f"kpi_mapping[{index}].{key}")


def _validate_gaps(gaps: Any) -> None:
    if not isinstance(gaps, list):
        raise ParseError("gaps must be a list")

    for index, item in enumerate(gaps):
        _require_exact_keys(item, GAP_KEYS, f"gaps[{index}]")
        if item["dimension"] not in VALID_DIMENSIONS:
            raise ParseError(f"Invalid gaps[{index}].dimension: {item['dimension']}")
        for key in GAP_KEYS:
            _require_non_empty_string(item[key], f"gaps[{index}].{key}")


def _validate_required_gap_coverage(data: dict[str, Any]) -> None:
    evidence = data["evidence"]
    gaps = data["gaps"]
    evidence_dimensions = {item["dimension"] for item in evidence}
    gap_dimensions = {item["dimension"] for item in gaps}
    if "change_management" not in evidence_dimensions and "change_management" not in gap_dimensions:
        raise ParseError(
            "change_management evidence is absent, so gaps must include a change_management gap"
        )


def _validate_follow_up_questions(follow_up_questions: Any) -> None:
    if not isinstance(follow_up_questions, list) or not 3 <= len(follow_up_questions) <= 5:
        length = len(follow_up_questions) if isinstance(follow_up_questions, list) else "non-list"
        raise ParseError(f"follow_up_questions must have 3-5 items, got {length}")

    for index, item in enumerate(follow_up_questions):
        _require_exact_keys(item, FOLLOW_UP_KEYS, f"follow_up_questions[{index}]")
        _require_non_empty_string(item["target_gap"], f"follow_up_questions[{index}].target_gap")
        for key in FOLLOW_UP_KEYS:
            _require_non_empty_string(item[key], f"follow_up_questions[{index}].{key}")
