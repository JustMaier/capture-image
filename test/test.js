const { writeFile } = require('fs').promises;
const { existsSync, mkdirSync } = require('fs');
const [url, size] = require('process').argv.slice(2);

const URL = 'http://localhost:5000/capture';
const TARGET_SITE_URL = url && url.startsWith('http') ? url : 'https://example.com';
const [width, height] = size && size.split('x').length === 2 ? size.split('x') : [1200, 630];

async function requestScreenshot(i) {
    const response = await fetch(URL+'?'+new URLSearchParams({
        url: TARGET_SITE_URL,
        transparent: true,
        width,
        height
    }));

    if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());

        await writeFile(`./test/screenshots/screenshot_${i}.png`, buffer);
        console.log('Screenshot captured successfully');
    } else {
        console.log('Error capturing screenshot:', response.status, response.statusText);
    }
}


if (!existsSync('./test/screenshots')) mkdirSync('./test/screenshots', { recursive: true });
// Trigger 10 concurrent requests
for (let i = 0; i < 10; i++) {
    requestScreenshot(i);
}
