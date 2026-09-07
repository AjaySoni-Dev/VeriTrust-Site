module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST, OPTIONS');
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { detail: 'Method not allowed. Use POST.' });
      return;
    }

    const hfToken = process.env.HF_ACCESS_TOKEN;
    if (!hfToken) {
      sendJson(res, 503, {
        detail: 'Voice transcription is not configured. Add HF_ACCESS_TOKEN to the Vercel environment and redeploy.'
      });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendJson(res, 401, { detail: 'Sign in to Nexora before using voice input.' });
      return;
    }

    let audioBuffer;
    try {
      audioBuffer = await readRequestBody(req);
    } catch (e) {
      sendJson(res, 400, { detail: 'Could not read audio data. ' + (e.message || '') });
      return;
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      sendJson(res, 400, { detail: 'No audio was received.' });
      return;
    }

    if (audioBuffer.length > 8 * 1024 * 1024) {
      sendJson(res, 413, { detail: 'Voice recording is too large. Keep recordings under 8 MB.' });
      return;
    }

    const start = Date.now();
    
    const contentType = req.headers['content-type'] || 'audio/wav';
    const base64Audio = audioBuffer.toString('base64');
    const dataUri = `data:${contentType};base64,${base64Audio}`;

    const falResponse = await fetch('https://router.huggingface.co/fal-ai/nvidia/nemotron-asr-multilingual/asr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ audio_url: dataUri })
    });

    if (!falResponse.ok) {
      let detail = "Speech transcription failed. Please try again.";
      if (falResponse.status === 401 || falResponse.status === 403) {
          detail = "Speech transcription is not authorized. Check the HF_ACCESS_TOKEN Vercel environment variable.";
      } else if (falResponse.status === 429) {
          detail = "Speech transcription is temporarily rate-limited. Please try again shortly.";
      } else if (falResponse.status >= 500) {
          detail = "The speech model is temporarily unavailable. Please try again shortly.";
      }
      try {
        const errPayload = await falResponse.json();
        if (errPayload.error) {
            detail = typeof errPayload.error === 'string' ? errPayload.error : JSON.stringify(errPayload.error);
        } else if (errPayload.detail) {
            detail = typeof errPayload.detail === 'string' ? errPayload.detail : JSON.stringify(errPayload.detail);
        }
      } catch (e) { /* ignore */ }
      
      sendJson(res, 502, { detail });
      return;
    }

    const output = await falResponse.json();

    let transcript = "";
    if (typeof output === "string") {
        transcript = output.trim();
    } else if (output && output.text) {
        transcript = output.text.trim();
    }

    if (!transcript) {
        sendJson(res, 422, { detail: 'No speech could be transcribed from that recording.' });
        return;
    }

    const duration_ms = Date.now() - start;
    
    sendJson(res, 200, {
      ok: true,
      text: transcript,
      model: "nvidia/nemotron-3.5-asr-streaming-0.6b",
      provider: "fal-ai",
      duration_ms: duration_ms
    });

  } catch (fatalError) {
    console.error("Fatal handler error:", fatalError);
    sendJson(res, 500, { detail: 'Fatal server error in speech-to-text: ' + (fatalError?.message || String(fatalError)) });
  }
};
