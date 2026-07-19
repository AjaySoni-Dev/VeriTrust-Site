from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    LongTable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "learning-certification-implementation-plan.md"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "VeriTrust_Learning_and_Certification_Implementation_Plan.pdf"
LOGO = ROOT / "logo.png"
BRAND = ROOT / "brand.png"

PAGE_W, PAGE_H = A4
NAVY = HexColor("#061A31")
NAVY_2 = HexColor("#0B2D50")
BLUE = HexColor("#1268E8")
CYAN = HexColor("#08A9E6")
TEAL = HexColor("#0E9D89")
GREEN = HexColor("#1FAD6B")
AMBER = HexColor("#F59E0B")
RED = HexColor("#DD4545")
PURPLE = HexColor("#7657D5")
INK = HexColor("#172A3D")
MUTED = HexColor("#5E7185")
PALE = HexColor("#F3F7FB")
PALE_BLUE = HexColor("#EAF3FF")
PALE_TEAL = HexColor("#E9FBF6")
PALE_PURPLE = HexColor("#F3EEFF")
LINE = HexColor("#D5E0EA")
WHITE = colors.white


def ascii_clean(value: str) -> str:
    replacements = {
        "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-",
        "\u2212": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u2026": "...", "\u2192": "->", "\u2190": "<-", "\u00a0": " ",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def inline_markup(text: str) -> str:
    escaped = html.escape(ascii_clean(text))
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#0C4EA3">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    return escaped


def wrap_text(canvas, text, font_name, font_size, max_width):
    words = ascii_clean(text).split()
    lines, current = [], ""
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
        c.setFillColor(HexColor("#0A315D"))
        c.circle(PAGE_W + 7 * mm, PAGE_H - 25 * mm, 68 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#0A2545"))
        c.circle(-8 * mm, 19 * mm, 59 * mm, fill=1, stroke=0)
        c.setStrokeColor(CYAN)
        c.setLineWidth(2)
        c.line(21 * mm, PAGE_H - 35 * mm, PAGE_W - 21 * mm, PAGE_H - 35 * mm)

        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), 22 * mm, PAGE_H - 70 * mm, 28 * mm, 28 * mm, mask="auto", preserveAspectRatio=True)
        if BRAND.exists():
            c.drawImage(ImageReader(str(BRAND)), 55 * mm, PAGE_H - 60 * mm, 104 * mm, 22 * mm, mask="auto", preserveAspectRatio=True, anchor="w")

        c.setFillColor(CYAN)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(22 * mm, PAGE_H - 91 * mm, "LEARNING AND CERTIFICATION SYSTEM")
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 26)
        c.drawString(22 * mm, PAGE_H - 111 * mm, "Production")
        c.drawString(22 * mm, PAGE_H - 124 * mm, "Implementation Plan")
        c.setFillColor(HexColor("#B8D6F2"))
        c.setFont("Helvetica", 11.3)
        c.drawString(22 * mm, PAGE_H - 141 * mm, "Learning UX  |  Assessment  |  Verifiable Credentials")

        c.setFillColor(HexColor("#103B68"))
        c.roundRect(22 * mm, 52 * mm, PAGE_W - 44 * mm, 59 * mm, 7, fill=1, stroke=0)
        c.setStrokeColor(CYAN)
        c.setLineWidth(1.3)
        c.line(29 * mm, 101 * mm, 29 * mm, 62 * mm)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 11.5)
        c.drawString(36 * mm, 94 * mm, "Purpose")
        purpose = "Add a scalable, secure and deeply interactive learning domain to the existing VeriTrust workspace, from discovery through verifiable certification."
        c.setFont("Helvetica", 9.1)
        for index, line in enumerate(wrap_text(c, purpose, "Helvetica", 9.1, PAGE_W - 87 * mm)):
            c.drawString(36 * mm, (83 - index * 5) * mm, line)
        c.setFillColor(HexColor("#9BC6EB"))
        c.setFont("Helvetica", 8.2)
        c.drawString(36 * mm, 63 * mm, "Prepared for VeriTrust  |  July 2026  |  Version 1.0")

        c.setFillColor(HexColor("#8EB5D8"))
        c.setFont("Helvetica", 7.3)
        c.drawString(22 * mm, 22 * mm, "Outcome-led. Accessible. Versioned. Auditable. Ethical engagement.")
        c.drawRightString(PAGE_W - 22 * mm, 22 * mm, "VERITRUST | IMPLEMENTATION BLUEPRINT")


class Diagram(Flowable):
    def __init__(self, width, height, title, caption):
        super().__init__()
        self.width = width
        self.height = height
        self.title = title
        self.caption = caption

    def draw_header(self, c):
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(0, self.height - 12, self.title)
        c.setStrokeColor(CYAN)
        c.setLineWidth(1.8)
        c.line(0, self.height - 18, self.width, self.height - 18)

    def box(self, c, x, y, w, h, label, small="", fill=PALE_BLUE, stroke=BLUE):
        c.setFillColor(fill)
        c.setStrokeColor(stroke)
        c.setLineWidth(1)
        c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
        label_lines = wrap_text(c, label, "Helvetica-Bold", 7.1, w - 10)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 7.1)
        start_y = y + h - 12
        for index, line in enumerate(label_lines[:2]):
            c.drawCentredString(x + w / 2, start_y - index * 8, line)
        if small:
            small_lines = wrap_text(c, small, "Helvetica", 5.5, w - 9)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 5.5)
            sy = y + 7 + (len(small_lines[:2]) - 1) * 6.2
            for index, line in enumerate(small_lines[:2]):
                c.drawCentredString(x + w / 2, sy - index * 6.2, line)

    def arrow(self, c, x1, y1, x2, y2, color=NAVY_2):
        c.setStrokeColor(color)
        c.setLineWidth(0.9)
        c.line(x1, y1, x2, y2)
        c.setFillColor(color)
        if abs(x2 - x1) >= abs(y2 - y1):
            direction = 1 if x2 >= x1 else -1
            c.line(x2, y2, x2 - direction * 4, y2 + 2.7)
            c.line(x2, y2, x2 - direction * 4, y2 - 2.7)
        else:
            direction = 1 if y2 >= y1 else -1
            c.line(x2, y2, x2 + 2.7, y2 - direction * 4)
            c.line(x2, y2, x2 - 2.7, y2 - direction * 4)


class IntegrationDiagram(Diagram):
    def __init__(self, width):
        super().__init__(width, 202, "Figure 1. Learning domain integrated into the current VeriTrust platform", "One additional consolidated function preserves the existing Vercel, Supabase, billing and worker patterns.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        gap = 8
        w = (self.width - 3 * gap) / 4
        top_y = 130
        top = [
            ("Static learning pages", "Catalog, course, lesson, exam", PALE_BLUE, BLUE),
            ("Learning API", "One Vercel route dispatcher", PALE_TEAL, TEAL),
            ("Supabase", "RLS, RPC, Storage, audit", PALE_PURPLE, PURPLE),
            ("Background worker", "PDF, reminders, exports", HexColor("#FFF6E7"), AMBER),
        ]
        for i, (label, small, fill, stroke) in enumerate(top):
            x = i * (w + gap)
            self.box(c, x, top_y, w, 42, label, small, fill, stroke)
            if i:
                self.arrow(c, x - gap + 1, top_y + 21, x - 1, top_y + 21)
        lower = [
            ("Auth and workspace", "Existing session and roles", BLUE, PALE_BLUE),
            ("Detection labs", "Training-tagged safe scenarios", RED, HexColor("#FFF0EF")),
            ("Plan entitlements", "Seats, catalog, certificates", TEAL, PALE_TEAL),
            ("Credential verify", "Minimal public status", PURPLE, PALE_PURPLE),
        ]
        for i, (label, small, stroke, fill) in enumerate(lower):
            x = i * (w + gap)
            self.box(c, x, 61, w, 38, label, small, fill, stroke)
            self.arrow(c, x + w / 2, top_y, x + w / 2, 99)
        self.box(c, self.width * .22, 5, self.width * .56, 30, "Shared trust controls", "Idempotency, versioning, audit, privacy, rate limits and observability", PALE, NAVY_2)
        for i in range(4):
            x = i * (w + gap) + w / 2
            self.arrow(c, x, 61, self.width / 2, 35)


class JourneyDiagram(Diagram):
    def __init__(self, width):
        super().__init__(width, 154, "Figure 2. Learner interaction loop", "Every stage has a clear next action, feedback signal and resumable server state.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        labels = ["Discover", "Enroll", "Learn", "Practice", "Assess", "Certify", "Reinforce"]
        strokes = [BLUE, CYAN, TEAL, PURPLE, AMBER, GREEN, NAVY_2]
        gap = 6
        w = (self.width - 3 * gap) / 4
        coords = []
        for i, (label, stroke) in enumerate(zip(labels, strokes)):
            if i < 4:
                x, y = i * (w + gap), 78
            else:
                x, y = (6 - i) * (w + gap), 25
            coords.append((x, y))
            self.box(c, x, y, w, 32, f"{i + 1}. {label}", "", PALE, stroke)
            if 0 < i < 4:
                px, py = coords[i - 1]
                self.arrow(c, px + w, py + 16, x, y + 16)
            elif i > 4:
                px, py = coords[i - 1]
                self.arrow(c, px, py + 16, x + w, y + 16)
        self.arrow(c, coords[3][0] + w / 2, coords[3][1], coords[4][0] + w / 2, coords[4][1] + 32)


class AssessmentDiagram(Diagram):
    def __init__(self, width):
        super().__init__(width, 175, "Figure 3. Assessment and credential state controls", "Server-owned transitions prevent timer manipulation, duplicate scoring and duplicate credential issuance.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        gap = 7
        w = (self.width - 4 * gap) / 5
        y = 105
        labels = ["Eligible", "Attempt started", "Responses saved", "Submitted", "Scored"]
        for i, label in enumerate(labels):
            x = i * (w + gap)
            self.box(c, x, y, w, 35, label, "Immutable version and audit", PALE_BLUE, BLUE if i < 4 else PURPLE)
            if i:
                self.arrow(c, x - gap + 1, y + 17, x - 1, y + 17)
        branches = [
            ("Passed", GREEN, HexColor("#EAF9F1")),
            ("Failed", RED, HexColor("#FFF0EF")),
            ("Pending review", AMBER, HexColor("#FFF6E7")),
        ]
        bw = (self.width - 2 * gap) / 3
        for i, (label, stroke, fill) in enumerate(branches):
            x = i * (bw + gap)
            self.box(c, x, 48, bw, 29, label, "", fill, stroke)
            self.arrow(c, self.width - w / 2, y, x + bw / 2, 77)
        self.box(c, self.width * .20, 4, self.width * .60, 25, "Exactly-once credential issue", "Active -> suspended -> active or revoked", PALE_PURPLE, PURPLE)
        self.arrow(c, bw / 2, 48, self.width / 2, 29)


class DataDiagram(Diagram):
    def __init__(self, width):
        super().__init__(width, 198, "Figure 4. Versioned learning data boundaries", "Published content, assessment inputs and credentials remain reconstructable after future updates.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        gap = 10
        col_w = (self.width - 2 * gap) / 3
        groups = [
            ("CONTENT", BLUE, ["programs + courses", "versions + lessons", "competencies + assets"]),
            ("LEARNING", TEAL, ["enrollments + assignments", "progress + events", "review queue + labs"]),
            ("PROOF", PURPLE, ["blueprints + item revisions", "attempts + responses", "credentials + status"]),
        ]
        for col, (heading, stroke, items) in enumerate(groups):
            x = col * (col_w + gap)
            c.setFillColor(stroke)
            c.roundRect(x, 145, col_w, 23, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 7.3)
            c.drawCentredString(x + col_w / 2, 153, heading)
            for row, item in enumerate(items):
                y = 104 - row * 38
                self.box(c, x + 7, y, col_w - 14, 29, item, "", PALE, stroke)
                if row:
                    self.arrow(c, x + col_w / 2, y + 38, x + col_w / 2, y + 29)
        self.arrow(c, col_w, 81, col_w + gap, 81)
        self.arrow(c, 2 * col_w + gap, 43, 2 * (col_w + gap), 43)


class RoadmapDiagram(Diagram):
    def __init__(self, width):
        super().__init__(width, 151, "Figure 5. Controlled 14 to 18 week delivery sequence", "Foundations and progress reliability precede assessment, credentials and engagement optimization.")

    def draw(self):
        c = self.canv
        self.draw_header(c)
        labels = ["0. Baseline", "1. Catalog", "2. Lessons", "3. Labs", "4. Assessment", "5. Credentials", "6. Pilot"]
        strokes = [NAVY_2, BLUE, CYAN, TEAL, PURPLE, AMBER, RED]
        gap = 5
        w = (self.width - 3 * gap) / 4
        coords = []
        for i, (label, stroke) in enumerate(zip(labels, strokes)):
            x, y = (i * (w + gap), 77) if i < 4 else ((6 - i) * (w + gap), 24)
            coords.append((x, y))
            self.box(c, x, y, w, 31, label, "", PALE, stroke)
            if 0 < i < 4:
                px, py = coords[i - 1]
                self.arrow(c, px + w, py + 15, x, y + 15)
            elif i > 4:
                px, py = coords[i - 1]
                self.arrow(c, px, py + 15, x + w, y + 15)
        self.arrow(c, coords[3][0] + w / 2, coords[3][1], coords[4][0] + w / 2, coords[4][1] + 31)


class PlanDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        cover = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="cover")
        body = Frame(18 * mm, 18 * mm, PAGE_W - 36 * mm, PAGE_H - 34 * mm, leftPadding=0, rightPadding=0, topPadding=13 * mm, bottomPadding=9 * mm, id="body")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover], onPage=self.cover_page),
            PageTemplate(id="body", frames=[body], onPage=self.body_page),
        ])

    @staticmethod
    def cover_page(canvas, doc):
        canvas.setTitle("VeriTrust Learning and Certification System - Implementation Plan")
        canvas.setAuthor("VeriTrust")
        canvas.setSubject("Production learning, assessment and certification architecture")

    @staticmethod
    def body_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(BLUE)
        canvas.setLineWidth(1.1)
        canvas.line(18 * mm, PAGE_H - 15 * mm, PAGE_W - 18 * mm, PAGE_H - 15 * mm)
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.drawString(18 * mm, PAGE_H - 11.5 * mm, "VERITRUST  |  LEARNING AND CERTIFICATION")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.5)
        canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 11.5 * mm, "PRODUCTION IMPLEMENTATION PLAN")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(18 * mm, 13 * mm, PAGE_W - 18 * mm, 13 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.3)
        canvas.drawString(18 * mm, 8.5 * mm, "Learning UX | Assessment | Credentials | Delivery")
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
    styles.add(ParagraphStyle(name="TOCTitle", fontName="Helvetica-Bold", fontSize=23, leading=27, textColor=NAVY, spaceAfter=9))
    styles.add(ParagraphStyle(name="Deck", fontName="Helvetica", fontSize=9.6, leading=14, textColor=MUTED, spaceAfter=12))
    styles.add(ParagraphStyle(name="H2Major", fontName="Helvetica-Bold", fontSize=15.3, leading=18.2, textColor=NAVY, spaceBefore=11, spaceAfter=6.5, keepWithNext=True))
    styles.add(ParagraphStyle(name="H3Sub", fontName="Helvetica-Bold", fontSize=10.8, leading=13.3, textColor=BLUE, spaceBefore=7.5, spaceAfter=4, keepWithNext=True))
    styles.add(ParagraphStyle(name="BodyVT", fontName="Helvetica", fontSize=8.25, leading=11.75, textColor=INK, spaceAfter=5.2, allowWidows=0, allowOrphans=0))
    styles.add(ParagraphStyle(name="BulletVT", parent=styles["BodyVT"], leftIndent=12, firstLineIndent=-8, bulletIndent=1, spaceAfter=3.1))
    styles.add(ParagraphStyle(name="NumberVT", parent=styles["BodyVT"], leftIndent=18, firstLineIndent=-14, bulletIndent=0, spaceAfter=3.1))
    styles.add(ParagraphStyle(name="TableHeadVT", fontName="Helvetica-Bold", fontSize=6.9, leading=8.5, textColor=WHITE, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name="TableCellVT", fontName="Helvetica", fontSize=6.65, leading=8.45, textColor=INK))
    styles.add(ParagraphStyle(name="CaptionVT", fontName="Helvetica-Oblique", fontSize=6.7, leading=8.5, textColor=MUTED, alignment=TA_CENTER, spaceBefore=2, spaceAfter=7))
    styles.add(ParagraphStyle(name="CalloutVT", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=NAVY))
    return styles


def callout(text, styles, color=BLUE):
    table = Table([[""], [Paragraph(inline_markup(text), styles["CalloutVT"])]], colWidths=[PAGE_W - 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), color), ("TOPPADDING", (0, 0), (0, 0), 1.3), ("BOTTOMPADDING", (0, 0), (0, 0), 1.3),
        ("BACKGROUND", (0, 1), (0, 1), PALE_BLUE), ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("LEFTPADDING", (0, 1), (0, 1), 9), ("RIGHTPADDING", (0, 1), (0, 1), 9),
        ("TOPPADDING", (0, 1), (0, 1), 7), ("BOTTOMPADDING", (0, 1), (0, 1), 7),
    ]))
    return table


def parse_table(lines, start, styles):
    raw_rows, index = [], start
    while index < len(lines) and lines[index].strip().startswith("|"):
        raw_rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
        index += 1
    if len(raw_rows) < 2 or not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in raw_rows[1]):
        return None, start
    rows = [raw_rows[0]] + raw_rows[2:]
    columns = len(rows[0])
    available = PAGE_W - 40 * mm
    if columns == 2:
        widths = [available * .30, available * .70]
    elif columns == 3:
        widths = [available * .21, available * .31, available * .48]
    elif columns == 4:
        widths = [available * .19, available * .26, available * .37, available * .18]
    else:
        widths = [available / columns] * columns
    formatted = []
    for row_index, row in enumerate(rows):
        row = row + [""] * (columns - len(row))
        style = styles["TableHeadVT"] if row_index == 0 else styles["TableCellVT"]
        formatted.append([Paragraph(inline_markup(cell), style) for cell in row[:columns]])
    table = LongTable(formatted, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("GRID", (0, 0), (-1, -1), .45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    for row_index in range(1, len(formatted)):
        commands.append(("BACKGROUND", (0, row_index), (-1, row_index), WHITE if row_index % 2 else PALE))
    table.setStyle(TableStyle(commands))
    return table, index


def build_story(source_text, styles):
    lines = ascii_clean(source_text).splitlines()
    body_width = PAGE_W - 36 * mm
    story = [
        CoverFlowable(), NextPageTemplate("body"), PageBreak(),
        Paragraph("Contents", styles["TOCTitle"]),
        Paragraph("A complete current-state analysis and production blueprint for learning, practical labs, assessments, verifiable certificates, engagement, security, data, APIs, operations and delivery.", styles["Deck"]),
    ]
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontName="Helvetica-Bold", fontSize=8.5, leading=12.5, textColor=NAVY, spaceBefore=2.5),
        ParagraphStyle(name="TOC1", fontName="Helvetica", fontSize=7.2, leading=9.7, leftIndent=14, textColor=MUTED),
    ]
    story.extend([toc, PageBreak()])
    paragraph_lines = []

    def flush_paragraph():
        nonlocal paragraph_lines
        if not paragraph_lines:
            return
        text = " ".join(line.strip() for line in paragraph_lines).strip()
        paragraph_lines = []
        if not text:
            return
        if text.startswith("Important prerequisite:") or text.startswith("The engagement goal") or text.startswith("The strongest implementation sequence"):
            story.extend([callout(text, styles, TEAL), Spacer(1, 6)])
        else:
            story.append(Paragraph(inline_markup(text), styles["BodyVT"]))

    diagrams = {
        "2.": IntegrationDiagram,
        "6.": JourneyDiagram,
        "8.": AssessmentDiagram,
        "10.": DataDiagram,
        "20.": RoadmapDiagram,
    }

    index = 0
    while index < len(lines):
        stripped = lines[index].strip()
        if stripped.startswith("# "):
            flush_paragraph()
            index += 1
            continue
        if stripped.startswith("## "):
            flush_paragraph()
            title = stripped[3:].strip()
            story.extend([CondPageBreak(42 * mm), Paragraph(inline_markup(title), styles["H2Major"])] )
            for prefix, diagram_class in diagrams.items():
                if title.startswith(prefix):
                    diagram = diagram_class(body_width)
                    story.extend([diagram, Paragraph(diagram.caption, styles["CaptionVT"])])
                    break
            index += 1
            continue
        if stripped.startswith("### "):
            flush_paragraph()
            story.extend([CondPageBreak(24 * mm), Paragraph(inline_markup(stripped[4:].strip()), styles["H3Sub"])] )
            index += 1
            continue
        if stripped.startswith("|"):
            flush_paragraph()
            table, next_index = parse_table(lines, index, styles)
            if table is not None:
                story.extend([table, Spacer(1, 7)])
                index = next_index
                continue
        bullet = re.match(r"^-\s+(.*)$", stripped)
        numbered = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if bullet:
            flush_paragraph()
            story.append(Paragraph(inline_markup(bullet.group(1)), styles["BulletVT"], bulletText="-"))
            index += 1
            continue
        if numbered:
            flush_paragraph()
            story.append(Paragraph(inline_markup(numbered.group(2)), styles["NumberVT"], bulletText=f"{numbered.group(1)}."))
            index += 1
            continue
        if not stripped:
            flush_paragraph()
        else:
            paragraph_lines.append(lines[index])
        index += 1
    flush_paragraph()
    story.extend([Spacer(1, 12), callout("Recommended delivery principle: establish versioned data, authorization and reliable progress first; then add controlled assessment and credentials; optimize engagement only against measured learning and accessibility outcomes.", styles, TEAL)])
    return story


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    styles = make_styles()
    story = build_story(SOURCE.read_text(encoding="utf-8"), styles)
    document = PlanDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title="VeriTrust Learning and Certification System - Implementation Plan", author="VeriTrust",
    )
    document.multiBuild(story)
    print(OUTPUT)


if __name__ == "__main__":
    main()
