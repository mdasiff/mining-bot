const fs = require('fs/promises');
const puppeteer = require('puppeteer');
const { sleep, randomInt } = require('../utils/common');
const { COOKIE_FILE } = require('../io/files');
const { createUserAgentPicker } = require('./browserProfile');
const { simulateHumanBehavior, detectBlockPageText } = require('./behavior');
const { configurePageSession, navigateWithFlow } = require('./session');
const { extractStructuredData } = require('./extract');

async function scrapeUrl(sessionState, url, selectors, config, index, total) {
  const startedAt = new Date().toISOString();

  try {
    const response = await navigateWithFlow(
      sessionState.page,
      url,
      config,
      sessionState.previousUrl,
      sessionState.locale || 'en-US',
      sessionState
    );

    const pageText = await sessionState.page.evaluate(() => document.body?.innerText || '');
    if (detectBlockPageText(pageText)) {
      throw new Error('Block page detected by content scan');
    }

    await simulateHumanBehavior(sessionState.page, config);
    const extracted = await extractStructuredData(sessionState.page, selectors);

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

async function recreateSessionPage(sessionState) {
  try {
    await sessionState.page.close();
  } catch {
    // Ignore close failure.
  }

  const page = await sessionState.context.newPage();
  sessionState.page = page;
  sessionState.interceptionEnabled = false;
  sessionState.requestHandlerAttached = false;
  sessionState.lastHeaderReferer = null;
  sessionState.lastHeaderLocale = null;

  await configurePageSession(page, sessionState);
}

async function scrapeWithRetry(sessionState, url, selectors, config, index, total, runtimeState) {
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const result = await scrapeUrl(sessionState, url, selectors, config, index, total);

    if (result.status === 'error' && /Network\.setExtraHTTPHeaders timed out/i.test(result.error || '')) {
      console.warn(`[${index + 1}/${total}] recovering page session after header timeout...`);
      await recreateSessionPage(sessionState);
    }

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

async function saveCookies(context, writeJson) {
  const cookies = await context.cookies();
  await writeJson(COOKIE_FILE, cookies);
}

async function runPool(urls, selectors, config, writeJson) {
  const browser = await puppeteer.launch({
    headless: config.headless,
    protocolTimeout: 120000,
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
          context,
          userAgent: pickUserAgent(),
          previousUrl: null,
          interceptionEnabled: false,
          requestHandlerAttached: false,
          lastHeaderReferer: null,
          lastHeaderLocale: null
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
    await saveCookies(context, writeJson);

    for (const sessionState of sessionStates) {
      await sessionState.page.close();
    }

    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  runPool
};
