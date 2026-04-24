const { USER_AGENTS } = require('../../config/const');

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

function isMobileUserAgent(userAgent) {
  return /Android|iPhone|Mobile/i.test(userAgent);
}

function getViewportForUserAgent(userAgent) {
  if (isMobileUserAgent(userAgent)) {
    return { width: 375, height: 812, isMobile: true };
  }

  return { width: 1366, height: 768, isMobile: false };
}

function inferProfileFromUserAgent(userAgent) {
  const isMobile = isMobileUserAgent(userAgent);
  const isMac = /Macintosh|iPhone/i.test(userAgent);
  const isWindows = /Windows/i.test(userAgent);

  if (isMobile) {
    return {
      timezone: 'America/New_York',
      locale: 'en-US',
      platform: /iPhone/i.test(userAgent) ? 'iPhone' : 'Linux armv8l'
    };
  }

  if (isMac) {
    return {
      timezone: 'America/Los_Angeles',
      locale: 'en-US',
      platform: 'MacIntel'
    };
  }

  if (isWindows) {
    return {
      timezone: 'America/Chicago',
      locale: 'en-US',
      platform: 'Win32'
    };
  }

  return {
    timezone: 'America/New_York',
    locale: 'en-US',
    platform: 'Linux x86_64'
  };
}

module.exports = {
  createUserAgentPicker,
  getViewportForUserAgent,
  inferProfileFromUserAgent
};
