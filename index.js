const puppeteer = require('puppeteer');

(async () => {
  const url = process.argv[2] || 'https://www.99acres.com/2-bhk-bedroom-independent-house-villa-for-sale-in-pratap-nagar-jaipur-500-sq-ft-r1-spid-D60627190';

  console.log("Opening:", url);

  const browser = await puppeteer.launch({
    headless: false, // 👈 IMPORTANT (use real browser mode)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  );

  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });

    // wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 5000));

    const data = await page.evaluate(() => {
      return {
        title: document.querySelector('h1')?.innerText || 'not found',
        price: document.body.innerText.includes('₹') ? 'Price present' : 'No price found'
      };
    });

    console.log("Extracted Data:", data);

  } catch (err) {
    console.error("Error:", err.message);
  }

  // keep browser open for debugging
  // await browser.close();
})();