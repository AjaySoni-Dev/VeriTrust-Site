'use strict';

// Single-process, single-browser Mermaid renderer. Every external operation has
// a deadline so a failed browser launch or malformed diagram cannot loop.
const fs = require('node:fs');
const path = require('node:path');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function withDeadline(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
    })
  ]).finally(() => clearTimeout(timer));
}

function listMermaidFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listMermaidFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.mmd')) files.push(absolute);
  }
  return files.sort();
}

async function main() {
  const puppeteerRoot = argument('--puppeteer');
  const mermaidScript = argument('--mermaid');
  const architectureRoot = path.resolve(__dirname);
  if (!puppeteerRoot || !fs.existsSync(puppeteerRoot)) throw new Error('Valid --puppeteer package path is required.');
  if (!mermaidScript || !fs.existsSync(mermaidScript)) throw new Error('Valid --mermaid browser bundle path is required.');

  const puppeteer = require(puppeteerRoot);
  const edgeCandidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const edge = edgeCandidates.find((candidate) => fs.existsSync(candidate));
  const launchOptions = {
    headless: true,
    timeout: 15000,
    args: ['--disable-gpu', '--disable-extensions', '--disable-background-networking', '--no-first-run']
  };
  if (edge) launchOptions.executablePath = edge;

  let browser;
  try {
    browser = await withDeadline(puppeteer.launch(launchOptions), 20000, 'Browser launch');
    const page = await browser.newPage();
    await page.setViewport({ width: 2200, height: 1600, deviceScaleFactor: 2 });
    page.setDefaultTimeout(20000);
    await page.setContent('<style>html,body{margin:0;background:#fff}#canvas{display:inline-block;padding:24px;background:#fff}</style><div id="canvas"></div>');
    await withDeadline(page.addScriptTag({ path: mermaidScript }), 20000, 'Mermaid script load');

    const files = listMermaidFiles(architectureRoot);
    for (let index = 0; index < files.length; index += 1) {
      const input = files[index];
      const output = input.replace(/\.mmd$/i, '.png');
      const source = fs.readFileSync(input, 'utf8');
      const dimensions = await withDeadline(page.evaluate(async ({ source, index }) => {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base' });
        const rendered = await window.mermaid.render(`veritrustDiagram${index}`, source);
        const canvas = document.getElementById('canvas');
        canvas.innerHTML = rendered.svg;
        const svg = canvas.querySelector('svg');
        const box = svg.getBBox();
        const width = Math.ceil(Math.max(box.width + 48, 320));
        const height = Math.ceil(Math.max(box.height + 48, 240));
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.style.maxWidth = 'none';
        return { width, height };
      }, { source, index }), 20000, `Render ${path.basename(input)}`);

      await page.setViewport({
        width: Math.min(Math.max(dimensions.width + 48, 800), 6000),
        height: Math.min(Math.max(dimensions.height + 48, 600), 6000),
        deviceScaleFactor: 2
      });
      const canvas = await page.$('#canvas');
      await withDeadline(canvas.screenshot({
        path: output,
      }), 25000, `Screenshot ${path.basename(input)}`);
      process.stdout.write(`rendered ${path.relative(architectureRoot, output)} ${dimensions.width}x${dimensions.height}\n`);
    }
    await page.close();
  } finally {
    if (browser) await withDeadline(browser.close(), 10000, 'Browser close').catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
