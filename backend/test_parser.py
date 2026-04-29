import unittest

from parser import ParseError, extract_json


def valid_payload(**overrides):
    payload = {
        "score": {
            "value": 6,
            "label": "Reliable and Productive",
            "band": "Productivity",
            "justification": "The supervisor says the Fellow is reliable and follows up daily.",
            "confidence": "medium",
            "confidence_reason": "The transcript has execution and KPI evidence but limited systems evidence.",
        },
        "evidence": [
            {
                "quote": "If I give him a task, I can forget about it.",
                "signal": "positive",
                "dimension": "execution",
                "interpretation": "This is strong execution within assigned scope.",
            },
            {
                "quote": "He maintains one production sheet in Excel.",
                "signal": "neutral",
                "dimension": "systems_building",
                "interpretation": "This is a tracker, but adoption by others is unclear.",
            },
            {
                "quote": "Dispatch delays have reduced.",
                "signal": "positive",
                "dimension": "kpi_impact",
                "interpretation": "This maps to turnaround time impact.",
            },
        ],
        "kpi_mapping": [
            {
                "kpi": "tat",
                "evidence": "Dispatch delays have reduced.",
                "system_or_personal": "personal",
                "note": "The improvement depends on the Fellow reminding people.",
            }
        ],
        "gaps": [
            {
                "dimension": "change_management",
                "detail": "The transcript does not show adoption or resistance handling by the floor team.",
            }
        ],
        "follow_up_questions": [
            {
                "question": "Who updates the tracker when the Fellow is absent?",
                "target_gap": "systems_building",
                "looking_for": "A positive answer shows the system survives without the Fellow.",
            },
            {
                "question": "How did the floor team respond to the new process?",
                "target_gap": "change_management",
                "looking_for": "A positive answer shows adoption and resistance handling.",
            },
            {
                "question": "Which metric improved because of this work?",
                "target_gap": "kpi_impact",
                "looking_for": "A positive answer ties activity to business impact.",
            },
        ],
    }
    payload.update(overrides)
    return payload


class ParserTests(unittest.TestCase):
    def test_strips_markdown_and_trailing_commas(self):
        raw = """```json
{
  "score": {
    "value": 6,
    "label": "Reliable and Productive",
    "band": "productivity",
    "justification": "The supervisor says the Fellow is reliable.",
    "confidence": "Medium",
    "confidence_reason": "The transcript has mixed evidence."
  },
  "evidence": [
    {"quote": "If I give him a task, I can forget about it.", "signal": "Positive", "dimension": "Execution", "interpretation": "Execution strength."},
    {"quote": "He maintains one production sheet in Excel.", "signal": "Neutral", "dimension": "Systems_Building", "interpretation": "Tracker exists."},
    {"quote": "Dispatch delays have reduced.", "signal": "Positive", "dimension": "KPI_Impact", "interpretation": "TAT improved."}
  ],
  "kpi_mapping": [
    {"kpi": "TAT", "evidence": "Dispatch delays have reduced.", "system_or_personal": "Personal", "note": "Depends on reminders."}
  ],
  "gaps": [
    {"dimension": "Change_Management", "detail": "Team adoption evidence is absent."}
  ],
  "follow_up_questions": [
    {"question": "Who updates the tracker?", "target_gap": "systems_building", "looking_for": "Survivability evidence."},
    {"question": "How did the team respond?", "target_gap": "change_management", "looking_for": "Adoption evidence."},
    {"question": "Which metric improved?", "target_gap": "kpi_impact", "looking_for": "Business impact evidence."}
  ],
}
```"""
        parsed = extract_json(raw)
        self.assertEqual(parsed["score"]["band"], "Productivity")
        self.assertEqual(parsed["score"]["confidence"], "medium")
        self.assertEqual(parsed["kpi_mapping"][0]["kpi"], "tat")

    def test_truncation_raises_parse_error(self):
        with self.assertRaisesRegex(ParseError, "truncated"):
            extract_json('{"score": {"value": 6}')

    def test_invalid_score_raises_parse_error(self):
        payload = valid_payload()
        payload["score"]["value"] = 11
        with self.assertRaisesRegex(ParseError, "out of range"):
            extract_json(str(payload).replace("'", '"'))

    def test_missing_keys_raise_parse_error(self):
        payload = valid_payload()
        del payload["score"]["label"]
        with self.assertRaisesRegex(ParseError, "missing required keys"):
            extract_json(str(payload).replace("'", '"'))

    def test_change_management_gap_required_when_evidence_absent(self):
        payload = valid_payload(gaps=[])
        with self.assertRaisesRegex(ParseError, "change_management"):
            extract_json(str(payload).replace("'", '"'))


if __name__ == "__main__":
    unittest.main()
