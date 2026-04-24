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
        {
          url: 'https://example.com/property-1',
          selectors: {
            field_name_1: ['h1'],
            field_name_2: ["[data-qa='value']", "[class*='value']"]
          }
        }
      ],
      selectors: {
        fallback_field: ['title']
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

function normalizeTargets(parsed) {
  const globalSelectors = normalizeSelectors(parsed?.selectors);
  const sourceUrls = Array.isArray(parsed?.urls) ? parsed.urls : Array.isArray(parsed) ? parsed : [];

  const targets = sourceUrls
    .map((entry) => {
      if (typeof entry === 'string') {
        return {
          url: entry.trim(),
          selectors: globalSelectors
        };
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const url = typeof entry.url === 'string' ? entry.url.trim() : '';
      const localSelectors = normalizeSelectors(entry.selectors);

      return {
        url,
        selectors: Object.keys(localSelectors).length > 0 ? localSelectors : globalSelectors
      };
    })
    .filter((target) => target && /^https?:\/\//i.test(target.url));

  return targets;
}

async function readInputConfig() {
  const raw = await fs.readFile(URL_FILE, 'utf8');

  try {
    const parsed = JSON.parse(raw);
    const targets = normalizeTargets(parsed);

    if (targets.length === 0) {
      throw new Error('url.json must contain urls array with valid URLs');
    }

    const missingSelectors = targets.filter((target) => Object.keys(target.selectors).length === 0).length;
    if (missingSelectors > 0) {
      throw new Error('Every URL must have selectors (global selectors or per-url selectors).');
    }

    return { targets };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const urls = extractUrlsFromRawText(raw).map((url) => ({ url, selectors: {} }));
      if (urls.length > 0) {
        throw new Error('Invalid JSON format. Please provide selectors with valid JSON.');
      }
    }

    throw error;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function scrapeUrl(browser, target, config, index, total) {
  const page = await browser.newPage();
  const startedAt = new Date().toISOString();

  try {
    await page.setUserAgent(USER_AGENTS[index % USER_AGENTS.length]);
    await page.setViewport({ width: 1366, height: 768 });

    const response = await page.goto(target.url, {
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
    }, target.selectors);

    console.log(`[${index + 1}/${total}] ✅ ${target.url}`);

    return {
      status: 'success',
      url: target.url,
      startedAt,
      endedAt: new Date().toISOString(),
      response: {
        status: response?.status() ?? null,
        ok: response?.ok() ?? null
      },
      data: extracted
    };
  } catch (error) {
    console.log(`[${index + 1}/${total}] ❌ ${target.url} -> ${error.message}`);

    return {
      status: 'error',
      url: target.url,
      startedAt,
      endedAt: new Date().toISOString(),
      error: error.message
    };
  } finally {
    await page.close();
  }
}

function runPool(targets, config) {
  return puppeteer
    .launch({
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    .then((browser) => {
      const results = [];
      let cursor = 0;

      const worker = async () => {
        while (cursor < targets.length) {
          const index = cursor++;
          const target = targets[index];

          const result = await scrapeUrl(browser, target, config, index, targets.length);
          results[index] = result;

          await sleep(randomInt(config.minDelayMs, config.maxDelayMs));
        }
      };

      const workerTasks = Array.from({ length: Math.min(config.concurrency, targets.length) }, () => worker());

      return Promise.all(workerTasks)
        .then(() => results)
        .finally(() => browser.close());
    });
}

(async () => {
  try {
    await ensureFiles();

    const { targets } = await readInputConfig();
    const config = sanitizeConfig();

    console.log(`Starting scrape for ${targets.length} URLs in one browser instance...`);

    const results = await runPool(targets, config);
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
