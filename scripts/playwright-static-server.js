const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = '127.0.0.1';
const ROOT_DIR = path.resolve(__dirname, '..', 'src');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function safeResolve(requestPath) {
  const normalizedPath = decodeURIComponent(requestPath.split('?')[0]);
  const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const targetPath = path.resolve(ROOT_DIR, `.${relativePath}`);

  if (!targetPath.startsWith(ROOT_DIR)) {
    return null;
  }

  return targetPath;
}

const server = http.createServer((req, res) => {
  const targetPath = safeResolve(req.url || '/');
  if (!targetPath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(targetPath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      res.writeHead(500);
      res.end('Internal Server Error');
      return;
    }

    const extname = path.extname(targetPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Playwright static server listening on http://${HOST}:${PORT}\n`);
});
