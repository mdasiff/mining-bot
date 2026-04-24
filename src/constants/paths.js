const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const JSON_DIR = path.join(ROOT_DIR, 'json-files');

module.exports = {
  JSON_DIR,
  URL_FILE: path.join(JSON_DIR, 'url.json'),
  OUTPUT_FILE: path.join(JSON_DIR, 'output.json'),
  LOG_FILE: path.join(JSON_DIR, 'log.json'),
  COOKIE_FILE: path.join(JSON_DIR, 'cookies.json')
};
