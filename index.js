const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');
const { DEFAULT_CONFIG, USER_AGENTS } = require('./config/const');

const JSON_DIR = path.join(__dirname, 'json-files');
const URL_FILE = path.join(JSON_DIR, 'url.json');
const OUTPUT_FILE = path.join(JSON_DIR, 'output.json');
const LOG_FILE = path.join(JSON_DIR, 'log.json');

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

async function simulateHumanBehavior(page, config) {
  await sleep(randomInt(config.postLoadWaitMsMin, config.postLoadWaitMsMax));

  const totalHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const steps = randomInt(4, 8);

  for (let i = 1; i <= steps; i += 1) {
    const nextY = Math.min(totalHeight, Math.floor((totalHeight / steps) * i));
    await page.mouse.move(randomInt(120, 1200), randomInt(120, 700), { steps: randomInt(8, 20) });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), nextY);
    await sleep(randomInt(500, 1400));
  }

  await sleep(randomInt(config.postScrollWaitMsMin, config.postScrollWaitMsMax));
  await page.mouse.click(randomInt(60, 1100), randomInt(100, 650), { delay: randomInt(50, 180) });

  if (Math.random() < config.longBreakChance) {
    await sleep(randomInt(config.longBreakMinMs, config.longBreakMaxMs));
  }

  await sleep(randomInt(config.preExtractWaitMsMin, config.preExtractWaitMsMax));
}


async function ensureFiles() {
  await fs.mkdir(JSON_DIR, { recursive: true });

  try {
    await fs.access(URL_FILE);
  } catch {
    throw new Error(`Missing input file: ${URL_FILE}. Please create it with { "urls": [...], "selectors": {...} }`);
  }

  for (const file of [OUTPUT_FILE, LOG_FILE]) {
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

  return cfg;
}



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

  return {
    urls: cleanUrls,
    selectors
  };
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function scrapeUrl(browser, url, selectors, config, index, total, pickUserAgent) {
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();

  try {
    await page.setUserAgent(pickUserAgent());
    await page.setViewport({ width: 1366, height: 768 });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs
    });

    await simulateHumanBehavior(page, config);

    const extracted = await page.evaluate((selectorMap) => {
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

        fields[fieldName] = {
          value,
          matchedSelector
        };
      }

      return {
        extractedAt: new Date().toISOString(),
        pageUrl: window.location.href,
        fields
      };
    }, selectors);

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
  } finally {
    await page.close();
  }
}

async function scrapeWithRetry(browser, url, selectors, config, index, total, pickUserAgent) {
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const result = await scrapeUrl(browser, url, selectors, config, index, total, pickUserAgent);

    if (result.status === 'success') {
      return result;
    }

    const isLastAttempt = attempt === config.maxRetries;
    if (!isLastAttempt) {
      const retryDelay = randomInt(config.retryDelayMsMin, config.retryDelayMsMax);
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


async function runPool(urls, selectors, config) {
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  let cursor = 0;
  const pickUserAgent = createUserAgentPicker();

  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];

      const result = await scrapeWithRetry(browser, url, selectors, config, index, urls.length, pickUserAgent);
      results[index] = result;

      await sleep(randomInt(config.minDelayMs, config.maxDelayMs));
    }
  };

  const workerTasks = Array.from({ length: Math.min(config.concurrency, urls.length) }, () => worker());

  try {
    await Promise.all(workerTasks);
    return results;
  } finally {
    await browser.close();
  }
}


(async () => {
  try {
    await ensureFiles();

    const { urls, selectors } = await readInputConfig();
    const config = sanitizeConfig();

    console.log(`Starting scrape for ${urls.length} URLs in one browser instance...`);

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
