const DEFAULT_CONFIG = {
  concurrency: 3,
  minDelayMs: 1500,
  maxDelayMs: 4000,
  navigationTimeoutMs: 45000,
  headless: false
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36'
];

module.exports = {
  DEFAULT_CONFIG,
  USER_AGENTS
};
