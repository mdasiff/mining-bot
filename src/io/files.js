const fs = require('fs/promises');
const { JSON_DIR, URL_FILE, OUTPUT_FILE, LOG_FILE, COOKIE_FILE } = require('../constants/paths');

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

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

module.exports = {
  ensureFiles,
  readText,
  writeJson,
  URL_FILE,
  OUTPUT_FILE,
  LOG_FILE,
  COOKIE_FILE
};
