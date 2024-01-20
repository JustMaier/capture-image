const { Worker } = require('worker_threads');
const http = require('http');
const url = require('url');
const port = process.env.PORT || 5000;


const worker = new Worker('./worker.js');
const promises = {};
worker.on('message', ({ id, success, ...message}) => {
    if (!promises[id]) return;
    if (!success) promises[id].reject(message);
    promises[id].resolve(message);
})
function sendToWorker(type, data) {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        promises[id] = { resolve, reject };
        worker.postMessage({ id, type, data });
    });
}

async function captureWebsiteAsImage(opts) {
    const {data} = await sendToWorker('captureWebsite', opts);
    return Buffer.from(data);
}

http.createServer((req, res) => {
    const query = new url.URL(req.url, `http://${req.headers.host}`).searchParams;

    if (req.url.startsWith('/capture')) {
        const url = query.get('url');
        console.log('request received', url);
        const width = parseInt(query.get('width')) || 1200;
        const height = parseInt(query.get('height')) || 630;
        const transparentBackground = query.has('transparent') ? query.get('transparent') === 'true' : true;

        captureWebsiteAsImage({ url, width, height, transparentBackground })
            .then((imageBuffer) => {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(imageBuffer, 'binary');
            }).catch((error) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({code: 500, message: 'Error capturing the website', error: error.toString()}));
            });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 404, message: 'Not found'}));
    }

}).listen(port, async () => {
    console.log('Launching browser...');
    console.log('Browser launched...');
    console.log(`Server listening on port ${port}`);
});
