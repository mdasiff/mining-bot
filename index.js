const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');
const { DEFAULT_CONFIG, USER_AGENTS } = require('./config/const');

const JSON_DIR = path.join(__dirname, 'json-files');
const URL_FILE = path.join(JSON_DIR, 'url.json');
const OUTPUT_FILE = path.join(JSON_DIR, 'output.json');
const LOG_FILE = path.join(JSON_DIR, 'log.json');
const COOKIE_FILE = path.join(JSON_DIR, 'cookies.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function createUserAgentPicker() {
  let pool = [];

  return () => {
    if (pool.length === 0) {
      pool = [...USER_AGENTS]
        .map((ua) => ({ ua, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map((item) => item.ua);
    }

    return pool.pop();
  };
}

function isMobileUserAgent(userAgent) {
  return /Android|iPhone|Mobile/i.test(userAgent);
}

function getViewportForUserAgent(userAgent) {
  if (isMobileUserAgent(userAgent)) {
    return { width: 375, height: 812, isMobile: true };
  }

  return { width: 1366, height: 768, isMobile: false };
}

function shouldBlockRequest(resourceType) {
  return resourceType === 'image' || resourceType === 'font';
}

function inferProfileFromUserAgent(userAgent) {
  const isMobile = isMobileUserAgent(userAgent);
  const isMac = /Macintosh|iPhone/i.test(userAgent);
  const isWindows = /Windows/i.test(userAgent);

  if (isMobile) {
    return {
      timezone: 'America/New_York',
      locale: 'en-US',
      platform: /iPhone/i.test(userAgent) ? 'iPhone' : 'Linux armv8l'
    };
  }

  if (isMac) {
    return {
      timezone: 'America/Los_Angeles',
      locale: 'en-US',
      platform: 'MacIntel'
    };
  }

  if (isWindows) {
    return {
      timezone: 'America/Chicago',
      locale: 'en-US',
      platform: 'Win32'
    };
  }

  return {
    timezone: 'America/New_York',
    locale: 'en-US',
    platform: 'Linux x86_64'
  };
}

async function simulateHumanBehavior(page, config) {
  await sleep(randomInt(config.postLoadWaitMsMin, config.postLoadWaitMsMax));

  // Sometimes user just reads.
  if (Math.random() < 0.35) {
    await sleep(randomInt(5000, 15000));
    return;
  }

  const totalHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const steps = randomInt(3, 7);

  for (let i = 1; i <= steps; i += 1) {
    const nextY = Math.min(totalHeight, Math.floor((totalHeight / steps) * i));
    await page.mouse.move(randomInt(120, 1200), randomInt(120, 700), { steps: randomInt(8, 20) });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), nextY);
    await sleep(randomInt(400, 1200));
  }

  await sleep(randomInt(config.postScrollWaitMsMin, config.postScrollWaitMsMax));

  if (Math.random() < 0.7) {
    await page.mouse.click(randomInt(60, 1100), randomInt(100, 650), { delay: randomInt(50, 180) });
  }

  if (Math.random() < config.longBreakChance) {
    await sleep(randomInt(config.longBreakMinMs, config.longBreakMaxMs));
  }

  await sleep(randomInt(config.preExtractWaitMsMin, config.preExtractWaitMsMax));
}

function detectBlockPageText(content) {
  return /access denied|request blocked|forbidden|temporarily unavailable|bot detected|security check/i.test(content);
}

function parseJsonWithTolerance(raw) {
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, '');
  const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(withoutTrailingCommas);
}

async function ensureFiles() {
  await fs.mkdir(JSON_DIR, { recursive: true });

  try {
    await fs.access(URL_FILE);
  } catch {
    throw new Error(`Missing input file: ${URL_FILE}. Please create it with { "urls": [...], "selectors": {...} }`);
  }

  for (const file of [OUTPUT_FILE, LOG_FILE, COOKIE_FILE]) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, '[]');
    }
  }
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

async function readInputConfig() {
  const raw = await fs.readFile(URL_FILE, 'utf8');
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

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function getHomepage(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/`;
}

function chooseReferer(homepage, previousUrl) {
  const choice = randomInt(1, 3);

  if (choice === 1) {
    return homepage;
  }

  if (choice === 2 && previousUrl) {
    return previousUrl;
  }

  return undefined;
}

async function configurePageSession(page, sessionState) {
  const viewport = getViewportForUserAgent(sessionState.userAgent);
  const profile = inferProfileFromUserAgent(sessionState.userAgent);

  await page.setUserAgent(sessionState.userAgent);
  await page.setViewport(viewport);
  await page.setRequestInterception(true);
  await page.emulateTimezone(profile.timezone);

  await page.evaluateOnNewDocument((runtimeProfile) => {
    Object.defineProperty(navigator, 'language', {
      get: () => runtimeProfile.locale
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => [runtimeProfile.locale, 'en']
    });

    Object.defineProperty(navigator, 'platform', {
      get: () => runtimeProfile.platform
    });
  }, profile);

  sessionState.locale = profile.locale;

  page.removeAllListeners('request');
  page.on('request', (request) => {
    if (shouldBlockRequest(request.resourceType())) {
      request.abort();
      return;
    }

    request.continue();
  });
}


async function setDynamicHeaders(page, homepage, previousUrl, locale) {
  const referer = chooseReferer(homepage, previousUrl);
  const headers = {
    'Accept-Language': `${locale},en;q=0.9`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  if (referer) {
    headers.Referer = referer;
  }

  await page.setExtraHTTPHeaders(headers);
}

async function warmupBrowse(page, homepage, config) {
  await page.goto(homepage, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs
  });

  await sleep(randomInt(1200, 3500));

  const explorationSteps = randomInt(1, 2);

  for (let step = 0; step < explorationSteps; step += 1) {
    const randomLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.href)
        .filter((href) => href && href.startsWith(window.location.origin));

      if (links.length === 0) {
        return null;
      }

      return links[Math.floor(Math.random() * links.length)];
    });

    if (!randomLink) {
      break;
    }

    await page.goto(randomLink, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs
    });
    await sleep(randomInt(900, 2300));

    if (Math.random() < 0.45) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs }).catch(() => null);
      await sleep(randomInt(600, 1800));
    }
  }
}


async function navigateWithFlow(page, url, config, previousUrl, sessionLocale) {
  const homepage = getHomepage(url);
  await setDynamicHeaders(page, homepage, previousUrl, sessionLocale);

  const flowMode = randomInt(1, 3);

  // Mode 1: direct with short idle
  if (flowMode === 1) {
    await sleep(randomInt(config.preNavigationDelayMsMin, config.preNavigationDelayMsMax));
    return page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs
    });
  }

  // Mode 2: idle then warm-up then target
  if (flowMode === 2) {
    await sleep(randomInt(5000, 15000));
    if (Math.random() < 0.2 + Math.random() * 0.4) {
      await warmupBrowse(page, homepage, config);
    }
    return page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs
    });
  }

  // Mode 3: warm-up first then idle then target
  if (Math.random() < 0.2 + Math.random() * 0.4) {
    await warmupBrowse(page, homepage, config);
  }
  await sleep(randomInt(config.preNavigationDelayMsMin, config.preNavigationDelayMsMax));

  return page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.navigationTimeoutMs
  });
}


async function scrapeUrl(sessionState, url, selectors, config, index, total) {
  const startedAt = new Date().toISOString();

  try {
    const response = await navigateWithFlow(sessionState.page, url, config, sessionState.previousUrl, sessionState.locale || "en-US");

    const pageText = await sessionState.page.evaluate(() => document.body?.innerText || '');
    if (detectBlockPageText(pageText)) {
      throw new Error('Block page detected by content scan');
    }

    await simulateHumanBehavior(sessionState.page, config);

    const extracted = await sessionState.page.evaluate((selectorMap) => {
      const pickValue = (selector) => {
        const node = document.querySelector(selector);
        if (!node) {
          return null;
        }

        const contentAttr = node.getAttribute('content');
        const valueAttr = node.getAttribute('value');
        const text = node.textContent?.trim();

        return contentAttr || valueAttr || text || null;
      };

      const fields = {};

      for (const [fieldName, selectorList] of Object.entries(selectorMap)) {
        let value = null;
        let matchedSelector = null;

        for (const selector of selectorList) {
          try {
            value = pickValue(selector);
            if (value) {
              matchedSelector = selector;
              break;
            }
          } catch {
            // Ignore invalid selector and continue.
          }
        }

        fields[fieldName] = { value, matchedSelector };
      }

      return {
        extractedAt: new Date().toISOString(),
        pageUrl: window.location.href,
        fields
      };
    }, selectors);

    sessionState.previousUrl = url;
    console.log(`[${index + 1}/${total}] ✅ ${url}`);

    return {
      status: 'success',
      url,
      startedAt,
      endedAt: new Date().toISOString(),
      response: {
        status: response?.status() ?? null,
        ok: response?.ok() ?? null
      },
      data: extracted
    };
  } catch (error) {
    console.log(`[${index + 1}/${total}] ❌ ${url} -> ${error.message}`);

    return {
      status: 'error',
      url,
      startedAt,
      endedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

async function scrapeWithRetry(sessionState, url, selectors, config, index, total, runtimeState) {
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const result = await scrapeUrl(sessionState, url, selectors, config, index, total);

    if (result.status === 'success') {
      runtimeState.delayMultiplier = Math.max(1, runtimeState.delayMultiplier - 0.2);
      return result;
    }

    runtimeState.delayMultiplier = Math.min(3, runtimeState.delayMultiplier + 0.5);

    const isLastAttempt = attempt === config.maxRetries;
    if (!isLastAttempt) {
      const retryDelay = Math.floor(randomInt(config.retryDelayMsMin, config.retryDelayMsMax) * runtimeState.delayMultiplier);
      console.log(`[${index + 1}/${total}] retrying in ${retryDelay}ms (attempt ${attempt + 2}/${config.maxRetries + 1})`);
      await sleep(retryDelay);
    }
  }

  return {
    status: 'error',
    url,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    error: 'Retries exhausted'
  };
}

async function loadCookies(context, urls, config) {
  const raw = await fs.readFile(COOKIE_FILE, 'utf8');
  const cookies = JSON.parse(raw);

  if (!Array.isArray(cookies) || cookies.length === 0) {
    return;
  }

  if (Math.random() < config.sessionResetChance) {
    console.log('Session aging triggered: starting fresh (skipping stored cookies).');
    return;
  }

  const domains = new Set(
    urls.map((url) => {
      const host = new URL(url).hostname;
      return host.startsWith('www.') ? host.slice(4) : host;
    })
  );

  const filtered = cookies.filter((cookie) => {
    const cookieDomain = (cookie.domain || '').replace(/^\./, '');
    if (!cookieDomain) {
      return false;
    }

    return [...domains].some((domain) => domain === cookieDomain || domain.endsWith(`.${cookieDomain}`) || cookieDomain.endsWith(`.${domain}`));
  });

  if (filtered.length > 0) {
    await context.setCookie(...filtered);
  }
}


async function saveCookies(context) {
  const cookies = await context.cookies();
  await writeJson(COOKIE_FILE, cookies);
}

async function runPool(urls, selectors, config) {
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.createBrowserContext();

  try {
    await loadCookies(context, urls, config);

    const pickUserAgent = createUserAgentPicker();
    const sessionStates = await Promise.all(
      Array.from({ length: Math.min(config.concurrency, urls.length) }, async () => {
        const page = await context.newPage();
        const sessionState = {
          page,
          userAgent: pickUserAgent(),
          previousUrl: null
        };

        await configurePageSession(page, sessionState);
        return sessionState;
      })
    );

    const runtimeState = { delayMultiplier: 1 };
    const results = [];
    let cursor = 0;

    const worker = async (sessionState) => {
      while (cursor < urls.length) {
        const index = cursor++;
        const url = urls[index];

        const result = await scrapeWithRetry(sessionState, url, selectors, config, index, urls.length, runtimeState);
        results[index] = result;

        const baseDelay = randomInt(config.minDelayMs, config.maxDelayMs);
        await sleep(Math.floor(baseDelay * runtimeState.delayMultiplier));
      }
    };

    await Promise.all(sessionStates.map((sessionState) => worker(sessionState)));
    await saveCookies(context);

    for (const sessionState of sessionStates) {
      await sessionState.page.close();
    }

    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  try {
    await ensureFiles();

    const { urls, selectors } = await readInputConfig();
    const config = sanitizeConfig();

    console.log(`Starting scrape for ${urls.length} URLs in one browser context...`);

    const results = await runPool(urls, selectors, config);
    const output = results.filter((entry) => entry.status === 'success');
    const logs = results.map((entry) => ({
      url: entry.url,
      status: entry.status,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      error: entry.error || null
    }));

    await writeJson(OUTPUT_FILE, output);
    await writeJson(LOG_FILE, logs);

    const successCount = output.length;
    const errorCount = logs.length - successCount;

    console.log(`Completed. Success: ${successCount}, Error: ${errorCount}`);
    console.log(`Output file: ${OUTPUT_FILE}`);
    console.log(`Log file: ${LOG_FILE}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  }
})();
