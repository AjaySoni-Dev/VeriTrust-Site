// Private route implementation; api/system.js is the Vercel entrypoint.
const { publishedModelCards } = require('../../platform');
const { HttpError, handleApiError, handleOptions, sendJson } = require('../../veritrust-api');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Use GET for this endpoint.');
    const url = new URL(req.url || '/', 'http://localhost');
    const modelKey = String(url.searchParams.get('model') || '').trim();
    const cards = await publishedModelCards(modelKey || null);
    sendJson(res, 200, {
      ok: true,
      cards: Array.isArray(cards) ? cards : [],
      governance_status: Array.isArray(cards) && cards.length ? 'published' : 'validation_pending',
    });
  } catch (error) {
    handleApiError(res, error, 'Model governance information is unavailable.');
  }
};
