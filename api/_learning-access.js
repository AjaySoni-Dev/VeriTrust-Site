const {
  HttpError,
  handleApiError,
  handleOptions,
  parseJsonBody,
  sendJson,
} = require('../lib/veritrust-api');
const { validateJsonContentType } = require('../lib/validators');
const { enforceRateLimit } = require('../lib/rate-limit');
const { trustedSiteOrigin } = require('../lib/browser-session');
const {
  createLearningAccessToken,
  expiredLearningAccessCookie,
  hasLearningAccess,
  learningAccessCookie,
  learningAccessKeyMatches,
  safeLearningDestination,
} = require('../lib/learning-access');

function requireSameOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin || origin !== trustedSiteOrigin(req)) {
    throw new HttpError(403, 'Learning access requests must come from this site.', { code: 'ORIGIN_NOT_ALLOWED' });
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, unlocked: hasLearningAccess(req) });
      return;
    }

    if (req.method === 'DELETE') {
      requireSameOrigin(req);
      res.setHeader('Set-Cookie', expiredLearningAccessCookie());
      sendJson(res, 200, { ok: true, unlocked: false });
      return;
    }

    if (req.method !== 'POST') {
      throw new HttpError(405, 'Use GET, POST, or DELETE for this endpoint.', { code: 'METHOD_NOT_ALLOWED' });
    }

    requireSameOrigin(req);
    await enforceRateLimit({
      req,
      endpoint: 'learning:preview-access',
      limit: 20,
      identityType: 'ip',
    });
    validateJsonContentType(req);
    const body = await parseJsonBody(req, 4096);
    const candidate = String(body.key || '');
    if (!candidate || candidate.length > 256 || !learningAccessKeyMatches(candidate)) {
      throw new HttpError(401, 'The development access key is not valid.', { code: 'INVALID_LEARNING_ACCESS_KEY' });
    }

    const redirect = safeLearningDestination(body.next);
    res.setHeader('Set-Cookie', learningAccessCookie(createLearningAccessToken()));
    sendJson(res, 200, { ok: true, unlocked: true, redirect });
  } catch (error) {
    handleApiError(res, error, 'Learning preview access could not be verified.');
  }
};
