// ===============================
// Scraper Configuration (Human-like behavior tuned)
// ===============================

const DEFAULT_CONFIG = {
  // Number of parallel workers
  // Keep LOW (1 is safest) to avoid detection
  concurrency: 1,

  // Minimum delay between URLs (in ms)
  // Increased to look less robotic
  minDelayMs: 8000, // 8 seconds

  // Maximum delay between URLs (in ms)
  // Allows natural browsing gaps
  maxDelayMs: 20000, // 20 seconds

  // Navigation timeout for page load
  // Keep high for slow JS-heavy websites
  navigationTimeoutMs: 60000, // 60 seconds

  // Run browser in visible mode
  // Helps avoid detection during development
  // Later you can switch to headless + stealth plugin
  headless: false,

  // Wait BEFORE extracting data (after page load)
  // Simulates user reading page
  preExtractWaitMsMin: 4000, // 4 sec
  preExtractWaitMsMax: 9000, // 9 sec

  // Additional delay AFTER page load (new)
  // Simulates thinking time before interaction
  postLoadWaitMsMin: 2000, // 2 sec
  postLoadWaitMsMax: 5000, // 5 sec

  // Delay AFTER scrolling (new)
  // Mimics pause after user scroll
  postScrollWaitMsMin: 2000, // 2 sec
  postScrollWaitMsMax: 4000, // 4 sec

  // Chance to trigger long idle break (new)
  // Simulates user getting distracted
  longBreakChance: 0.3, // 30% probability

  // Long break duration range (new)
  longBreakMinMs: 25000, // 25 sec
  longBreakMaxMs: 60000, // 60 sec

  // Retry configuration (new)
  // Prevents aggressive re-hits on failure
  maxRetries: 2,

  // Delay before retry (new)
  retryDelayMsMin: 30000, // 30 sec
  retryDelayMsMax: 60000 // 60 sec
};

// ===============================
// User Agents Pool
// ===============================

const USER_AGENTS = [
  // Chrome - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',

  // Chrome - Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',

  // Chrome - Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',

  // Edge - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',

  // Firefox - Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',

  // Firefox - Mac
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:124.0) Gecko/20100101 Firefox/124.0',

  // Safari - Mac (important for diversity)
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 Version/17.3 Safari/605.1.15',

  // Mobile Chrome (VERY IMPORTANT)
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Samsung Galaxy S21) AppleWebKit/537.36 Chrome/123.0.0.0 Mobile Safari/537.36',

  // Mobile Safari (iPhone)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Version/17.3 Mobile/15E148 Safari/604.1'
];

// ===============================
// Export config
// ===============================

module.exports = {
  DEFAULT_CONFIG,
  USER_AGENTS
};
