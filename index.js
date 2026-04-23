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
    const starter = [
      'https://example.com'
    ];
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

function normalizeUrlsFromParsedJson(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.urls)) {
      return parsed.urls;
    }

    return Object.keys(parsed);
  }

  return [];
}

function extractUrlsFromRawText(raw) {
  return raw.match(/https?:\/\/[^\s",}]+/g) || [];
}

async function readUrls() {
  const raw = await fs.readFile(URL_FILE, 'utf8');
  let urls = [];

  try {
    const parsed = JSON.parse(raw);
    urls = normalizeUrlsFromParsedJson(parsed);
  } catch {
    // Fallback for non-standard input formats by extracting URLs from text.
    urls = extractUrlsFromRawText(raw);
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('url.json must contain URLs, e.g. ["https://site1", "https://site2"]');
  }

  const cleanUrls = urls
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u));

  if (cleanUrls.length === 0) {
    throw new Error('url.json has no valid http/https URLs');
  }

  return cleanUrls;
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function scrapeUrl(browser, url, config, index, total) {
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

    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.innerText?.trim() || document.title || 'not found';
      const text = document.body?.innerText || '';
      const hasPrice = /₹|\$|€|£/.test(text);

      const metadata = Array.from(document.querySelectorAll('meta'))
        .map((meta) => ({
          name: meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv') || null,
          content: meta.getAttribute('content') || ''
        }))
        .filter((meta) => meta.name && meta.content);

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((node) => node.textContent?.trim())
        .filter(Boolean);

      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => ({
          text: a.textContent?.trim() || '',
          href: a.href
        }))
        .filter((link) => link.href)
        .slice(0, 500);

      return {
        title,
        hasPrice,
        extractedAt: new Date().toISOString(),
        page: {
          url: window.location.href,
          documentTitle: document.title,
          html: document.documentElement.outerHTML,
          text
        },
        metadata,
        headings,
        links
      };
    });

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
      data
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

async function runPool(urls, config) {
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

      const result = await scrapeUrl(browser, url, config, index, urls.length);
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

    const urls = await readUrls();
    const config = sanitizeConfig();

    console.log(`Starting scrape for ${urls.length} URLs in one browser instance...`);
    console.log(`Config: ${JSON.stringify(config)}`);

    const results = await runPool(urls, config);
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
