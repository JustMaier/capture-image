const puppeteer = require('puppeteer');
const { parentPort } = require('worker_threads');

let browser;
let browserLaunching = null;
let idleTimer = null;
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

const pages = {
    idle: [],
    busy: [],
    all: []
};
const pageUseCounts = new WeakMap();
const MAX_PAGE_USES = 50;

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(closeBrowser, IDLE_TIMEOUT);
}

async function closeBrowser() {
    if (!browser) return;
    console.log('closing browser after idle timeout');
    try {
        await browser.close();
    } catch (e) {
        console.log('error closing browser:', e);
    }
    browser = null;
    pages.idle = [];
    pages.busy = [];
    pages.all = [];
    idleTimer = null;
}
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
    pageUseCounts.set(page, 0);
    console.log('creating new page');
    return page;
}
async function closePage(page) {
    const index = pages.busy.indexOf(page);
    if (index > -1) {
        pages.busy.splice(index, 1);
        const useCount = (pageUseCounts.get(page) || 0) + 1;
        pageUseCounts.set(page, useCount);

        // Recycle page after MAX_PAGE_USES to prevent memory buildup
        if (useCount >= MAX_PAGE_USES) {
            console.log(`closing page after ${useCount} uses`);
            await page.close();
            const allIndex = pages.all.indexOf(page);
            if (allIndex > -1) {
                pages.all.splice(allIndex, 1);
            }
        } else {
            pages.idle.push(page);
            console.log('returning page to idle');
        }
    } else {
        console.log('closing page');
        await page.close();
        const allIndex = pages.all.indexOf(page);
        if (allIndex > -1) {
            pages.all.splice(allIndex, 1);
        }
    }
}

async function initBrowser() {
    if (browser) return;
    if (browserLaunching) {
        await browserLaunching;
        return;
    }
    browserLaunching = puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'], executablePath: process.env.PUPPETEER_EXECUTABLE_PATH });
    browser = await browserLaunching;
    browserLaunching = null;
}

const MAX_WAIT = 100000;
async function captureWebsiteAsImage({ url, width = 600, height = 600, transparentBackground = false, hiddenElements = [] }) {
    const consoleKey = `fetching ${url}`;
    console.log(consoleKey);
    console.time(consoleKey);
    const page = await openPage();

    const onRequest = () => activeRequests++;
    const onFinished = () => activeRequests--;
    const onFailed = () => activeRequests--;
    let activeRequests = 0;

    try {
        await page.setViewport({ width, height });
        await page.goto(url, { waitUntil: 'networkidle0', timeout: MAX_WAIT });

        let networkIdle = false;
        page.on('request', onRequest);
        page.on('requestfinished', onFinished);
        page.on('requestfailed', onFailed);

        let loops = 0;
        while (!networkIdle) {
            await new Promise(resolve => setTimeout(resolve, 100));
            networkIdle = (activeRequests === 0);
            loops++;
            if (loops > (MAX_WAIT/100)) {
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

        if (hiddenElements.length > 0) {
            await page.$$eval(hiddenElements.join(','), elements => {
                elements.forEach(element => element.remove());
            });
        }

        const screenshot = await page.screenshot({ omitBackground: transparentBackground });
        return screenshot;
    } catch (error) {
        throw error;
    } finally {
        page.off('request', onRequest);
        page.off('requestfinished', onFinished);
        page.off('requestfailed', onFailed);
        await closePage(page);
        console.timeEnd(consoleKey);
    }
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
        } finally {
            resetIdleTimer();
        }
    }
});

