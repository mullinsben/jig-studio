// Static servers for the tests. No dependencies.
//   node tests/serve.js            repo root on 8765, tests/foreign on 8777 (with CORS, as a CDN would)
//   node tests/serve.js --no-cors  8777 without CORS, to see what the jig does when a CDN refuses
// 8777 serves /jig.js from the repo root, so the "foreign" pages (sites that don't ship the jig) load the build under test.
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webm: 'video/webm', svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2', txt: 'text/plain' };
function start(dir, port, { cors = false, jigRoot = null } = {}) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = (jigRoot && p === '/jig.js') ? path.join(jigRoot, 'jig.js') : path.join(dir, p);
    if (!file.startsWith(path.resolve(dir)) && !(jigRoot && file === path.join(jigRoot, 'jig.js'))) { res.writeHead(403); return res.end(); }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch (e) {}
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      const h = { 'Content-Type': TYPES[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (cors) h['Access-Control-Allow-Origin'] = '*';
      res.writeHead(200, h); res.end(data);
    });
  });
  return new Promise((ok, fail) => { srv.on('error', fail); srv.listen(port, () => ok(srv)); });
}
module.exports = { start };
if (require.main === module) {
  const root = path.resolve(__dirname, '..'); const cors = !process.argv.includes('--no-cors');
  Promise.all([start(root, 8765), start(path.join(__dirname, 'foreign'), 8777, { cors, jigRoot: root })])
    .then(() => console.log(`serving ${root} on 8765 and tests/foreign on 8777 (${cors ? 'with' : 'without'} CORS)`))
    .catch(e => { console.error(e.message); process.exit(1); });
}
