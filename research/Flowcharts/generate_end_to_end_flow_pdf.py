from __future__ import annotations

import csv
import hashlib
import json
import textwrap
from datetime import date
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


RESEARCH = Path(__file__).resolve().parents[1]
OUT_PDF = RESEARCH / "PDFs" / "VeriTrust_End_to_End_Detection_Flows_and_HF_Model_Map.pdf"
OUT_SOURCE = RESEARCH / "Flowcharts" / "End_to_End_Flow_Document_Source.json"
OUT_LINKS = RESEARCH / "Flowcharts" / "HF_Model_Link_Map.csv"
OUT_BUILD = RESEARCH / "QA" / "end_to_end_flowchart_build_evidence.json"

ARCH = yaml.safe_load((RESEARCH / "Architecture_Source_of_Truth.yaml").read_text(encoding="utf-8"))
REGISTRY = json.loads((RESEARCH / "Model_Registry_Proposal.json").read_text(encoding="utf-8"))
with (RESEARCH / "HuggingFace_Deployment_Matrix.csv").open("r", encoding="utf-8-sig", newline="") as handle:
    MATRIX = list(csv.DictReader(handle))
with (RESEARCH / "HF_Model_Decision_Ledger.csv").open("r", encoding="utf-8-sig", newline="") as handle:
    DECISIONS = list(csv.DictReader(handle))

ENTRIES = REGISTRY["entries"]
ENTRY_BY_KEY = {row["modelKey"]: row for row in ENTRIES}
MATRIX_BY_KEY = {row["model_key"]: row for row in MATRIX}
CANONICAL_KEYS = {
    value["model_key"] for value in ARCH["model_assignments"].values()
    if isinstance(value, dict) and value.get("model_key")
}
REGISTRY_KEYS = set(ENTRY_BY_KEY)
MATRIX_KEYS = set(MATRIX_BY_KEY)
if not (CANONICAL_KEYS == REGISTRY_KEYS == MATRIX_KEYS):
    raise RuntimeError("Canonical model-role set, registry, and deployment matrix disagree")
if len(REGISTRY_KEYS) != 18:
    raise RuntimeError("Unexpected canonical model-role count")
for key in sorted(REGISTRY_KEYS):
    entry = ENTRY_BY_KEY[key]
    matrix = MATRIX_BY_KEY[key]
    if entry["repositoryId"] != matrix["hf_repository"] or (entry.get("immutableRevision") or "UNKNOWN") != matrix["immutable_revision"]:
        raise RuntimeError(f"Registry/deployment identity disagreement for {key}")
    normalize = lambda value: "".join(character for character in value.lower() if character.isalnum())
    if normalize(entry["status"]) != normalize(matrix["current_status"]):
        raise RuntimeError(f"Registry/deployment status disagreement for {key}")
    expected_deployment_prefix = {
        "hf_serverless": "hfserverless",
        "hf_inference_endpoint": "hfinferenceendpoint",
        "private_hf_repo_plus_hf_endpoint": "privatehfrepohfinferenceendpoint",
    }[entry["deploymentMode"]]
    if not normalize(matrix["target_deployment"]).startswith(expected_deployment_prefix):
        raise RuntimeError(f"Registry/deployment class disagreement for {key}")
if ARCH["model_assignments"]["link_url_primary"]["label_map"] != {
    "LABEL_0": "benign", "LABEL_1": "defacement", "LABEL_2": "malware", "LABEL_3": "phishing"
}:
    raise RuntimeError("URLBERT label contract mismatch")
if ARCH["inference_receipt"]["schema_version"] != "inference_receipt.v2":
    raise RuntimeError("Receipt v2 is required")


PW, PH = landscape(A4)
NAVY = colors.HexColor("#0F172A")
SLATE = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#CBD5E1")
PAPER = colors.HexColor("#F8FAFC")
TEAL = colors.HexColor("#0F766E")
TEAL_BG = colors.HexColor("#CCFBF1")
BLUE = colors.HexColor("#1D4ED8")
BLUE_BG = colors.HexColor("#DBEAFE")
PURPLE = colors.HexColor("#7E22CE")
PURPLE_BG = colors.HexColor("#F3E8FF")
AMBER = colors.HexColor("#B45309")
AMBER_BG = colors.HexColor("#FEF3C7")
RED = colors.HexColor("#B91C1C")
RED_BG = colors.HexColor("#FEE2E2")
GREEN = colors.HexColor("#15803D")
GREEN_BG = colors.HexColor("#DCFCE7")
GRAY_BG = colors.HexColor("#F1F5F9")

VERA = Path(__import__("reportlab").__file__).resolve().parent / "fonts"
pdfmetrics.registerFont(TTFont("VT", str(VERA / "Vera.ttf")))
pdfmetrics.registerFont(TTFont("VTB", str(VERA / "VeraBd.ttf")))

STYLES = {
    "cell": ParagraphStyle("cell", fontName="VT", fontSize=6.1, leading=7.5, textColor=SLATE),
    "cell_b": ParagraphStyle("cell_b", fontName="VTB", fontSize=6.1, leading=7.5, textColor=NAVY),
    "head": ParagraphStyle("head", fontName="VTB", fontSize=6.1, leading=7.5, textColor=colors.white),
    "tiny": ParagraphStyle("tiny", fontName="VT", fontSize=5.2, leading=6.3, textColor=SLATE),
    "url": ParagraphStyle("url", fontName="VT", fontSize=5.2, leading=6.3, textColor=BLUE),
}

KIND_STYLE = {
    "input": (SLATE, colors.white),
    "det": (BLUE, BLUE_BG),
    "hf": (PURPLE, PURPLE_BG),
    "private": (AMBER, AMBER_BG),
    "evidence": (TEAL, TEAL_BG),
    "db": (SLATE, GRAY_BG),
    "policy": (GREEN, GREEN_BG),
    "failure": (RED, RED_BG),
    "outcome": (NAVY, colors.white),
}

PAGE_SPECS: list[dict] = []


def clean(value: object) -> str:
    return str(value).replace("\u2013", "-").replace("\u2014", "-").replace("\u2192", "->").replace("\u2260", "!=")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def paragraph(text: str, style: str = "cell") -> Paragraph:
    return Paragraph(clean(text), STYLES[style])


def header(c: canvas.Canvas, page_no: int, title: str, section: str) -> None:
    c.setFillColor(NAVY)
    c.rect(0, PH - 38, PW, 38, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("VTB", 8)
    c.drawString(30, PH - 23, "VERITRUST  |  END-TO-END DETECTION FLOWS")
    c.setFont("VT", 7)
    c.drawRightString(PW - 30, PH - 23, section.upper())
    c.setFillColor(MUTED)
    c.setFont("VT", 6.5)
    c.drawString(30, 17, "Canonical source: Research/Architecture_Source_of_Truth.yaml  |  Research cutoff: 16 Aug 2026")
    c.drawRightString(PW - 30, 17, f"Page {page_no}")
    c.setFillColor(NAVY)
    c.setFont("VTB", 18)
    c.drawString(34, PH - 69, title)
    c.setStrokeColor(colors.HexColor("#F97316"))
    c.setLineWidth(1.5)
    c.line(34, PH - 78, PW - 34, PH - 78)


def fit_lines(text: str, font: str, size: float, width: float, max_lines: int = 7) -> list[str]:
    raw_words = clean(text).split()
    words: list[str] = []
    for raw_word in raw_words:
        if pdfmetrics.stringWidth(raw_word, font, size) <= width:
            words.append(raw_word)
            continue
        chunk = ""
        for character in raw_word:
            trial = chunk + character
            if chunk and pdfmetrics.stringWidth(trial, font, size) > width:
                words.append(chunk)
                chunk = character
            else:
                chunk = trial
        if chunk:
            words.append(chunk)
    lines: list[str] = []
    current = ""
    for word in words:
        trial = (current + " " + word).strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][:-3] + "..." if len(lines[-1]) > 3 else "..."
    return lines


def draw_box(c: canvas.Canvas, x: float, y: float, w: float, h: float, text: str, kind: str = "det", font_size: float = 7.2) -> None:
    stroke, fill = KIND_STYLE[kind]
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
    c.setFillColor(stroke)
    c.setFont("VTB", font_size)
    lines = fit_lines(text, "VTB", font_size, w - 12, max(2, int((h - 8) / (font_size + 1.5))))
    total = len(lines) * (font_size + 1.5)
    cursor = y + (h + total) / 2 - font_size
    for line in lines:
        c.drawCentredString(x + w / 2, cursor, line)
        cursor -= font_size + 1.5


def draw_arrow(c: canvas.Canvas, x1: float, y1: float, x2: float, y2: float, label: str = "") -> None:
    c.setStrokeColor(MUTED)
    c.setFillColor(MUTED)
    c.setLineWidth(1.1)
    c.line(x1, y1, x2, y2)
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    for delta in (2.55, -2.55):
        c.line(x2, y2, x2 + 7 * math.cos(angle + delta), y2 + 7 * math.sin(angle + delta))
    if label:
        c.setFont("VT", 5.7)
        c.setFillColor(SLATE)
        c.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 4, clean(label))


def draw_callout(c: canvas.Canvas, x: float, y: float, w: float, text: str, kind: str = "evidence", h: float = 40) -> None:
    stroke, fill = KIND_STYLE[kind]
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=1)
    c.setFillColor(stroke)
    c.setFont("VTB", 7.5)
    lines = fit_lines(text, "VTB", 7.5, w - 16, max(2, int(h / 9)))
    cursor = y + h - 13
    for line in lines:
        c.drawString(x + 8, cursor, line)
        cursor -= 9


def draw_flow_rows(c: canvas.Canvas, rows: list[list[tuple[str, str]]], top: float = 492, bottom: float = 64) -> None:
    gap_y = 22
    row_h = (top - bottom - gap_y * (len(rows) - 1)) / len(rows)
    previous: tuple[float, float, float, float] | None = None
    for row_index, row in enumerate(rows):
        y = top - (row_index + 1) * row_h - row_index * gap_y
        gap_x = 14
        w = (PW - 68 - gap_x * (len(row) - 1)) / len(row)
        current_boxes = []
        for index, (text, kind) in enumerate(row):
            x = 34 + index * (w + gap_x)
            draw_box(c, x, y, w, row_h, text, kind, 7 if len(row) <= 4 else 6.5)
            current_boxes.append((x, y, w, row_h))
            if index:
                prev = current_boxes[index - 1]
                draw_arrow(c, prev[0] + prev[2], prev[1] + prev[3] / 2, x, y + row_h / 2)
        if previous:
            target = current_boxes[0]
            draw_arrow(c, previous[0] + previous[2] / 2, previous[1], target[0] + target[2] / 2, target[1] + target[3], "next")
        previous = current_boxes[-1]


def draw_panel(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, steps: list[tuple[str, str]], note: str = "") -> None:
    c.setFillColor(PAPER)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.setFont("VTB", 10)
    c.drawString(x + 10, y + h - 20, clean(title))
    top = y + h - 34
    note_h = 30 if note else 4
    usable = top - y - note_h - 8
    gap = 7
    box_h = (usable - gap * (len(steps) - 1)) / len(steps)
    for idx, (text, kind) in enumerate(steps):
        by = top - (idx + 1) * box_h - idx * gap
        draw_box(c, x + 10, by, w - 20, box_h, text, kind, 6.4)
        if idx:
            prev_y = top - idx * box_h - (idx - 1) * gap
            draw_arrow(c, x + w / 2, prev_y, x + w / 2, by + box_h)
    if note:
        c.setFillColor(MUTED)
        c.setFont("VT", 5.8)
        for i, line in enumerate(fit_lines(note, "VT", 5.8, w - 20, 3)):
            c.drawString(x + 10, y + 17 - i * 7, line)


def draw_panels(c: canvas.Canvas, panels: list[dict], top: float = 492, bottom: float = 54) -> None:
    gap = 12
    w = (PW - 68 - gap * (len(panels) - 1)) / len(panels)
    for idx, panel in enumerate(panels):
        draw_panel(c, 34 + idx * (w + gap), bottom, w, top - bottom, panel["title"], panel["steps"], panel.get("note", ""))


def draw_table(c: canvas.Canvas, headers: list[str], rows: list[list[object]], x: float = 34, y_top: float = 492, width: float = PW - 68, col_widths: list[float] | None = None, font: str = "cell", max_height: float = 420) -> float:
    if col_widths is None:
        col_widths = [width / len(headers)] * len(headers)
    data = [[paragraph(f"<b>{clean(value)}</b>", "head") for value in headers]]
    for row in rows:
        cells = []
        for value in row:
            string = clean(value)
            style = "url" if string.startswith("https://") else font
            if string.startswith("https://"):
                string = f'<link href="{string}">{string}</link>'
            cells.append(paragraph(string, style))
        data.append(cells)
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_BG]),
    ]))
    tw, th = table.wrap(width, max_height)
    if th > max_height:
        raise RuntimeError(f"Table exceeds page height: {th} > {max_height}")
    table.drawOn(c, x, y_top - th)
    return th


def add_spec(title: str, section: str, layout: str, diagrams: int, **kwargs: object) -> None:
    PAGE_SPECS.append({"title": title, "section": section, "layout": layout, "diagrams": diagrams, **kwargs})


def url_for(repo: str) -> str:
    return "" if repo.startswith("veritrust-private/") else f"https://huggingface.co/{repo}"


def model_kind(entry: dict) -> str:
    return "private" if entry["repositoryId"].startswith("veritrust-private/") else "public"


def training_required(entry: dict) -> str:
    return "YES" if entry["status"] in {"requires_training", "requires_research_and_training"} else "NO / qualification only"


PUBLIC_BASES = {
    "microsoft/mdeberta-v3-base": "base for private multilingual phishing classifier",
    "microsoft/deberta-v3-small": "base for private page-text classifier",
}


def write_link_map() -> list[dict[str, str]]:
    rows = []
    for entry in sorted(ENTRIES, key=lambda row: row["modelKey"]):
        matrix = MATRIX_BY_KEY[entry["modelKey"]]
        rows.append({
            "domain": entry["modelKey"].split(".")[0],
            "model_key": entry["modelKey"],
            "repository_id": entry["repositoryId"],
            "HF_URL": url_for(entry["repositoryId"]),
            "revision": entry.get("immutableRevision") or "UNKNOWN",
            "role": entry["scientificRole"],
            "deployment": entry["deploymentMode"],
            "status": entry["status"],
        })
    for repo, role in PUBLIC_BASES.items():
        decision = next(row for row in DECISIONS if row["repository"] == repo)
        rows.append({
            "domain": "phishing" if "mdeberta" in repo else "link",
            "model_key": "BASE_ONLY",
            "repository_id": repo,
            "HF_URL": url_for(repo),
            "revision": decision["immutable_revision"],
            "role": role,
            "deployment": "private fine-tune then HF Endpoint",
            "status": "base_checkpoint_not_classifier",
        })
    with OUT_LINKS.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return rows


LINK_ROWS = write_link_map()
PUBLIC_ROWS = [row for row in LINK_ROWS if row["HF_URL"]]
PRIVATE_ENTRIES = [row for row in ENTRIES if model_kind(row) == "private"]


def build_specs() -> None:
    add_spec("VeriTrust end-to-end detection flows", "Cover", "cover", 1)
    add_spec("Executive visual summary", "System", "panels", 4, panels=[
        {"title": "Deepfake", "steps": [("Media + quality", "det"), ("Independent HF evidence lanes", "hf"), ("Sufficiency + Gateway", "policy")], "note": "Full-frame, face manipulation, forensic, OOD, provenance."},
        {"title": "Phishing", "steps": [("Message + auth evidence", "det"), ("Text / multilingual / structured", "hf"), ("Relationships + Gateway", "policy")], "note": "Scientific primary remains benchmark-gated."},
        {"title": "Link", "steps": [("URL identity + SSRF", "det"), ("URL / page / brand evidence", "hf"), ("Enrichment + Gateway", "policy")], "note": "Brand similarity is supporting evidence only."},
        {"title": "Unified Gateway", "steps": [("Registry-before-dispatch", "db"), ("Evidence + receipt validation", "evidence"), ("Deterministic final policy", "policy")], "note": "Models never own the final action."},
    ])
    add_spec("Diagram legend and non-negotiable boundaries", "System", "legend", 2)
    add_spec("Global VeriTrust detection flow", "System", "flow", 1, rows=[
        [("User / API / Web CLI / PowerShell", "input"), ("Authentication + tenant/policy", "det"), ("Input validation + normalization", "det"), ("Artifact graph", "db")],
        [("Specialist routing", "policy"), ("Deepfake | Phishing | Link", "hf"), ("Expected-evidence ledger", "db"), ("Persist registry resolution", "db")],
        [("HF-managed inference", "hf"), ("inference_receipt.v2", "evidence"), ("Raw output validation", "det"), ("Normalize + calibrate", "det")],
        [("Structured evidence", "evidence"), ("Sufficiency", "policy"), ("Deterministic correlation", "policy"), ("Gateway action + audit", "outcome")],
    ], callout="Learned models produce specialist evidence. Only versioned Gateway policy produces allow/review/hold/block/uncertain/unsupported/failed.")
    add_spec("Hugging Face-managed execution boundary", "System", "hf_boundary", 2)

    add_spec("Deepfake: complete overview", "Deepfake", "panels", 4, panels=[
        {"title": "Canonical media", "steps": [("MIME / bytes / decode", "det"), ("Orientation + quality", "det"), ("Artifact identity + SHA-256", "db"), ("Privacy + expected evidence", "policy")]},
        {"title": "Full-frame", "steps": [("CommFor-384 candidate", "hf"), ("CommFor-224 shadow", "hf"), ("Synthetic evidence", "evidence")]},
        {"title": "Face pipeline", "steps": [("YuNet boxes + landmarks", "private"), ("Alignment + stable face ID", "det"), ("Yermandy per-face", "hf"), ("Face evidence", "evidence")]},
        {"title": "Independent lanes", "steps": [("Private residual/SRM/DCT", "private"), ("Private SigLIP2 OOD head", "private"), ("Quality + provenance", "det"), ("Gateway", "policy")]},
    ])
    add_spec("Deepfake lane A: full-frame synthetic evidence", "Deepfake", "flow", 2, rows=[
        [("Canonical full image", "input"), ("Persist registry resolution", "db"), ("OwensLab/commfor-model-384", "hf"), ("HF Inference Endpoint", "hf")],
        [("Raw full-frame output", "evidence"), ("Exact label normalization", "det"), ("Calibration artifact", "det"), ("deepfake.full_frame.synthetic", "evidence")],
        [("CommFor-224", "hf"), ("Same-family latency shadow", "evidence"), ("NO decision authority", "failure"), ("Not independent forensics", "failure")],
    ], callout="CommFor-384 is a primary candidate, not production-qualified. CommFor-224 is shadow-only and cannot count as independent forensic evidence.")
    add_spec("Deepfake lane B: face manipulation pipeline", "Deepfake", "flow", 2, rows=[
        [("Canonical full image", "input"), ("Private HF face bundle", "private"), ("Pinned YuNet component", "private"), ("Boxes + 5 landmarks", "det")],
        [("Face quality", "det"), ("five_point_similarity_transform", "det"), ("Canonical crop + stable face_id", "db"), ("Yermandy exact revision", "hf")],
        [("Per-face raw output", "evidence"), ("Normalize", "det"), ("Calibrate", "det"), ("Per-face evidence", "evidence")],
        [("Declared aggregation policy", "policy"), ("deepfake.face.manipulation", "evidence"), ("Composite receipt v2", "evidence"), ("Gateway sufficiency", "policy")],
    ], callout="YuNet is a non-HF-source preprocessing/detection component packaged inside the approved HF-managed private pipeline. It is not the deepfake classifier.")
    add_spec("Deepfake lanes C and D: forensic independence + OOD", "Deepfake", "panels", 2, panels=[
        {"title": "Independent forensic model", "steps": [("Residual / noise", "det"), ("SRM-style representation", "det"), ("DCT / frequency", "det"), ("Private VeriTrust model", "private"), ("Private HF repo + Endpoint", "private"), ("Independent evidence", "evidence")], "note": "Model is not trained or qualified. No public/private URL is fabricated."},
        {"title": "OOD / uncertainty", "steps": [("Image / face representation", "input"), ("SigLIP2 base", "hf"), ("Private trained OOD head", "private"), ("Distance / coverage", "det"), ("OOD evidence", "evidence"), ("Abstention / sufficiency", "policy")], "note": "SigLIP2 alone is not the OOD detector."},
    ])
    add_spec("Deepfake final correlation and degraded-state flow", "Deepfake", "panels", 3, panels=[
        {"title": "Evidence join", "steps": [("Full-frame synthetic", "evidence"), ("Face manipulation", "evidence"), ("Independent forensic", "evidence"), ("OOD + quality + provenance", "evidence"), ("Sufficiency", "policy"), ("Gateway", "policy")]},
        {"title": "No face / crop failure", "steps": [("Zero faces", "det"), ("Face = not_applicable", "evidence"), ("NOT benign", "failure"), ("Crop failure = failed/insufficient", "failure"), ("Never send full image to face classifier", "failure")]},
        {"title": "Provider / contract failure", "steps": [("Timeout = timed_out", "failure"), ("Unknown label = failed/unsupported", "failure"), ("High OOD = reject/abstain by policy", "failure"), ("Recalculate sufficiency", "policy"), ("Review/hold/uncertain", "outcome")]},
    ])
    add_spec("Deepfake model and evidence map", "Deepfake", "domain_table", 1, domain="deepfake")

    add_spec("Phishing: complete overview", "Phishing", "panels", 4, panels=[
        {"title": "Canonical message", "steps": [("RFC5322 / text / receiver event", "input"), ("Headers + body + URLs", "det"), ("Unicode + thread separation", "det"), ("Privacy + identity", "db")]},
        {"title": "Fast candidate", "steps": [("PhishLens", "hf"), ("ealvaradob", "hf"), ("Signed benchmark", "policy"), ("Fast text evidence", "evidence")]},
        {"title": "Independent lanes", "steps": [("mDeBERTa private fine-tune", "private"), ("Structured GBDT", "private"), ("Approved shadows", "hf"), ("URL specialist", "evidence")]},
        {"title": "Gateway", "steps": [("Expected evidence", "db"), ("Sufficiency", "policy"), ("Relationships", "policy"), ("Final action", "outcome")]},
    ])
    add_spec("Phishing fast-text qualification competition", "Phishing", "benchmark", 2)
    add_spec("Phishing multilingual, structured, and shadow lanes", "Phishing", "panels", 3, panels=[
        {"title": "Multilingual", "steps": [("Locale-aware subject/body", "det"), ("microsoft/mdeberta-v3-base", "hf"), ("VeriTrust fine-tuned head", "private"), ("Private HF Endpoint", "private"), ("Multilingual evidence", "evidence")], "note": "Base checkpoint alone is not a phishing classifier."},
        {"title": "Structured evidence", "steps": [("SPF/DKIM/DMARC/ARC", "det"), ("Identity + domain relations", "det"), ("Private phishing GBDT", "private"), ("Custom HF Endpoint", "private"), ("Structured evidence", "evidence")]},
        {"title": "Shadows", "steps": [("Cybersectony: shadow-only", "hf"), ("Ambiguous label contract gate", "failure"), ("ModernBERT: semantic shadow", "hf"), ("No policy authority", "failure"), ("Error analysis only", "evidence")]},
    ])
    add_spec("Phishing final evidence and degraded-state flow", "Phishing", "panels", 3, panels=[
        {"title": "Evidence join", "steps": [("Chosen fast text", "evidence"), ("Multilingual", "evidence"), ("Structured + auth", "evidence"), ("URL specialist", "evidence"), ("Quality / OOD", "evidence"), ("Sufficiency + Gateway", "policy")]},
        {"title": "Missing evidence", "steps": [("Explicit lifecycle status", "failure"), ("No zero probability", "failure"), ("No alternate model substitution", "failure"), ("Relationships recalculate", "policy"), ("Review/hold/uncertain", "outcome")]},
        {"title": "Final output", "steps": [("Validated envelopes only", "det"), ("Never average incomparable scores", "failure"), ("Versioned correlation", "policy"), ("Tenant policy", "policy"), ("Persist + audit", "db")]},
    ])
    add_spec("Phishing model and evidence map", "Phishing", "domain_table", 1, domain="phishing")

    add_spec("Link detection: complete overview", "Link", "panels", 4, panels=[
        {"title": "URL identity", "steps": [("Preserve raw URL", "input"), ("Parse + canonical model form", "det"), ("PSL / IDNA / confusables", "det"), ("SSRF + redirect policy", "policy")]},
        {"title": "Fast learned", "steps": [("URLBERT v4", "hf"), ("Exact four-label map", "det"), ("Calibrated URL evidence", "evidence")]},
        {"title": "Deep learned", "steps": [("Private GBDT", "private"), ("Pirocheto research-only", "hf"), ("Page text private", "private"), ("SigLIP2 brand", "hf")]},
        {"title": "External evidence", "steps": [("DNS/RDAP/TLS", "det"), ("Reputation + sandbox", "det"), ("Expected evidence", "db"), ("Gateway", "policy")]},
    ])
    add_spec("Link lane A: URLBERT four-class contract", "Link", "flow", 2, rows=[
        [("Raw URL preserved", "input"), ("Canonical model URL", "det"), ("Persist registry resolution", "db"), ("Pinned HF Endpoint", "hf")],
        [("URLBERT raw four-class output", "evidence"), ("LABEL_0 benign", "det"), ("LABEL_1 defacement", "det"), ("LABEL_2 malware", "det"), ("LABEL_3 phishing", "det")],
        [("Normalize", "det"), ("Calibrate", "det"), ("URL classification evidence", "evidence"), ("Gateway", "policy")],
    ], callout="FORBIDDEN: the old reversed LABEL_1/LABEL_3 mapping. Exact revision 917ded0543a630d6e82570bb01ae692f6cbb95f1 is the research contract.")
    add_spec("Link lanes B, C, and D: structured, shadow, page text", "Link", "panels", 3, panels=[
        {"title": "Private structured GBDT", "steps": [("PSL/IDN/lexical/relations", "det"), ("Feature schema", "det"), ("Private URL GBDT", "private"), ("Custom HF Endpoint", "private"), ("Independent evidence", "evidence")]},
        {"title": "Pirocheto research lane", "steps": [("Reviewed safe ONNX representation", "det"), ("Custom HF Endpoint", "hf"), ("Research-only lexical output", "evidence"), ("No unsafe pickle", "failure"), ("No policy authority", "failure")]},
        {"title": "Page text", "steps": [("Isolated browser", "det"), ("Sanitized title/text/forms", "det"), ("NO raw script trust", "failure"), ("Private DeBERTa classifier", "private"), ("Page evidence", "evidence")]},
    ])
    add_spec("Link lane E + live enrichment: brand evidence", "Link", "panels", 2, panels=[
        {"title": "Screenshot / brand", "steps": [("Safe isolated browser", "det"), ("Bounded screenshot + SHA-256", "db"), ("SigLIP2 embedding", "hf"), ("Versioned reference index", "db"), ("Nearest approved references", "det"), ("Brand visual evidence", "evidence")], "note": "Brand similarity != phishing verdict."},
        {"title": "Non-model enrichment", "steps": [("DNS / RDAP / TLS", "det"), ("Redirect chain", "det"), ("Licensed domain age", "det"), ("Reputation connectors", "det"), ("Browser/form behavior", "det"), ("Network/provenance evidence", "evidence")], "note": "External intelligence is not a Hugging Face model."},
    ])
    add_spec("Link final evidence and degraded-state flow", "Link", "panels", 3, panels=[
        {"title": "Evidence join", "steps": [("URLBERT", "evidence"), ("Structured GBDT", "evidence"), ("Page + brand", "evidence"), ("Enrichment + sandbox", "evidence"), ("Quality", "evidence"), ("Sufficiency + Gateway", "policy")]},
        {"title": "Network safety", "steps": [("Resolve destination", "det"), ("Validate SSRF policy", "policy"), ("Connect", "det"), ("Revalidate every redirect", "policy"), ("Block unresolved/forbidden", "failure")]},
        {"title": "Failure semantics", "steps": [("Timeout/unavailable typed", "failure"), ("Unsupported page typed", "failure"), ("Brand index unavailable typed", "failure"), ("Recalculate sufficiency", "policy"), ("Review/hold/uncertain", "outcome")]},
    ])
    add_spec("Link model and evidence map", "Link", "domain_table", 1, domain="link")

    add_spec("Unified Gateway: control and evidence planes", "Gateway", "panels", 3, panels=[
        {"title": "Control plane", "steps": [("Tenant + policy", "policy"), ("Registry entries + deployments", "db"), ("Pre-dispatch resolution", "db"), ("Promotion/rollback", "policy")]},
        {"title": "Evidence plane", "steps": [("Artifact graph", "db"), ("Expected evidence", "db"), ("HF dispatch + receipt", "hf"), ("Normalize/calibrate", "det"), ("Evidence lifecycle", "evidence")]},
        {"title": "Decision plane", "steps": [("Sufficiency", "policy"), ("Cross-evidence relationships", "policy"), ("Deterministic correlation", "policy"), ("Tenant policy", "policy"), ("Action + audit", "outcome")]},
    ])
    add_spec("Unified Gateway: detailed implementation flow", "Gateway", "flow", 2, rows=[
        [("Request + investigation_id", "input"), ("Artifact graph", "db"), ("Declared specialist roles", "policy"), ("Expected evidence ledger", "db")],
        [("Registry resolution", "db"), ("Deployment resolution", "db"), ("PERSIST BEFORE inference", "db"), ("Model dispatch", "hf")],
        [("HF execution", "hf"), ("Receipt v2", "evidence"), ("Raw/schema validation", "det"), ("Normalization + calibration", "det")],
        [("Quality/OOD/lifecycle", "evidence"), ("Sufficiency + relationships", "policy"), ("Deterministic correlation", "policy"), ("allow/review/hold/block/...", "outcome")],
    ], callout="Canonical final action enum: allow, review, hold, block, uncertain, unsupported, failed. WARN and ERROR are not invented canonical policy states.")
    add_spec("Expected-evidence lifecycle: 16 canonical states", "Gateway", "lifecycle", 2)
    add_spec("Evidence semantic contract", "Gateway", "evidence_contract", 2)
    add_spec("Inference receipt v2: provenance contract", "Gateway", "receipt", 2)
    add_spec("Composite face-pipeline receipt", "Gateway", "composite_receipt", 2)

    keys = sorted(REGISTRY_KEYS)
    for index in range(0, len(keys), 3):
        add_spec(f"Model registry map ({index + 1}-{min(index + 3, len(keys))} of {len(keys)})", "Model map", "registry_cards", 3, keys=keys[index:index + 3])
    add_spec("Public Hugging Face model quick reference", "Model map", "public_table", 1)
    add_spec("Private VeriTrust learned roles: training roadmap", "Model map", "private_roadmap", 2)
    add_spec("Deployment topology", "Operations", "deployment", 2)
    add_spec("Sensitive-data privacy flows", "Operations", "privacy", 4)
    add_spec("Failure behavior master flow", "Operations", "failure", 2)
    add_spec("Illustrative decision examples - no thresholds", "Operations", "examples", 3)
    add_spec("Implementation sequence", "Implementation", "implementation", 2)
    add_spec("What VeriTrust actually runs per request", "Implementation", "actual_runs", 3)
    add_spec("What each model does - simple language", "Reference", "simple_language", 1)
    add_spec("What is not a model", "Reference", "not_model", 2)
    add_spec("Final readiness map", "Reference", "status", 1)
    add_spec("Official Hugging Face sources", "Sources", "sources_public", 1)
    add_spec("Canonical package sources and terminology", "Sources", "sources_package", 1)


def render_cover(c: canvas.Canvas, page_no: int) -> None:
    c.setFillColor(NAVY)
    c.rect(0, 0, PW, PH, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("VTB", 27)
    c.drawString(52, PH - 120, "VeriTrust")
    c.setFont("VTB", 24)
    c.drawString(52, PH - 158, "End-to-End Detection Flows")
    c.drawString(52, PH - 190, "and Hugging Face Model Map")
    c.setFillColor(colors.HexColor("#99F6E4"))
    c.setFont("VT", 12)
    c.drawString(52, PH - 222, "Frozen architecture implementation reference")
    draw_callout(c, 52, 165, PW - 104,
                 "AUTHORITATIVE BOUNDARY: VeriTrust performs orchestration, validation, evidence, calibration and deterministic policy. All learned production inference runs on qualified Hugging Face-managed infrastructure. Third-party Inference Providers are DISABLED_BY_DEFAULT.",
                 "evidence", 78)
    c.setFillColor(colors.white)
    c.setFont("VT", 9)
    c.drawString(52, 118, f"Canonical roles: {len(REGISTRY_KEYS)}  |  Lifecycle states: {len(ARCH['evidence_contract']['status_enum'])}  |  Receipt: {ARCH['inference_receipt']['schema_version']}")
    c.setFont("VT", 7)
    c.drawString(52, 82, "Generated only from the frozen Research package; no operational qualification result is implied.")
    c.drawRightString(PW - 52, 32, f"Page {page_no}")


def render_legend(c: canvas.Canvas) -> None:
    kinds = [("INPUT", "input"), ("DETERMINISTIC", "det"), ("HF LEARNED", "hf"), ("PRIVATE LEARNED", "private"), ("EVIDENCE", "evidence"), ("PERSISTENCE", "db"), ("GATEWAY POLICY", "policy"), ("FAILURE", "failure"), ("OUTCOME", "outcome")]
    for idx, (label, kind) in enumerate(kinds):
        row, col = divmod(idx, 5)
        draw_box(c, 44 + col * 153, 360 - row * 82, 135, 52, label, kind, 7)
    draw_callout(c, 44, 210, PW - 88, "Models emit evidence. They do not directly authorize allow/block. Raw output, normalized semantics, and calibrated probability remain separate nullable fields.", "evidence", 52)
    draw_callout(c, 44, 135, PW - 88, "CURRENT vs TARGET: this PDF documents the frozen target architecture. Candidate, shadow, private/training-required and external-gate statuses remain explicit.", "failure", 52)
    draw_callout(c, 44, 60, PW - 88, "No learned production inference runs locally, in browser code, in Vercel, in platform workers, or on VeriTrust-owned model servers.", "policy", 52)


def render_hf_boundary(c: canvas.Canvas) -> None:
    draw_panel(c, 38, 84, 240, 390, "VERITRUST", [
        ("Registry + deployment resolution", "db"), ("Persist before dispatch", "db"), ("Orchestration + validation", "det"),
        ("Normalization + calibration", "det"), ("Evidence + sufficiency", "evidence"), ("Deterministic Gateway policy", "policy")
    ], "VeriTrust owns control/evidence/policy; never learned execution.")
    draw_panel(c, 300, 84, 240, 390, "QUALIFIED HF PATH", [
        ("Exact hf-inference mapping fresh?", "policy"), ("YES: qualified HF-operated hf-inference", "hf"),
        ("NO: pinned HF Inference Endpoint", "hf"), ("Custom/fine-tuned/private?", "policy"),
        ("Private HF repo + HF Endpoint", "private"), ("Receipt proves exact execution", "evidence")
    ], "If exact serverless revision cannot be proven, use a pinned Endpoint.")
    draw_panel(c, 562, 84, 240, 390, "FORBIDDEN NORMAL PATH", [
        ("Third-party Inference Providers", "failure"), ("DISABLED_BY_DEFAULT", "failure"),
        ("No automatic failover", "failure"), ("No local weights", "failure"),
        ("No alternate scientific model", "failure"), ("Explicit future exception only", "policy")
    ], "Exception requires product-owner architecture decision plus security/privacy/legal approval.")


def render_benchmark(c: canvas.Canvas) -> None:
    draw_panel(c, 42, 180, 225, 290, "Candidate A", [("Sonje03/phishlens-distilbert", "hf"), ("Email-specific fast text", "evidence"), ("candidate_promotion_gated", "failure")])
    draw_panel(c, 575, 180, 225, 290, "Candidate B", [("ealvaradob/bert-finetuned-phishing", "hf"), ("Broader classifier", "evidence"), ("candidate_pending_benchmark", "failure")])
    draw_panel(c, 300, 115, 240, 360, "SIGNED VERITRUST BENCHMARK", [
        ("Held-out campaign/time split", "det"), ("Label-contract validation", "det"), ("Calibration", "det"),
        ("Latency + cost", "det"), ("Robustness slices", "det"), ("Scientific primary selection", "policy")
    ], "Serverless availability does not decide scientific primary.")
    draw_arrow(c, 267, 325, 300, 325, "compete")
    draw_arrow(c, 575, 325, 540, 325, "compete")
    draw_callout(c, 42, 72, 758, "PRIMARY = UNRESOLVED / PROMOTION-GATED until signed VeriTrust benchmark and calibration evidence exist. No winner is fabricated.", "failure", 52)


def render_domain_table(c: canvas.Canvas, domain: str) -> None:
    rows = []
    for entry in ENTRIES:
        if entry["modelKey"].split(".")[0] != domain:
            continue
        matrix = MATRIX_BY_KEY[entry["modelKey"]]
        rows.append([entry["modelKey"], entry["scientificRole"], entry["repositoryId"], entry.get("immutableRevision") or "UNKNOWN", entry["deploymentMode"], entry["status"], "Evidence only; Gateway owns final action"])
    draw_table(c, ["Model key", "Scientific role", "Repository", "Revision", "Deployment", "Status", "Authority"], rows,
               col_widths=[130, 93, 135, 92, 104, 93, 117], font="tiny")


def render_lifecycle(c: canvas.Canvas) -> None:
    states = ARCH["evidence_contract"]["status_definitions"]
    draw_flow_rows(c, [[("PLANNED", "db"), ("DISPATCHED", "hf"), ("RUNNING", "hf"), ("COMPLETED", "evidence")]], top=492, bottom=410)
    rows = []
    for state in ARCH["evidence_contract"]["status_enum"]:
        d = states[state]
        rows.append([state, str(d["terminal"]), str(d["retry"]), str(d["gateway_may_proceed"]), str(d["human_review"]), d["user_visible"], d["meaning"]])
    draw_table(c, ["State", "Terminal", "Retry", "Gateway may continue", "Review", "User visible", "Meaning"], rows,
               y_top=390, max_height=320, col_widths=[66, 47, 68, 82, 75, 64, 204], font="tiny")


def render_evidence_contract(c: canvas.Canvas) -> None:
    draw_flow_rows(c, [[("MODEL RESPONSE", "hf"), ("raw_output / raw_label / raw_score", "evidence"), ("NORMALIZATION", "det"), ("normalized_label / normalized_score", "evidence")],
                       [("CALIBRATION ARTIFACT", "db"), ("calibrated_probability", "evidence"), ("calibration_version", "db"), ("quality / OOD / sufficiency", "policy")],
                       [("STRUCTURED evidence.v1", "evidence"), ("Expected-evidence ledger", "db"), ("Deterministic correlation", "policy"), ("Gateway action", "outcome")]], top=492, bottom=172)
    draw_callout(c, 50, 92, 742, "RAW SCORE != NORMALIZED SCORE != CALIBRATED PROBABILITY. Every field is separately nullable; missing calibration cannot authorize allow/block.", "failure", 58)


def render_receipt(c: canvas.Canvas) -> None:
    fields = ARCH["inference_receipt"]["required_fields"]
    component_fields = ARCH["inference_receipt"]["component_required_fields"]
    draw_panel(c, 38, 96, 240, 375, "Scientific identity", [("model_key + scientific_role", "evidence"), ("repository_id", "evidence"), ("immutable_revision", "evidence"), ("schemas + preprocessing", "det"), ("qualification_status", "policy")], "What scientific components were intended and executed?")
    draw_panel(c, 301, 96, 240, 375, "Operational identity", [("registry_resolution_id", "db"), ("deployment_id + bundle_id", "db"), ("endpoint identity + revision", "hf"), ("provider_request_id", "hf"), ("attempt + latency + billed_units", "det")], "Where and how was this request executed?")
    draw_panel(c, 564, 96, 240, 375, "Integrity + components[]", [("request_sha256", "det"), ("response_sha256", "det"), ("ordered non-empty components[]", "evidence"), ("completion_status", "evidence"), ("received_at", "db")], "Composite receipts never collapse into a false singular model identity.")
    draw_callout(c, 38, 54, 766, f"Required receipt fields: {len(fields)} | component fields: {len(component_fields)} | legacy v1 accepted only through an explicit read adapter.", "evidence", 32)


def render_composite_receipt(c: canvas.Canvas) -> None:
    components = ARCH["deepfake_contract"]["face_pipeline"]["receipt_components"]
    draw_panel(c, 38, 90, 225, 390, "Bundle", [(ARCH["deepfake_contract"]["face_pipeline"]["deployment_bundle_id"], "db"), ("inference_receipt.v2", "evidence"), ("Ordered components[]", "evidence"), ("No singular collapse", "failure")])
    draw_panel(c, 285, 90, 245, 390, "Component 1 - YuNet", [
        (components[0]["model_key"], "private"), (components[0]["repository_id"], "private"), ("revision/digest UNKNOWN", "failure"),
        (components[0]["preprocessing_version"], "det"), ("execution_order = 1", "db"), (components[0]["qualification_status"], "failure")
    ])
    draw_panel(c, 552, 90, 250, 390, "Component 2 - Yermandy", [
        (components[1]["model_key"], "hf"), (components[1]["repository_id"], "hf"), (components[1]["immutable_revision"], "db"),
        (components[1]["preprocessing_version"], "det"), ("execution_order = 2", "db"), (components[1]["qualification_status"], "failure")
    ])
    draw_arrow(c, 263, 285, 285, 285, "contains")
    draw_arrow(c, 530, 285, 552, 285, "then")


def render_registry_cards(c: canvas.Canvas, keys: list[str]) -> None:
    gap = 12
    w = (PW - 68 - 2 * gap) / 3
    for idx, key in enumerate(keys):
        entry = ENTRY_BY_KEY[key]
        matrix = MATRIX_BY_KEY[key]
        x = 34 + idx * (w + gap)
        y, h = 55, 430
        c.setFillColor(PAPER)
        c.setStrokeColor(PURPLE if model_kind(entry) == "public" else AMBER)
        c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
        c.setFillColor(NAVY)
        c.setFont("VTB", 8.5)
        cursor = y + h - 18
        for line in fit_lines(key, "VTB", 8.5, w - 18, 3):
            c.drawString(x + 9, cursor, line); cursor -= 10
        details = [
            ("Domain / role", f"{key.split('.')[0]} / {entry['scientificRole']}"),
            ("Public/private", model_kind(entry)),
            ("Repository", entry["repositoryId"]),
            ("HF URL", url_for(entry["repositoryId"]) or "Private VeriTrust HF repository - not created / not qualified"),
            ("Revision", entry.get("immutableRevision") or "UNKNOWN"),
            ("Input", entry["inputSchema"]), ("Output", entry["outputSchema"]),
            ("Deployment", entry["deploymentMode"]), ("Status", entry["status"]),
            ("Training required", training_required(entry)), ("Calibration", "required before promotion"),
            ("HF Endpoint", "YES" if entry["deploymentMode"] != "hf_serverless" else "conditional"),
            ("hf-inference", matrix["serverless_eligible"]),
            ("Exact revision gate", matrix["critical_gate"]),
            ("Production qualified", "NO"),
        ]
        cursor -= 3
        c.setFont("VT", 5.7)
        for label, value in details:
            c.setFillColor(MUTED); c.setFont("VTB", 5.7); c.drawString(x + 9, cursor, label + ":")
            c.setFillColor(SLATE); c.setFont("VT", 5.7)
            lines = fit_lines(value, "VT", 5.7, w - 110, 4)
            for line_idx, line in enumerate(lines):
                c.drawString(x + 100, cursor - line_idx * 6.6, line)
            if label == "HF URL" and value.startswith("https://"):
                c.linkURL(value, (x + 98, cursor - max(3, (len(lines) - 1) * 6.6), x + w - 8, cursor + 7), relative=0)
            cursor -= max(8, len(lines) * 6.6)


def render_public_table(c: canvas.Canvas) -> None:
    rows = [[r["domain"], r["repository_id"], r["HF_URL"], r["revision"], r["role"], r["status"]] for r in PUBLIC_ROWS]
    draw_table(c, ["Domain", "Official HF repository", "Clickable URL", "Immutable research revision", "Architectural role", "Status"], rows,
               col_widths=[48, 125, 190, 120, 155, 136], font="tiny")


def render_private_roadmap(c: canvas.Canvas) -> None:
    left = PRIVATE_ENTRIES[:4]
    right = PRIVATE_ENTRIES[4:]
    panels = []
    for group, title in [(left, "Private roles 1-4"), (right, "Private roles 5-8")]:
        steps = [(f"{entry['modelKey']} | {entry['status']}", "private") for entry in group]
        panels.append({"title": title, "steps": steps, "note": "DATA -> TRAIN -> HELD-OUT EVAL -> CALIBRATE -> PRIVATE HF REPO -> IMMUTABLE REVISION -> HF ENDPOINT -> SHADOW -> CANARY -> QUALIFY"})
    draw_panels(c, panels, bottom=120)
    draw_callout(c, 34, 58, PW - 68, "None of these private learned roles is represented as already trained or production-qualified. UNKNOWN revision/digest remains an explicit promotion blocker.", "failure", 44)


def render_deployment(c: canvas.Canvas) -> None:
    draw_panel(c, 38, 100, 245, 370, "VERITRUST CLOUD / APP", [("API + authentication", "det"), ("Database + registry", "db"), ("Queue/orchestration", "db"), ("Evidence + calibration", "evidence"), ("Deterministic Gateway", "policy")])
    draw_panel(c, 300, 100, 230, 370, "NETWORK BOUNDARY", [("TLS + scoped token", "det"), ("Egress allowlist", "policy"), ("Payload minimization", "policy"), ("Deadline/cancellation", "det"), ("Receipt validation", "evidence")])
    draw_panel(c, 547, 100, 257, 370, "HUGGING FACE MANAGED", [("Qualified hf-inference", "hf"), ("Public pinned Endpoints", "hf"), ("Private repositories", "private"), ("Custom/bundled Endpoints", "private"), ("No third-party normal path", "failure")], "One Endpoint may host an intentional bundle; one model does not imply one physical Endpoint.")
    draw_arrow(c, 283, 285, 300, 285, "dispatch")
    draw_arrow(c, 530, 285, 547, 285, "HF learned execution")


def render_privacy(c: canvas.Canvas) -> None:
    panels = []
    for title, rep in [("Email text", "minimum task text + redaction"), ("Images / face crops", "bounded bytes/crops + face IDs"), ("Web screenshots", "sanitized bounded screenshot"), ("URLs", "minimum canonical representation")]:
        panels.append({"title": title, "steps": [("Purpose check", "policy"), (rep, "det"), ("Protected HF dispatch", "hf"), ("No unnecessary logs", "failure"), ("Evidence + retention policy", "db")], "note": "Retention period / region / DPA remain external policy gates."})
    draw_panels(c, panels)


def render_failure(c: canvas.Canvas) -> None:
    draw_flow_rows(c, [[("MODEL REQUEST", "hf"), ("Success?", "policy"), ("Validate schema/labels/receipt", "det"), ("Structured evidence", "evidence")],
                       [("NO: classify failure", "failure"), ("timeout | unavailable | malformed", "failure"), ("privacy | unsupported | budget", "failure"), ("typed lifecycle status", "evidence")],
                       [("Expected-evidence ledger", "db"), ("Recalculate sufficiency", "policy"), ("continue/degrade/review/fail closed", "outcome"), ("Persist attempt + incident", "db")]], top=492, bottom=180)
    draw_callout(c, 42, 92, 758, "NO MODEL FAILURE MAY SILENTLY BECOME benign, zero probability, another model, a heuristic ML result, another provider, or another scientific task.", "failure", 62)


def render_examples(c: canvas.Canvas) -> None:
    draw_panels(c, [
        {"title": "Deepfake (illustrative)", "steps": [("CommFor available", "evidence"), ("Face = not_applicable (no face)", "evidence"), ("Forensic available", "evidence"), ("OOD acceptable", "evidence"), ("Sufficiency + policy", "policy")], "note": "Not applicable is not benign; no threshold is asserted."},
        {"title": "Phishing (illustrative)", "steps": [("Fast text evidence", "evidence"), ("SPF fail", "evidence"), ("Reply-To mismatch", "evidence"), ("Suspicious URL relation", "evidence"), ("Relationship correlation", "policy")], "note": "Do not average incomparable probabilities."},
        {"title": "Link (illustrative)", "steps": [("URLBERT phishing-oriented", "evidence"), ("Young domain", "evidence"), ("Brand similarity", "evidence"), ("Credential form", "evidence"), ("Versioned policy", "policy")], "note": "Conceptual evidence only; no production thresholds."},
    ])


def render_implementation(c: canvas.Canvas) -> None:
    phases = ARCH["rollout"]["phases"]
    draw_flow_rows(c, [[(phases[0], "det"), (phases[1], "db"), (phases[2], "hf")],
                       [(phases[3], "evidence"), (phases[4], "policy"), (phases[5], "outcome")],
                       [(phases[6], "private"), ("Rollback: atomic registry pointer", "db"), ("In-flight receipt stays bound", "evidence")]], top=492, bottom=150)
    draw_callout(c, 44, 80, 754, "Promotion gates: contract, golden tests, benchmark, calibration, robustness, privacy, security, license, load, cost, observability and rollback rehearsal.", "policy", 52)


def render_actual_runs(c: canvas.Canvas) -> None:
    draw_panels(c, [
        {"title": "LINK - FAST -> OPTIONAL DEEP", "steps": [("Normalize + deterministic URL evidence", "det"), ("URLBERT", "hf"), ("Gateway fast decision if sufficient", "policy"), ("Optional: GBDT/page/SigLIP/live", "private"), ("Hybrid/async update", "evidence")], "note": "Not every registered role runs on every URL."},
        {"title": "PHISHING - FAST -> HYBRID", "steps": [("Message + auth preprocessing", "det"), ("Chosen fast classifier", "hf"), ("URL specialist", "evidence"), ("Gateway if sufficient", "policy"), ("Optional multilingual/structured/shadow", "private")], "note": "Scientific primary awaits qualification benchmark."},
        {"title": "DEEPFAKE - ASYNC DEEP", "steps": [("Quality + artifact", "det"), ("CommFor-384 candidate", "hf"), ("Faces only: YuNet -> Yermandy", "private"), ("Policy-selected forensic/OOD", "private"), ("Gateway after sufficient terminals", "policy")], "note": "Per-stage terminal evidence; no silent substitution."},
    ])


def render_simple_language(c: canvas.Canvas) -> None:
    rows = [
        ["CommFor-384", "Looks at the complete image for patterns associated with synthetic/generated imagery."],
        ["CommFor-224", "A smaller same-family shadow used for latency/error comparison, not independent forensic evidence."],
        ["Yermandy", "Examines properly detected and aligned faces for manipulation evidence."],
        ["Private forensic model", "Looks at residual, SRM-style and frequency evidence unlike normal semantic image understanding."],
        ["PhishLens", "Examines email text for phishing patterns as one fast candidate."],
        ["ealvaradob BERT", "A broader phishing classifier competing in the same signed qualification benchmark."],
        ["mDeBERTa private head", "A future trained multilingual phishing classifier; the base alone is not a detector."],
        ["URLBERT v4", "Examines URL structure/tokens and returns one of four exact URL classes."],
        ["Pirocheto", "A reviewed ONNX research-only lexical URL comparison lane."],
        ["SigLIP2", "Creates embeddings for approved brand-reference similarity and as a base for a private OOD head."],
        ["Private page-text model", "A future DeBERTa-based classifier using sanitized visible page text."],
    ]
    draw_table(c, ["Model / role", "Plain-language purpose"], rows, col_widths=[190, 584])


def render_not_model(c: canvas.Canvas) -> None:
    draw_panel(c, 42, 95, 360, 375, "LEARNED MODEL ROLES", [("HF text/image classifiers", "hf"), ("Private trained heads", "private"), ("Private GBDT/ONNX learned artifacts", "private"), ("SigLIP2 embedding", "hf"), ("Evidence only", "evidence")])
    draw_panel(c, 438, 95, 360, 375, "NOT LEARNED VERDICT MODELS", [("Gateway + evidence ledger", "policy"), ("Calibration application + correlation rules", "det"), ("URL/PSL/IDNA/SHA-256", "det"), ("API/queue/database/observability", "db"), ("Browser sandbox + DNS/RDAP/TLS", "det"), ("Deterministic Learning core", "det")], "Do not call infrastructure or rules 'AI'.")
    draw_arrow(c, 402, 285, 438, 285, "strict boundary")


def render_status(c: canvas.Canvas) -> None:
    rows = [
        ["READY TO IMPLEMENT", "Canonical contracts; evidence.v1; receipt.v2; registry-before-dispatch; URLBERT label adapter architecture; deterministic Gateway/Learning core"],
        ["NEEDS BENCHMARK", "PhishLens vs ealvaradob primary; CommFor-384; URLBERT; SigLIP2 brand; Yermandy; all candidate calibrations"],
        ["NEEDS TRAINING", "Private forensic residual/SRM/DCT; private SigLIP2 OOD head; multilingual mDeBERTa; phishing GBDT; URL GBDT; page-text DeBERTa"],
        ["EXTERNAL OPERATIONAL QUALIFICATION", "Endpoint IDs/regions/quotas; measured SLO/latency/throughput/cost; live database drift; legal/DPA/retention; capacity; incident drills"],
    ]
    draw_table(c, ["Readiness class", "Authoritative meaning"], rows, col_widths=[210, 564], y_top=480)
    draw_callout(c, 42, 80, 758, "Architecture readiness is not scientific or operational qualification. No endpoint, benchmark, calibration, cost, SLO, quota, retention period or legal approval is fabricated.", "failure", 62)


def render_sources_public(c: canvas.Canvas) -> None:
    rows = [[r["repository_id"], r["HF_URL"], r["revision"], r["role"], r["status"]] for r in PUBLIC_ROWS]
    draw_table(c, ["Repository", "Official HF URL", "Research revision", "Frozen role", "Status"], rows,
               col_widths=[148, 200, 120, 180, 126], font="tiny")


def render_sources_package(c: canvas.Canvas) -> None:
    sources = [
        ["Architecture_Source_of_Truth.yaml", "Canonical invariants, roles, schemas, lifecycle, receipts, rollout"],
        ["Model_Registry_Proposal.json", "18 executable model roles and immutable research identities"],
        ["HuggingFace_Deployment_Matrix.csv", "Deployment classes, provider mapping, handlers, gates"],
        ["HF_Model_Decision_Ledger.csv", "15 investigated repository dispositions"],
        ["Database_Target_Contract.md", "Control-plane and evidence persistence contract"],
        ["Database_Migration_Specification.md", "M0-M6 expand/dual-write/backfill/switch/enforce/contract"],
        ["Migration_Roadmap.md", "P0-P6 implementation sequence and rollback"],
        ["Verification_Test_Plans.md", "Golden, security, resilience, regression plans"],
        ["Competitor_Analysis.md / Competitor_Matrix.csv", "Public-market design loop; no proprietary-internals claims"],
        ["Sources/source_ledger.csv + Sources/HuggingFace", "Primary URLs and immutable saved source evidence"],
        ["QA/final_architecture_freeze_audit.csv", "Final architecture-freeze verification"],
        ["QA/package_validation.json", "Structured consistency, portability and preservation validation"],
    ]
    draw_table(c, ["Canonical package source", "Use in this document"], sources, col_widths=[280, 494], y_top=480)
    draw_callout(c, 42, 74, 758, "Terminology: specialist = evidence producer; Gateway = deterministic policy owner; candidate = not yet scientifically promoted; shadow = no decision authority; private = controlled HF repository/Endpoint after creation and qualification.", "evidence", 58)


def render_page(c: canvas.Canvas, spec: dict, page_no: int) -> None:
    if spec["layout"] == "cover":
        render_cover(c, page_no)
        return
    header(c, page_no, spec["title"], spec["section"])
    layout = spec["layout"]
    if layout == "panels": draw_panels(c, spec["panels"])
    elif layout == "flow":
        draw_flow_rows(c, spec["rows"])
        if spec.get("callout"): draw_callout(c, 42, 45, 758, spec["callout"], "failure", 38)
    elif layout == "legend": render_legend(c)
    elif layout == "hf_boundary": render_hf_boundary(c)
    elif layout == "benchmark": render_benchmark(c)
    elif layout == "domain_table": render_domain_table(c, spec["domain"])
    elif layout == "lifecycle": render_lifecycle(c)
    elif layout == "evidence_contract": render_evidence_contract(c)
    elif layout == "receipt": render_receipt(c)
    elif layout == "composite_receipt": render_composite_receipt(c)
    elif layout == "registry_cards": render_registry_cards(c, spec["keys"])
    elif layout == "public_table": render_public_table(c)
    elif layout == "private_roadmap": render_private_roadmap(c)
    elif layout == "deployment": render_deployment(c)
    elif layout == "privacy": render_privacy(c)
    elif layout == "failure": render_failure(c)
    elif layout == "examples": render_examples(c)
    elif layout == "implementation": render_implementation(c)
    elif layout == "actual_runs": render_actual_runs(c)
    elif layout == "simple_language": render_simple_language(c)
    elif layout == "not_model": render_not_model(c)
    elif layout == "status": render_status(c)
    elif layout == "sources_public": render_sources_public(c)
    elif layout == "sources_package": render_sources_package(c)
    else: raise RuntimeError(f"Unknown layout: {layout}")


def main() -> None:
    build_specs()
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PDF), pagesize=(PW, PH), invariant=1, pageCompression=1)
    c.setTitle("VeriTrust End-to-End Detection Flows and Hugging Face Model Map")
    c.setAuthor("VeriTrust Research")
    c.setSubject("Frozen HF-managed detection architecture implementation reference")
    for page_no, spec in enumerate(PAGE_SPECS, start=1):
        render_page(c, spec, page_no)
        c.showPage()
    c.save()

    source = {
        "schema_version": "veritrust.flow_document.v1",
        "document_status": "GENERATED_FROM_FROZEN_ARCHITECTURE",
        "canonical_sources": [
            "Architecture_Source_of_Truth.yaml", "Model_Registry_Proposal.json",
            "HuggingFace_Deployment_Matrix.csv", "HF_Model_Decision_Ledger.csv",
        ],
        "derived_counts": {
            "canonical_model_roles": len(REGISTRY_KEYS),
            "lifecycle_states": len(ARCH["evidence_contract"]["status_enum"]),
            "public_hf_repositories_including_base_only": len({row["repository_id"] for row in PUBLIC_ROWS}),
            "private_registry_roles": len(PRIVATE_ENTRIES),
            "candidate_roles": sum("candidate" in row["status"] for row in ENTRIES),
            "shadow_roles": sum(row["status"] == "shadow_only" for row in ENTRIES),
            "pages": len(PAGE_SPECS),
            "diagrams": sum(int(spec["diagrams"]) for spec in PAGE_SPECS),
        },
        "style_legend": {key: {"stroke": str(value[0]), "fill": str(value[1])} for key, value in KIND_STYLE.items()},
        "pages": [{"page": idx + 1, "title": spec["title"], "section": spec["section"], "layout": spec["layout"], "diagrams": spec["diagrams"]} for idx, spec in enumerate(PAGE_SPECS)],
        "public_hf_url_verification_date": "2026-08-16",
        "external_gate_rule": "No benchmark, calibration, endpoint, pricing, SLO, quota, retention or legal result is implied.",
    }
    OUT_SOURCE.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")
    build = {
        "pdf": OUT_PDF.name,
        "pdf_sha256": sha256(OUT_PDF),
        "source_sha256": sha256(OUT_SOURCE),
        "link_map_sha256": sha256(OUT_LINKS),
        "canonical_source_hashes": {name: sha256(RESEARCH / name) for name in source["canonical_sources"]},
        "assertions": {
            "canonical_registry_matrix_role_equality": True,
            "urlbert_label_contract": True,
            "receipt_v2": True,
            "lifecycle_count": len(ARCH["evidence_contract"]["status_enum"]),
            "third_party_disabled_by_default": ARCH["third_party_inference_provider_policy"]["status"] == "DISABLED_BY_DEFAULT",
        },
        "derived_counts": source["derived_counts"],
    }
    OUT_BUILD.write_text(json.dumps(build, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(build, indent=2))


if __name__ == "__main__":
    main()
