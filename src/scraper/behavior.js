const { sleep, randomInt } = require('../utils/common');

function shouldBlockRequest(resourceType) {
  return resourceType === 'image' || resourceType === 'font';
}

function detectBlockPageText(content) {
  return /access denied|request blocked|forbidden|temporarily unavailable|bot detected|security check/i.test(content);
}

async function simulateHumanBehavior(page, config) {
  await sleep(randomInt(config.postLoadWaitMsMin, config.postLoadWaitMsMax));

  if (Math.random() < 0.35) {
    await sleep(randomInt(5000, 15000));
    return;
  }

  const totalHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  const steps = randomInt(3, 7);

  for (let i = 1; i <= steps; i += 1) {
    const nextY = Math.min(totalHeight, Math.floor((totalHeight / steps) * i));
    await page.mouse.move(randomInt(120, 1200), randomInt(120, 700), { steps: randomInt(8, 20) });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), nextY);
    await sleep(randomInt(400, 1200));
  }

  await sleep(randomInt(config.postScrollWaitMsMin, config.postScrollWaitMsMax));

  if (Math.random() < 0.7) {
    await page.mouse.click(randomInt(60, 1100), randomInt(100, 650), { delay: randomInt(50, 180) });
  }

  if (Math.random() < config.longBreakChance) {
    await sleep(randomInt(config.longBreakMinMs, config.longBreakMaxMs));
  }

  await sleep(randomInt(config.preExtractWaitMsMin, config.preExtractWaitMsMax));
}

module.exports = {
  shouldBlockRequest,
  detectBlockPageText,
  simulateHumanBehavior
};
