async function extractStructuredData(page, selectors) {
  return page.evaluate((selectorMap) => {
    const pickValue = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;

      const contentAttr = node.getAttribute('content');
      const valueAttr = node.getAttribute('value');
      const text = node.textContent?.trim();
      return contentAttr || valueAttr || text || null;
    };

    const fields = {};

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
          // Ignore invalid selector and continue.
        }
      }

      fields[fieldName] = { value, matchedSelector };
    }

    return {
      extractedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      fields
    };
  }, selectors);
}

module.exports = {
  extractStructuredData
};
