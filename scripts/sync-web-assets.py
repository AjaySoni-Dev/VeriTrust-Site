"""Keep development and static deployment copies of the generation pipeline identical."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'pages/shared/nexora-web-project.js',
    'pages/shared/nexora-editor-handoff.js',
    'pages/chat/script/app.js',
    'pages/chat/index.html',
    'pages/editor/index.html',
    'pages/login/index.html',
    'pages/sign-up/index.html',
    'pages/forgot-password/index.html',
    'pages/auth-responsive.css',
    'pages/template/preview.css',
    'schemas/nexora.web-project.schema.json',
    'index.html',
]

for name in FILES:
    source = ROOT / name
    destination = ROOT / 'public' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
