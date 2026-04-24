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

async function ensureFiles() {
  await fs.mkdir(JSON_DIR, { recursive: true });

  try {
    await fs.access(URL_FILE);
  } catch {
    const starter = {
      urls: [
        'https://example.com/property-1'
      ],
      selectors: {
        title: ['h1'],
        price: ["[class*='price']"],
        location: ["[class*='location']"]
      }
    };

    await fs.writeFile(URL_FILE, JSON.stringify(starter, null, 2));
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

  cfg.concurrency = Math.max(1, Number(cfg.concurrency) || DEFAULT_CONFIG.concurrency);
  cfg.minDelayMs = Math.max(300, Number(cfg.minDelayMs) || DEFAULT_CONFIG.minDelayMs);
  cfg.maxDelayMs = Math.max(cfg.minDelayMs, Number(cfg.maxDelayMs) || DEFAULT_CONFIG.maxDelayMs);
  cfg.navigationTimeoutMs = Math.max(10000, Number(cfg.navigationTimeoutMs) || DEFAULT_CONFIG.navigationTimeoutMs);

  return cfg;
}

function extractUrlsFromRawText(raw) {
  return raw.match(/https?:\/\/[^\s",}]+/g) || [];
}

function normalizeSelectors(selectors) {
  if (!selectors || typeof selectors !== 'object') {
    return {};
  }

  const result = {};

  for (const [fieldName, selectorList] of Object.entries(selectors)) {
    if (!Array.isArray(selectorList)) {
      continue;
    }

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
    parsed = JSON.parse(raw);
  } catch {
    return {
      urls: extractUrlsFromRawText(raw),
      selectors: {}
    };
  }

  const urls = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.urls)
      ? parsed.urls
      : Object.keys(parsed || {});

  const cleanUrls = urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u));

  if (cleanUrls.length === 0) {
    throw new Error('url.json must contain valid URLs');
  }

  const selectors = normalizeSelectors(parsed?.selectors);

  if (Object.keys(selectors).length === 0) {
    throw new Error('url.json must include selectors object, e.g. {"selectors": {"title": ["h1"]}}');
  }

  return {
    urls: cleanUrls,
    selectors
  };
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function scrapeUrl(browser, url, selectors, config, index, total) {
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();

  try {
    await page.setUserAgent(USER_AGENTS[index % USER_AGENTS.length]);
    await page.setViewport({ width: 1366, height: 768 });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeoutMs
    });

    await sleep(randomInt(1200, 3000));

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

      const structured = {};

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
            // Ignore invalid selectors and continue.
          }
        }

        structured[fieldName] = {
          value,
          matchedSelector
        };
      }

      return {
        extractedAt: new Date().toISOString(),
        pageUrl: window.location.href,
        documentTitle: document.title,
        fields: structured
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

async function runPool(urls, selectors, config) {
  const browser = await puppeteer.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];

      const result = await scrapeUrl(browser, url, selectors, config, index, urls.length);
      results[index] = result;

      await sleep(randomInt(config.minDelayMs, config.maxDelayMs));
    }
  }

  const workerTasks = Array.from({ length: Math.min(config.concurrency, urls.length) }, () => worker());

  await Promise.all(workerTasks);
  await browser.close();

  return results;
}

(async () => {
  try {
    await ensureFiles();

    const { urls, selectors } = await readInputConfig();
    const config = sanitizeConfig();

    console.log(`Starting scrape for ${urls.length} URLs in one browser instance...`);
    console.log(`Selectors configured: ${Object.keys(selectors).length}`);

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
