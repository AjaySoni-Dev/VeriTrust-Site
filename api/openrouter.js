const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); }
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { message: 'Method not allowed. Use POST.' } });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    sendJson(res, 500, {
      error: {
        message: 'OPENROUTER_API_KEY is missing on the server. Add it in Vercel Environment Variables and redeploy.'
      }
    });
    return;
  }

  let body;
  try {
    body = await readRequestBody(req);
  } catch {
    sendJson(res, 400, { error: { message: 'Invalid JSON request body.' } });
    return;
  }

  if (!Array.isArray(body.messages)) {
    sendJson(res, 400, { error: { message: 'Missing messages array.' } });
    return;
  }

  if (!body.model || typeof body.model !== 'string') {
    sendJson(res, 400, { error: { message: 'Missing model. The browser must send OPENROUTER_MODEL from config/app.config.js.' } });
    return;
  }

  const upstreamBody = {
    ...body,
    model: body.model,
    stream: Boolean(body.stream)
  };

  const origin = req.headers.origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL || 'https://nexora.ai';

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': /^https?:\/\//i.test(origin) ? origin : `https://${origin}`,
        'X-Title': process.env.OPENROUTER_APP_TITLE || 'Nexora AI'
      },
      body: JSON.stringify(upstreamBody)
    });
  } catch (error) {
    sendJson(res, 502, { error: { message: `Could not reach OpenRouter: ${error.message || 'network error'}` } });
    return;
  }

  res.statusCode = upstream.status;
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (upstreamBody.stream) {
    res.setHeader('Connection', 'keep-alive');
  }
  const contentType = upstream.headers.get('content-type') || (upstreamBody.stream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8');
  res.setHeader('Content-Type', contentType);

  if (!upstream.body) {
    const text = await upstream.text().catch(() => '');
    res.end(text);
    return;
  }

  try {
    for await (const chunk of upstream.body) {
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) sendJson(res, 502, { error: { message: error.message || 'Streaming failed.' } });
    else res.end();
  }
};
