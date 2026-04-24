const { ensureFiles, readText, writeJson, URL_FILE, OUTPUT_FILE, LOG_FILE } = require('./io/files');
const { sanitizeConfig, parseInputConfig } = require('./config/runtime');
const { runPool } = require('./scraper/runner');

async function run() {
  await ensureFiles();

  const rawInput = await readText(URL_FILE);
  const { urls, selectors } = parseInputConfig(rawInput);
  const config = sanitizeConfig();

  console.log(`Starting scrape for ${urls.length} URLs in one browser context...`);

  const results = await runPool(urls, selectors, config, writeJson);
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
}

module.exports = {
  run
};
