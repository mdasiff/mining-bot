const { sleep, randomInt } = require('../utils/common');
const { getViewportForUserAgent, inferProfileFromUserAgent } = require('./browserProfile');
const { shouldBlockRequest } = require('./behavior');

function getHomepage(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/`;
}

function chooseReferer(homepage, previousUrl) {
  const choice = randomInt(1, 3);

  if (choice === 1) return homepage;
  if (choice === 2 && previousUrl) return previousUrl;
  return undefined;
}

async function configurePageSession(page, sessionState) {
  const viewport = getViewportForUserAgent(sessionState.userAgent);
  const profile = inferProfileFromUserAgent(sessionState.userAgent);

  await page.setUserAgent(sessionState.userAgent);
  await page.setViewport(viewport);
  await page.emulateTimezone(profile.timezone);

  if (!sessionState.interceptionEnabled) {
    await page.setRequestInterception(true);
    sessionState.interceptionEnabled = true;
  }

  await page.evaluateOnNewDocument((runtimeProfile) => {
    Object.defineProperty(navigator, 'language', { get: () => runtimeProfile.locale });
    Object.defineProperty(navigator, 'languages', { get: () => [runtimeProfile.locale, 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => runtimeProfile.platform });
  }, profile);

  sessionState.locale = profile.locale;

  if (!sessionState.requestHandlerAttached) {
    page.on('request', (request) => {
      if (shouldBlockRequest(request.resourceType())) {
        request.abort();
        return;
      }

      request.continue();
    });

    sessionState.requestHandlerAttached = true;
  }
}

async function setDynamicHeaders(page, homepage, previousUrl, locale, sessionState) {
  const referer = chooseReferer(homepage, previousUrl);
  const refererKey = referer || '__none__';

  if (sessionState.lastHeaderReferer === refererKey && sessionState.lastHeaderLocale === locale) {
    return;
  }

  const headers = {
    'Accept-Language': `${locale},en;q=0.9`,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  if (referer) {
    headers.Referer = referer;
  }

  await sleep(randomInt(100, 300));

  try {
    await page.setExtraHTTPHeaders(headers);
    sessionState.lastHeaderReferer = refererKey;
    sessionState.lastHeaderLocale = locale;
  } catch (error) {
    console.warn(`Header update warning: ${error.message}`);
  }
}

async function warmupBrowse(page, homepage, config) {
  await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
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

    if (!randomLink) break;

    await page.goto(randomLink, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
    await sleep(randomInt(900, 2300));

    if (Math.random() < 0.45) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs }).catch(() => null);
      await sleep(randomInt(600, 1800));
    }
  }
}

async function navigateWithFlow(page, url, config, previousUrl, sessionLocale, sessionState) {
  const homepage = getHomepage(url);
  await setDynamicHeaders(page, homepage, previousUrl, sessionLocale, sessionState);

  const flowMode = randomInt(1, 3);

  if (flowMode === 1) {
    await sleep(randomInt(config.preNavigationDelayMsMin, config.preNavigationDelayMsMax));
    return page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
  }

  if (flowMode === 2) {
    await sleep(randomInt(5000, 15000));
    if (Math.random() < 0.2 + Math.random() * 0.4) {
      await warmupBrowse(page, homepage, config);
    }

    return page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
  }

  if (Math.random() < 0.2 + Math.random() * 0.4) {
    await warmupBrowse(page, homepage, config);
  }

  await sleep(randomInt(config.preNavigationDelayMsMin, config.preNavigationDelayMsMax));
  return page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeoutMs });
}

module.exports = {
  configurePageSession,
  navigateWithFlow
};
