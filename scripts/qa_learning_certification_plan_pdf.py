from __future__ import annotations

import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "output" / "pdf" / "VeriTrust_Learning_and_Certification_Implementation_Plan.pdf"
SOURCE = ROOT / "docs" / "learning-certification-implementation-plan.md"
OUT = ROOT / "tmp" / "pdfs" / "learning-certification-plan-qa"
OUT.mkdir(parents=True, exist_ok=True)

reader = PdfReader(PDF)
source_text = SOURCE.read_text(encoding="utf-8")
major_headings = re.findall(r"^##\s+(.+)$", source_text, flags=re.MULTILINE)

with pdfplumber.open(PDF) as document:
    page_texts = [page.extract_text() or "" for page in document.pages]
    full_text = "\n".join(page_texts)
    blank_pages = [index + 1 for index, text in enumerate(page_texts) if len(text.strip()) < 20]
    missing_headings = [heading for heading in major_headings if heading not in full_text]
    edge_warnings = []
    for index, page in enumerate(document.pages, start=1):
        for word in page.extract_words() or []:
            if word["x0"] < -0.5 or word["x1"] > page.width + 0.5 or word["top"] < -0.5 or word["bottom"] > page.height + 0.5:
                edge_warnings.append((index, word.get("text", "")))

print({
    "pages": len(reader.pages),
    "pdf_bytes": PDF.stat().st_size,
    "blank_pages": blank_pages,
    "missing_major_headings": missing_headings,
    "edge_warnings": edge_warnings[:10],
    "source_words": len(re.findall(r"\b\w+\b", source_text)),
    "pdf_words": len(re.findall(r"\b\w+\b", full_text)),
})

document = pdfium.PdfDocument(PDF)
rendered = []
for index in range(len(document)):
    page = document[index]
    bitmap = page.render(scale=1.5)
    image = bitmap.to_pil().convert("RGB")
    path = OUT / f"page-{index + 1:02d}.png"
    image.save(path)
    rendered.append(image)

thumbs = []
for index, image in enumerate(rendered, start=1):
    width = 260
    height = round(image.height * width / image.width)
    thumb = image.resize((width, height))
    canvas = Image.new("RGB", (width, height + 28), "white")
    canvas.paste(thumb, (0, 28))
    ImageDraw.Draw(canvas).text((9, 8), f"Page {index}", fill="black")
    thumbs.append(canvas)

per_sheet = 12
columns = 4
for start in range(0, len(thumbs), per_sheet):
    batch = thumbs[start:start + per_sheet]
    rows = (len(batch) + columns - 1) // columns
    cell_w = max(image.width for image in batch)
    cell_h = max(image.height for image in batch)
    sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), "#D8E2EC")
    for offset, image in enumerate(batch):
        x = (offset % columns) * cell_w
        y = (offset // columns) * cell_h
        sheet.paste(image, (x, y))
    sheet.save(OUT / f"contact-{start // per_sheet + 1}.png")

print({"rendered": len(rendered), "contact_sheets": (len(thumbs) + per_sheet - 1) // per_sheet, "output": str(OUT)})
