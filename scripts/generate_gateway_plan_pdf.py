from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    LongTable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "unified-security-gateway-implementation-plan.md"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "VeriTrust_Unified_Security_Gateway_Production_Implementation_Plan.pdf"
LOGO = ROOT / "logo.png"
BRAND = ROOT / "brand.png"

PAGE_W, PAGE_H = A4

NAVY = HexColor("#071B34")
NAVY_2 = HexColor("#0C2B4D")
BLUE = HexColor("#1268E8")
CYAN = HexColor("#08A9E6")
TEAL = HexColor("#0E9D89")
GREEN = HexColor("#23B26D")
AMBER = HexColor("#F59E0B")
RED = HexColor("#E54545")
PURPLE = HexColor("#7657D5")
INK = HexColor("#172A3D")
MUTED = HexColor("#607286")
PALE = HexColor("#F3F7FB")
PALE_BLUE = HexColor("#EAF3FF")
LINE = HexColor("#D5E0EA")
WHITE = colors.white


def ascii_clean(value: str) -> str:
    replacements = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u2192": "->",
        "\u2190": "<-",
        "\u00a0": " ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def inline_markup(text: str) -> str:
    text = ascii_clean(text)
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#0C4EA3">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    return escaped


def wrap_canvas_text(canvas, text, font_name, font_size, max_width):
    words = ascii_clean(text).split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font_name, font_size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


class DiagramFlowable(Flowable):
    def __init__(self, width, height, title, caption):
        super().__init__()
        self.width = width
        self.height = height
        self.title = title
        self.caption = caption

    def box(self, canvas, x, y, w, h, label, fill=PALE_BLUE, stroke=BLUE, small=None):
        canvas.setFillColor(fill)
        canvas.setStrokeColor(stroke)
        canvas.setLineWidth(1.1)
        canvas.roundRect(x, y, w, h, 5, fill=1, stroke=1)
        label_lines = wrap_canvas_text(canvas, label, "Helvetica-Bold", 7.4, w - 10)
        total = len(label_lines) * 9
        start_y = y + (h + total) / 2 - 8
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 7.4)
        for index, line in enumerate(label_lines):
            canvas.drawCentredString(x + w / 2, start_y - index * 9, line)
        if small:
            small_lines = wrap_canvas_text(canvas, small, "Helvetica", 5.6, w - 9)
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 5.6)
            sy = y + 7 + (len(small_lines) - 1) * 6.5
            for index, line in enumerate(small_lines):
                canvas.drawCentredString(x + w / 2, sy - index * 6.5, line)

    def arrow(self, canvas, x1, y1, x2, y2, color=NAVY_2):
        canvas.setStrokeColor(color)
        canvas.setFillColor(color)
        canvas.setLineWidth(1)
        canvas.line(x1, y1, x2, y2)
        angle = 3.5
        if abs(x2 - x1) >= abs(y2 - y1):
            direction = 1 if x2 >= x1 else -1
            canvas.line(x2, y2, x2 - direction * 5, y2 + angle)
            canvas.line(x2, y2, x2 - direction * 5, y2 - angle)
        else:
            direction = 1 if y2 >= y1 else -1
            canvas.line(x2, y2, x2 + angle, y2 - direction * 5)
            canvas.line(x2, y2, x2 - angle, y2 - direction * 5)

    def draw_header(self, canvas):
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(0, self.height - 13, self.title)
        canvas.setStrokeColor(CYAN)
        canvas.setLineWidth(2)
        canvas.line(0, self.height - 19, self.width, self.height - 19)


class ArchitectureDiagram(DiagramFlowable):
    def __init__(self, width):
        super().__init__(width, 252, "Figure 1. Target gateway architecture", "One request becomes an artifact graph, normalized evidence, and a versioned policy decision.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        gap = 7
        box_w = (self.width - 4 * gap) / 5
        y1, h = 178, 43
        labels = [
            ("Source platform", "API, email, upload or event"),
            ("Gateway API", "Auth, quota and idempotency"),
            ("Extractor", "Text, URLs and media artifacts"),
            ("Model router", "Run only applicable models"),
            ("Policy decision", "Allow, warn, hold or quarantine"),
        ]
        fills = [PALE_BLUE, PALE_BLUE, HexColor("#EEF7FF"), HexColor("#E9FBF6"), HexColor("#FFF6E7")]
        strokes = [BLUE, BLUE, CYAN, TEAL, AMBER]
        for i, ((label, small), fill, stroke) in enumerate(zip(labels, fills, strokes)):
            x = i * (box_w + gap)
            self.box(c, x, y1, box_w, h, label, fill, stroke, small)
            if i:
                self.arrow(c, x - gap + 1, y1 + h / 2, x - 1, y1 + h / 2)

        model_w = (self.width - 2 * gap - 40) / 3
        model_y = 104
        model_x = 20
        models = [
            ("Phishing adapter", PURPLE, HexColor("#F3EEFF")),
            ("Link adapter", BLUE, HexColor("#EAF3FF")),
            ("Deepfake adapter", TEAL, HexColor("#E9FBF6")),
        ]
        router_center = 3 * (box_w + gap) + box_w / 2
        for i, (label, stroke, fill) in enumerate(models):
            x = model_x + i * (model_w + gap)
            self.box(c, x, model_y, model_w, 35, label, fill, stroke, "Immutable model and calibration version")
            self.arrow(c, router_center, y1, x + model_w / 2, model_y + 35)

        corr_w = self.width * 0.32
        corr_x = (self.width - corr_w) / 2
        corr_y = 48
        self.box(c, corr_x, corr_y, corr_w, 37, "Correlation engine", HexColor("#FFF0EF"), RED, "Dominant signals and cross-signal rules")
        for i in range(3):
            x = model_x + i * (model_w + gap) + model_w / 2
            self.arrow(c, x, model_y, corr_x + corr_w / 2, corr_y + 37)

        out_w = (self.width - 2 * gap) / 3
        for i, (label, stroke, fill) in enumerate([
            ("Unified report and polling", BLUE, PALE_BLUE),
            ("Signed webhook delivery", TEAL, HexColor("#E9FBF6")),
            ("Audit, review and metrics", PURPLE, HexColor("#F3EEFF")),
        ]):
            x = i * (out_w + gap)
            self.box(c, x, 1, out_w, 29, label, fill, stroke)
            self.arrow(c, corr_x + corr_w / 2, corr_y, x + out_w / 2, 30)


class RequestLifecycleDiagram(DiagramFlowable):
    def __init__(self, width):
        super().__init__(width, 142, "Figure 2. Request lifecycle and decision flow", "Fast inputs may complete synchronously; media continues through a durable worker path.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        labels = ["Receive", "Validate", "Extract", "Route", "Analyze", "Correlate", "Decide", "Record"]
        colors_seq = [BLUE, BLUE, CYAN, TEAL, PURPLE, RED, AMBER, NAVY_2]
        gap = 5
        w = (self.width - 3 * gap) / 4
        h = 34
        coords = []
        for i, label in enumerate(labels):
            row = 0 if i < 4 else 1
            # Snake the second row from right to left so the numbered flow is
            # visually continuous: Route -> Analyze -> Correlate -> Decide -> Record.
            col = i if i < 4 else 7 - i
            x = col * (w + gap)
            y = 77 if row == 0 else 23
            coords.append((x, y))
            self.box(c, x, y, w, h, f"{i + 1}. {label}", PALE, colors_seq[i])
            if row == 0 and col:
                self.arrow(c, x - gap + 1, y + h / 2, x - 1, y + h / 2)
        self.arrow(c, coords[3][0] + w / 2, coords[3][1], coords[4][0] + w / 2, coords[4][1] + h)
        for i in range(5, 8):
            px, py = coords[i - 1]
            x, y = coords[i]
            self.arrow(c, px - 1, py + h / 2, x + w + 1, y + h / 2)


class StateMachineDiagram(DiagramFlowable):
    def __init__(self, width):
        super().__init__(width, 168, "Figure 3. Gateway scan state machine", "Terminal transitions use conditional writes so retries cannot regress scan state.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        top = ["received", "validating", "extracting", "running"]
        gap = 8
        w = (self.width - 3 * gap) / 4
        h = 31
        y = 100
        for i, label in enumerate(top):
            x = i * (w + gap)
            self.box(c, x, y, w, h, label, PALE_BLUE, BLUE)
            if i:
                self.arrow(c, x - gap + 1, y + h / 2, x - 1, y + h / 2)
        branch_y = 47
        branch_labels = [
            ("partially completed", AMBER, HexColor("#FFF6E7")),
            ("completed", GREEN, HexColor("#EAF9F1")),
            ("failed", RED, HexColor("#FFF0EF")),
            ("cancel requested", PURPLE, HexColor("#F3EEFF")),
        ]
        bw = (self.width - 3 * gap) / 4
        run_x = 3 * (w + gap) + w / 2
        for i, (label, stroke, fill) in enumerate(branch_labels):
            x = i * (bw + gap)
            self.box(c, x, branch_y, bw, 30, label, fill, stroke)
            self.arrow(c, run_x, y, x + bw / 2, branch_y + 30)
        self.box(c, self.width * 0.64, 5, self.width * 0.34, 25, "cancelled or completed", PALE, NAVY_2)
        self.arrow(c, 3 * (bw + gap) + bw / 2, branch_y, self.width * 0.81, 30)


class DataModelDiagram(DiagramFlowable):
    def __init__(self, width):
        super().__init__(width, 226, "Figure 4. Gateway data model boundaries", "Existing organization, identity, plan and model tables remain the control-plane foundation.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        col_gap = 12
        col_w = (self.width - 2 * col_gap) / 3
        x_positions = [0, col_w + col_gap, 2 * (col_w + col_gap)]
        headers = [
            ("CONTROL PLANE", BLUE),
            ("SCAN AND EVIDENCE", TEAL),
            ("DELIVERY AND TRUST", PURPLE),
        ]
        groups = [
            ["organizations + members", "api_keys + scopes", "policy versions", "integrations + model catalog"],
            ["gateway_scans", "gateway_artifacts", "model_runs + evidence", "decisions + idempotency"],
            ["webhook events + attempts", "review cases + overrides", "audit + system events", "retention receipts"],
        ]
        for col, ((heading, stroke), items) in enumerate(zip(headers, groups)):
            x = x_positions[col]
            c.setFillColor(stroke)
            c.roundRect(x, 177, col_w, 25, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 7.5)
            c.drawCentredString(x + col_w / 2, 186, heading)
            for row, label in enumerate(items):
                y = 137 - row * 35
                self.box(c, x + 7, y, col_w - 14, 27, label, PALE, stroke)
                if row:
                    self.arrow(c, x + col_w / 2, y + 35, x + col_w / 2, y + 27)
        self.arrow(c, x_positions[0] + col_w, 113, x_positions[1], 113)
        self.arrow(c, x_positions[1] + col_w, 78, x_positions[2], 78)


class RoadmapDiagram(DiagramFlowable):
    def __init__(self, width):
        super().__init__(width, 191, "Figure 5. Controlled delivery roadmap", "Build deterministic foundations first; expand enforcement only after measured pilot gates.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        phases = [
            ("0", "Stabilize", "CI, tests, migrations"),
            ("1", "Core contracts", "Evidence, router, policy"),
            ("2", "Sync gateway", "Persistence and API"),
            ("3", "Media pipeline", "Queue, worker, partial state"),
            ("4", "Trust controls", "Webhooks and retention"),
            ("5", "Operations", "Metrics, review and UX"),
            ("6", "Pilot", "Advisory to quarantine"),
        ]
        colors_seq = [NAVY_2, BLUE, CYAN, TEAL, PURPLE, AMBER, RED]
        gap = 7
        top_w = (self.width - 3 * gap) / 4
        bottom_w = (self.width - 2 * gap) / 3
        coords = []
        for i, ((num, label, small), stroke) in enumerate(zip(phases, colors_seq)):
            if i < 4:
                x = i * (top_w + gap)
                y = 99
                w = top_w
            else:
                # Continue as a snake: Phase 3 drops into Phase 4 on the right,
                # then Phase 4 -> 5 -> 6 runs right-to-left.
                x = (6 - i) * (bottom_w + gap)
                y = 34
                w = bottom_w
            coords.append((x, y, w))
            self.box(c, x, y, w, 47, f"Phase {num} - {label}", PALE, stroke, small)
            if i and i < 4:
                px, py, pw = coords[i - 1]
                self.arrow(c, px + pw, py + 23, x, y + 23)
            elif i > 4:
                px, py, pw = coords[i - 1]
                self.arrow(c, px, py + 23, x + w, y + 23)
        self.arrow(c, coords[3][0] + coords[3][2] / 2, coords[3][1], coords[4][0] + coords[4][2] / 2, coords[4][1] + 47)


class CoverFlowable(Flowable):
    def __init__(self):
        super().__init__()
        self.width = PAGE_W
        self.height = PAGE_H

    def wrap(self, avail_width, avail_height):
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(NAVY)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(HexColor("#0B315D"))
        c.circle(PAGE_W + 10 * mm, PAGE_H - 25 * mm, 70 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#0A2545"))
        c.circle(-5 * mm, 16 * mm, 58 * mm, fill=1, stroke=0)
        c.setStrokeColor(CYAN)
        c.setLineWidth(2)
        c.line(21 * mm, PAGE_H - 35 * mm, PAGE_W - 21 * mm, PAGE_H - 35 * mm)

        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), 22 * mm, PAGE_H - 70 * mm, 28 * mm, 28 * mm, mask="auto", preserveAspectRatio=True)
        if BRAND.exists():
            c.drawImage(ImageReader(str(BRAND)), 55 * mm, PAGE_H - 60 * mm, 105 * mm, 22 * mm, mask="auto", preserveAspectRatio=True, anchor="w")

        c.setFillColor(CYAN)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(22 * mm, PAGE_H - 91 * mm, "UNIFIED SECURITY GATEWAY")
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 28)
        c.drawString(22 * mm, PAGE_H - 111 * mm, "Production")
        c.drawString(22 * mm, PAGE_H - 124 * mm, "Implementation Plan")
        c.setFillColor(HexColor("#B8D6F2"))
        c.setFont("Helvetica", 12)
        c.drawString(22 * mm, PAGE_H - 141 * mm, "Architecture  |  Security  |  Delivery Roadmap")

        c.setFillColor(HexColor("#103B68"))
        c.roundRect(22 * mm, 54 * mm, PAGE_W - 44 * mm, 54 * mm, 7, fill=1, stroke=0)
        c.setStrokeColor(CYAN)
        c.setLineWidth(1.3)
        c.line(29 * mm, 98 * mm, 29 * mm, 64 * mm)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(36 * mm, 91 * mm, "Purpose")
        c.setFont("Helvetica", 9.4)
        purpose = "Convert the three existing detectors into a scalable, auditable, policy-driven multimodal trust gateway."
        for index, line in enumerate(wrap_canvas_text(c, purpose, "Helvetica", 9.4, PAGE_W - 86 * mm)):
            c.drawString(36 * mm, (81 - index * 5) * mm, line)
        c.setFillColor(HexColor("#9BC6EB"))
        c.setFont("Helvetica", 8.5)
        c.drawString(36 * mm, 64 * mm, "Prepared for Ajay / VeriTrust  |  Planning date: July 2026  |  Version 1.0")

        c.setFillColor(HexColor("#8EB5D8"))
        c.setFont("Helvetica", 7.5)
        c.drawString(22 * mm, 22 * mm, "Advisory-first. Deterministic. Auditable. Privacy-minimizing.")
        c.drawRightString(PAGE_W - 22 * mm, 22 * mm, "VERITRUST | IMPLEMENTATION BLUEPRINT")


class PlanDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="cover")
        body_frame = Frame(18 * mm, 18 * mm, PAGE_W - 36 * mm, PAGE_H - 34 * mm, leftPadding=0, rightPadding=0, topPadding=13 * mm, bottomPadding=9 * mm, id="body")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=self.cover_page),
            PageTemplate(id="body", frames=[body_frame], onPage=self.body_page),
        ])

    @staticmethod
    def cover_page(canvas, doc):
        canvas.setTitle("VeriTrust Unified Security Gateway - Production Implementation Plan")
        canvas.setAuthor("VeriTrust")
        canvas.setSubject("Production architecture and implementation roadmap")

    @staticmethod
    def body_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(BLUE)
        canvas.setLineWidth(1.1)
        canvas.line(18 * mm, PAGE_H - 15 * mm, PAGE_W - 18 * mm, PAGE_H - 15 * mm)
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.drawString(18 * mm, PAGE_H - 11.5 * mm, "VERITRUST  |  UNIFIED SECURITY GATEWAY")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.6)
        canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 11.5 * mm, "PRODUCTION IMPLEMENTATION PLAN")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(18 * mm, 13 * mm, PAGE_W - 18 * mm, 13 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.5)
        canvas.drawString(18 * mm, 8.5 * mm, "Architecture | Security | Delivery Roadmap")
        canvas.drawRightString(PAGE_W - 18 * mm, 8.5 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name == "H2Major":
            text = flowable.getPlainText()
            key = f"section-{self.page}-{abs(hash(text))}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0, closed=False)
            self.notify("TOCEntry", (0, text, self.page, key))
        elif isinstance(flowable, Paragraph) and flowable.style.name == "H3Sub":
            text = flowable.getPlainText()
            key = f"subsection-{self.page}-{abs(hash(text))}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=1, closed=True)
            self.notify("TOCEntry", (1, text, self.page, key))


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="TOCTitle",
        fontName="Helvetica-Bold",
        fontSize=23,
        leading=27,
        textColor=NAVY,
        spaceAfter=10,
    ))
    styles.add(ParagraphStyle(
        name="Deck",
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=MUTED,
        spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="H2Major",
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=19,
        textColor=NAVY,
        spaceBefore=11,
        spaceAfter=7,
        keepWithNext=True,
    ))
    styles.add(ParagraphStyle(
        name="H3Sub",
        fontName="Helvetica-Bold",
        fontSize=11.2,
        leading=14,
        textColor=BLUE,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    ))
    styles.add(ParagraphStyle(
        name="BodyVT",
        fontName="Helvetica",
        fontSize=8.4,
        leading=12.1,
        textColor=INK,
        spaceAfter=5.5,
        allowWidows=0,
        allowOrphans=0,
    ))
    styles.add(ParagraphStyle(
        name="BulletVT",
        parent=styles["BodyVT"],
        leftIndent=12,
        firstLineIndent=-8,
        bulletIndent=1,
        spaceAfter=3.4,
    ))
    styles.add(ParagraphStyle(
        name="NumberVT",
        parent=styles["BodyVT"],
        leftIndent=18,
        firstLineIndent=-14,
        bulletIndent=0,
        spaceAfter=3.4,
    ))
    styles.add(ParagraphStyle(
        name="CodeVT",
        fontName="Courier",
        fontSize=6.8,
        leading=9.2,
        textColor=NAVY,
        leftIndent=0,
        rightIndent=0,
        spaceAfter=0,
    ))
    styles.add(ParagraphStyle(
        name="TableHeadVT",
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9,
        textColor=WHITE,
        alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        name="TableCellVT",
        fontName="Helvetica",
        fontSize=6.9,
        leading=9,
        textColor=INK,
    ))
    styles.add(ParagraphStyle(
        name="CaptionVT",
        fontName="Helvetica-Oblique",
        fontSize=6.8,
        leading=9,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceBefore=2,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="CalloutVT",
        fontName="Helvetica-Bold",
        fontSize=8.2,
        leading=11.5,
        textColor=NAVY,
    ))
    return styles


def code_block(text, styles):
    safe = html.escape(ascii_clean(text)).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
    paragraph = Paragraph(safe, styles["CodeVT"])
    table = Table([[paragraph]], colWidths=[PAGE_W - 40 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F0F5FA")),
        ("BOX", (0, 0), (-1, -1), 0.7, HexColor("#BDD0E1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def callout(text, styles, color=BLUE):
    accent = Table([[""], [Paragraph(inline_markup(text), styles["CalloutVT"])]], colWidths=[PAGE_W - 40 * mm])
    accent.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 0)),
        ("BACKGROUND", (0, 0), (0, 0), color),
        ("BACKGROUND", (0, 1), (0, 1), PALE_BLUE),
        ("TOPPADDING", (0, 0), (0, 0), 1.4),
        ("BOTTOMPADDING", (0, 0), (0, 0), 1.4),
        ("LEFTPADDING", (0, 1), (0, 1), 9),
        ("RIGHTPADDING", (0, 1), (0, 1), 9),
        ("TOPPADDING", (0, 1), (0, 1), 7),
        ("BOTTOMPADDING", (0, 1), (0, 1), 7),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
    ]))
    return accent


def parse_table(lines, start, styles):
    raw_rows = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        raw_rows.append(cells)
        index += 1
    if len(raw_rows) < 2:
        return None, start
    separator = raw_rows[1]
    if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in separator):
        return None, start
    rows = [raw_rows[0]] + raw_rows[2:]
    column_count = len(rows[0])
    available = PAGE_W - 40 * mm
    if column_count == 2:
        widths = [available * 0.31, available * 0.69]
    elif column_count == 3:
        widths = [available * 0.20, available * 0.29, available * 0.51]
    elif column_count == 4:
        widths = [available * 0.16, available * 0.31, available * 0.39, available * 0.14]
    else:
        widths = [available / column_count] * column_count
    formatted = []
    for row_index, row in enumerate(rows):
        row = row + [""] * (column_count - len(row))
        style = styles["TableHeadVT"] if row_index == 0 else styles["TableCellVT"]
        formatted.append([Paragraph(inline_markup(cell), style) for cell in row[:column_count]])
    table = LongTable(formatted, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for row_index in range(1, len(formatted)):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), WHITE if row_index % 2 else PALE))
    table.setStyle(TableStyle(commands))
    return table, index


def build_story(markdown_text, styles):
    lines = ascii_clean(markdown_text).splitlines()
    body_width = PAGE_W - 36 * mm
    story = [
        CoverFlowable(),
        NextPageTemplate("body"),
        PageBreak(),
        Paragraph("Contents", styles["TOCTitle"]),
        Paragraph("A complete architecture, security, data, API, testing and delivery blueprint for the VeriTrust Unified Security Gateway.", styles["Deck"]),
    ]
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontName="Helvetica-Bold", fontSize=8.8, leading=13, leftIndent=0, firstLineIndent=0, textColor=NAVY, spaceBefore=3),
        ParagraphStyle(name="TOC1", fontName="Helvetica", fontSize=7.4, leading=10, leftIndent=14, firstLineIndent=0, textColor=MUTED),
    ]
    story.extend([toc, PageBreak()])

    in_code = False
    code_lang = ""
    code_lines = []
    paragraph_lines = []

    def flush_paragraph():
        nonlocal paragraph_lines
        if not paragraph_lines:
            return
        text = " ".join(line.strip() for line in paragraph_lines).strip()
        paragraph_lines = []
        if not text:
            return
        if text.startswith("Automatic blocking must remain disabled") or text.startswith("Never put destructive rollback") or text.startswith("This order creates"):
            story.extend([callout(text, styles), Spacer(1, 6)])
        else:
            story.append(Paragraph(inline_markup(text), styles["BodyVT"]))

    index = 0
    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()

        if in_code:
            if stripped.startswith("```"):
                content = "\n".join(code_lines)
                if code_lang == "mermaid":
                    diagram = ArchitectureDiagram(body_width)
                    story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
                else:
                    story.extend([code_block(content, styles), Spacer(1, 6)])
                in_code = False
                code_lang = ""
                code_lines = []
            else:
                code_lines.append(raw)
            index += 1
            continue

        if stripped.startswith("```"):
            flush_paragraph()
            in_code = True
            code_lang = stripped[3:].strip().lower()
            code_lines = []
            index += 1
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            index += 1
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            title = stripped[3:].strip()
            story.extend([CondPageBreak(45 * mm), Paragraph(inline_markup(title), styles["H2Major"])])
            if title.startswith("9. API design"):
                diagram = RequestLifecycleDiagram(body_width)
                story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
            elif title.startswith("10. Database and migration plan"):
                diagram = DataModelDiagram(body_width)
                story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
            elif title.startswith("17. Delivery sequence"):
                diagram = RoadmapDiagram(body_width)
                story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
            index += 1
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            title = stripped[4:].strip()
            story.extend([CondPageBreak(25 * mm), Paragraph(inline_markup(title), styles["H3Sub"])])
            if title.startswith("5.4 Scan state machine"):
                diagram = StateMachineDiagram(body_width)
                story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
            index += 1
            continue

        if stripped.startswith("|"):
            flush_paragraph()
            table, next_index = parse_table(lines, index, styles)
            if table is not None:
                story.extend([table, Spacer(1, 7)])
                index = next_index
                continue

        bullet_match = re.match(r"^-\s+(.*)$", stripped)
        number_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if bullet_match:
            flush_paragraph()
            story.append(Paragraph(inline_markup(bullet_match.group(1)), styles["BulletVT"], bulletText="-"))
            index += 1
            continue
        if number_match:
            flush_paragraph()
            story.append(Paragraph(inline_markup(number_match.group(2)), styles["NumberVT"], bulletText=f"{number_match.group(1)}."))
            index += 1
            continue

        if not stripped:
            flush_paragraph()
        else:
            paragraph_lines.append(raw)
        index += 1

    flush_paragraph()
    if in_code and code_lines:
        story.append(code_block("\n".join(code_lines), styles))

    story.extend([
        Spacer(1, 12),
        callout("Implementation principle: build the smallest reliable system first. Expand automatic enforcement only after authorization, observability, failure handling, abuse prevention and measured accuracy are proven.", styles, TEAL),
    ])
    return story


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = make_styles()
    source = SOURCE.read_text(encoding="utf-8")
    story = build_story(source, styles)
    document = PlanDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="VeriTrust Unified Security Gateway - Production Implementation Plan",
        author="VeriTrust",
    )
    document.multiBuild(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
