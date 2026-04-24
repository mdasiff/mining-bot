const { DEFAULT_CONFIG } = require('../../config/const');

function parseJsonWithTolerance(raw) {
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(withoutTrailingCommas);
}

function normalizeSelectors(selectors) {
  if (!selectors || typeof selectors !== 'object') {
    return {};
  }

  const result = {};

  for (const [fieldName, selectorValue] of Object.entries(selectors)) {
    const selectorList = Array.isArray(selectorValue) ? selectorValue : [selectorValue];
    const cleanSelectors = selectorList
      .map((selector) => (typeof selector === 'string' ? selector.trim() : ''))
      .filter(Boolean);

    if (cleanSelectors.length > 0) {
      result[fieldName] = cleanSelectors;
    }
  }

  return result;
}

function sanitizeConfig() {
  const cfg = { ...DEFAULT_CONFIG };

  cfg.concurrency = Math.min(2, Math.max(1, Number(cfg.concurrency) || DEFAULT_CONFIG.concurrency));
  cfg.minDelayMs = Math.max(8000, Number(cfg.minDelayMs) || DEFAULT_CONFIG.minDelayMs);
  cfg.maxDelayMs = Math.max(20000, cfg.minDelayMs, Number(cfg.maxDelayMs) || DEFAULT_CONFIG.maxDelayMs);
  cfg.navigationTimeoutMs = Math.max(30000, Number(cfg.navigationTimeoutMs) || DEFAULT_CONFIG.navigationTimeoutMs);
  cfg.preExtractWaitMsMin = Math.max(1000, Number(cfg.preExtractWaitMsMin) || DEFAULT_CONFIG.preExtractWaitMsMin);
  cfg.preExtractWaitMsMax = Math.max(cfg.preExtractWaitMsMin, Number(cfg.preExtractWaitMsMax) || DEFAULT_CONFIG.preExtractWaitMsMax);
  cfg.postLoadWaitMsMin = Math.max(500, Number(cfg.postLoadWaitMsMin) || DEFAULT_CONFIG.postLoadWaitMsMin);
  cfg.postLoadWaitMsMax = Math.max(cfg.postLoadWaitMsMin, Number(cfg.postLoadWaitMsMax) || DEFAULT_CONFIG.postLoadWaitMsMax);
  cfg.postScrollWaitMsMin = Math.max(500, Number(cfg.postScrollWaitMsMin) || DEFAULT_CONFIG.postScrollWaitMsMin);
  cfg.postScrollWaitMsMax = Math.max(cfg.postScrollWaitMsMin, Number(cfg.postScrollWaitMsMax) || DEFAULT_CONFIG.postScrollWaitMsMax);
  cfg.longBreakChance = Math.min(1, Math.max(0, Number(cfg.longBreakChance) || DEFAULT_CONFIG.longBreakChance));
  cfg.longBreakMinMs = Math.max(1000, Number(cfg.longBreakMinMs) || DEFAULT_CONFIG.longBreakMinMs);
  cfg.longBreakMaxMs = Math.max(cfg.longBreakMinMs, Number(cfg.longBreakMaxMs) || DEFAULT_CONFIG.longBreakMaxMs);
  cfg.maxRetries = Math.max(0, Number(cfg.maxRetries) || DEFAULT_CONFIG.maxRetries);
  cfg.retryDelayMsMin = Math.max(1000, Number(cfg.retryDelayMsMin) || DEFAULT_CONFIG.retryDelayMsMin);
  cfg.retryDelayMsMax = Math.max(cfg.retryDelayMsMin, Number(cfg.retryDelayMsMax) || DEFAULT_CONFIG.retryDelayMsMax);
  cfg.preNavigationDelayMsMin = 2000;
  cfg.preNavigationDelayMsMax = 5000;
  cfg.sessionResetChance = 0.15;

  return cfg;
}

function parseInputConfig(raw) {
  let parsed;

  try {
    parsed = parseJsonWithTolerance(raw);
  } catch (error) {
    throw new Error(`Invalid url.json format: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('url.json must be an object: { "urls": [...], "selectors": {...} }');
  }

  const urls = Array.isArray(parsed.urls) ? parsed.urls : [];
  const cleanUrls = urls
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => /^https?:\/\//i.test(url));

  if (cleanUrls.length === 0) {
    throw new Error('url.json must include a non-empty urls array with valid http/https URLs');
  }

  const selectors = normalizeSelectors(parsed.selectors);

  if (Object.keys(selectors).length === 0) {
    throw new Error('url.json must include selectors object with field selectors');
  }

  return { urls: cleanUrls, selectors };
}

module.exports = {
  sanitizeConfig,
  parseInputConfig
};
