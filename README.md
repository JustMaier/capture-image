# Capture Image of URL

Uses puppeteer in a worker thread to capture an configurable screenshot of an given url.

## Use
```sh
npm i
npm start
# Visit: http://localhost:5000/capture?url=https://example.com&width=1200&height=630&transparent=true
```

## Test
```sh
npm test
# OR with params (url, size: WxH)
npm test http://example.com 1200x630
```