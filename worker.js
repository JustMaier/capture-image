const puppeteer = require('puppeteer');
const { parentPort } = require('worker_threads');

let browser;
const pages = {
    idle: [],
    busy: [],
    all: []
};
async function openPage() {
    if (pages.idle.length > 0) {
        const page = pages.idle.pop();
        pages.busy.push(page);
        console.log('serving from idle page');
        return page;
    }

    // if at max capacity, wait for a page to become idle
    if (pages.all.length >= 10) {
        console.log('waiting for idle page');
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if (pages.idle.length > 0) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
        return openPage();
    }


    const page = await browser.newPage();
    pages.busy.push(page);
    pages.all.push(page);
    console.log('creating new page');
    return page;
}
async function closePage(page) {
    const index = pages.busy.indexOf(page);
    if (index > -1) {
        pages.busy.splice(index, 1);
        pages.idle.push(page);
        console.log('returning page to idle');
    } else {
        console.log('closing page');
        await page.close();
        const index = pages.all.indexOf(page);
        if (index > -1) {
            pages.all.splice(index, 1);
        }
    }
}

async function initBrowser() {
    if (!browser) browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox']});
}

const MAX_WAIT = 100000;
async function captureWebsiteAsImage({ url, width = 600, height = 600, transparentBackground = false }) {
    console.log(`fetching ${url}`);
    const page = await openPage();

    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle0' });

    let networkIdle = false;
    let activeRequests = 0;
    page.on('request', () => activeRequests++);
    page.on('requestfinished', () => activeRequests--);
    page.on('requestfailed', () => activeRequests--);

    let loops = 0;
    while (!networkIdle) {
        await new Promise(resolve => setTimeout(resolve, 100));
        networkIdle = (activeRequests === 0);
        loops++;
        if (loops > (MAX_WAIT/100)) {
            await closePage(page);
            throw new Error('Timeout waiting for network idle');
        }
    }

    if (transparentBackground) {
        await page.$$eval('body', elements => {
            elements.forEach(element => element.style.backgroundColor = 'transparent !important');
        });
        await page.$$eval('.EmbedFrame-footer, .EmbedFrame-header', elements => {
            elements.forEach(element => element.remove());
        });
    }

    const screenshot = await page.screenshot({ omitBackground: transparentBackground });
    await closePage(page);

    return screenshot;
}

parentPort.on('message', async ({id, type, data}) => {
    if (type === 'captureWebsite') {
        await initBrowser();
        try {
            const imageBuffer = await captureWebsiteAsImage(data);
            parentPort.postMessage({ id, success: true, data: imageBuffer.buffer }, [imageBuffer.buffer]);
        } catch (error) {
            console.log(error);
            parentPort.postMessage({ id, success: false, error: error.toString() });
        }
    }
});

