const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://example.com');
    
    try {
        const result1 = await page.evaluate("try { document.body ? document.body.innerText.substring(0, 8000) : 'Empty body' } catch(e) { 'Error' }");
        console.log("Result 1:", result1);
    } catch (e) {
        console.log("Error 1:", e.message);
    }
    
    try {
        const result2 = await page.evaluate("(() => { try { return document.body ? document.body.innerText.substring(0, 8000) : 'Empty body' } catch(e) { return 'Error' } })()");
        console.log("Result 2:", result2);
    } catch (e) {
        console.log("Error 2:", e.message);
    }
    
    await browser.close();
})();
