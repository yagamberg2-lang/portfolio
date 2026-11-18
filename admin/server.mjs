// Локальна адмінка портфоліо. Без залежностей: потрібні лише Node.js, ffmpeg і git.
// Запуск: node admin/server.mjs  (або подвійний клік по "Адмінка.bat")
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ADMIN = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(ADMIN, '..');
const DOCS = path.join(ROOT, 'docs');
const MEDIA = path.join(DOCS, 'media');
const DATA = path.join(DOCS, 'data', 'works.json');
const PORT = Number(process.env.PORT || 4321);

const MEDIA_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

await fsp.mkdir(MEDIA, { recursive: true });

// ---------- helpers ----------
const TR = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia',ё:'e',ы:'y',э:'e',ъ:'' };
const slug = (s) => s.toLowerCase().split('').map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
const shortId = () => crypto.randomBytes(3).toString('hex');

async function readData() {
  try { return JSON.parse(await fsp.readFile(DATA, 'utf8')); }
  catch { return { settings: {}, works: [], ignored: [] }; }
}
async function writeData(d) {
  await fsp.mkdir(path.dirname(DATA), { recursive: true });
  await fsp.writeFile(DATA, JSON.stringify(d, null, 2), 'utf8');
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd || ROOT, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('error', e => resolve({ code: -1, out, err: String(e) }));
    p.on('close', code => resolve({ code, out, err }));
  });
}

async function probe(file) {
  const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  if (r.code !== 0) throw new Error('ffprobe: ' + r.err);
  const j = JSON.parse(r.out);
  const v = j.streams.find(s => s.codec_type === 'video') || {};
  const [a, b] = String(v.r_frame_rate || '30/1').split('/').map(Number);
  let w = v.width, h = v.height;
  const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find(x => x.rotation != null)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { w, h, fps: b ? a / b : 30, duration: Number(j.format?.duration || 0), audio: j.streams.some(s => s.codec_type === 'audio') };
}

// Оптимізує один файл з кореневої папки в docs/media. Повертає media-обʼєкт.
async function processFile(name) {
  const src = path.join(ROOT, name);
  if (path.dirname(src) !== ROOT || !fs.existsSync(src)) throw new Error('Файл не знайдено: ' + name);
  const ext = path.extname(name).toLowerCase();
  const base = slug(path.basename(name, ext)) + '-' + shortId();
  const info = await probe(src);

  if (VIDEO_EXT.has(ext)) {
    const portrait = info.h >= info.w;
    const scale = portrait ? `scale=${Math.min(720, info.w)}:-2` : `scale=${Math.min(1280, info.w)}:-2`;
    const fps = Math.min(60, Math.round(info.fps || 30));
    const outV = path.join(MEDIA, base + '.mp4');
    const outP = path.join(MEDIA, base + '.jpg');
    const args = ['-y', '-v', 'error', '-i', src, '-vf', scale, '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
      '-maxrate', '3500k', '-bufsize', '7000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    if (info.audio) args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2'); else args.push('-an');
    args.push(outV);
    let r = await run('ffmpeg', args);
    if (r.code !== 0) throw new Error('ffmpeg (відео): ' + r.err.slice(-400));
    const t = Math.min(3, Math.max(0, info.duration / 4));
    r = await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '3', outP]);
    if (r.code !== 0) throw new Error('ffmpeg (постер): ' + r.err.slice(-400));
    const o = await probe(outV);
    return { type: 'video', src: 'media/' + base + '.mp4', poster: 'media/' + base + '.jpg', w: o.w, h: o.h, duration: Math.round(info.duration * 10) / 10, original: name };
  }

  // Зображення → webp. Довгі скріни лендінгів не обрізаємо, лише обмежуємо ширину.
  const out = path.join(MEDIA, base + '.webp');
  const maxW = info.h / info.w > 2.2 ? 1440 : 1440;
  const r = await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', `scale='min(${maxW},iw)':-2`, '-c:v', 'libwebp', '-quality', '86', '-frames:v', '1', out]);
  if (r.code !== 0) throw new Error('ffmpeg (зображення): ' + r.err.slice(-400));
  const o = await probe(out);
  return { type: 'image', src: 'media/' + base + '.webp', poster: 'media/' + base + '.webp', w: o.w, h: o.h, original: name };
}

async function listInbox() {
  const d = await readData();
  const used = new Set();
  for (const w of d.works || []) for (const m of w.media || []) if (m.original) used.add(m.original);
  for (const w of d.works || []) for (const m of w.media || []) if (m.posterOriginal) used.add(m.posterOriginal);
  const ignored = new Set(d.ignored || []);
  const names = await fsp.readdir(ROOT);
  const items = [];
  for (const n of names) {
    const ext = path.extname(n).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const st = await fsp.stat(path.join(ROOT, n));
    if (!st.isFile()) continue;
    items.push({ name: n, size: st.size, mtime: st.mtimeMs, type: VIDEO_EXT.has(ext) ? 'video' : 'image', used: used.has(n), ignored: ignored.has(n) });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

// ---------- static & range ----------
async function sendFile(req, res, file) {
  let st;
  try { st = await fsp.stat(file); if (!st.isFile()) throw 0; } catch { res.writeHead(404); return res.end('Not found'); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : st.size - 1;
    if (!m[1] && m[2]) { start = st.size - Number(m[2]); end = st.size - 1; }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}
function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p.startsWith(base) ? p : null;
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, bad) => { let b = ''; req.setEncoding('utf8'); req.on('data', c => b += c); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });

// Черга обробки — по одному файлу, щоб не перевантажувати ПК
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

// ---------- API ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/data' && req.method === 'GET') return json(res, 200, await readData());
    if (p === '/api/data' && req.method === 'POST') { await writeData(await readBody(req)); return json(res, 200, { ok: true }); }
    if (p === '/api/inbox') return json(res, 200, await listInbox());

    if (p === '/api/upload' && req.method === 'POST') {
      let name = path.basename(url.searchParams.get('name') || 'file');
      const ext = path.extname(name).toLowerCase();
      if (!MEDIA_EXT.has(ext)) return json(res, 400, { error: 'Непідтримуваний формат ' + ext });
      let target = path.join(ROOT, name), i = 1;
      while (fs.existsSync(target)) { name = path.basename(name, ext).replace(/ \(\d+\)$/, '') + ` (${i++})` + ext; target = path.join(ROOT, name); }
      await new Promise((ok, bad) => { const ws = fs.createWriteStream(target); req.pipe(ws); ws.on('finish', ok); ws.on('error', bad); });
      return json(res, 200, { name });
    }

    if (p === '/api/process' && req.method === 'POST') {
      const { name } = await readBody(req);
      const media = await enqueue(() => processFile(name));
      return json(res, 200, media);
    }

    if (p === '/api/cleanup' && req.method === 'POST') {
      const d = await readData();
      const keep = new Set();
      for (const w of d.works || []) for (const m of w.media || []) { keep.add(m.src); keep.add(m.poster); }
      let removed = 0;
      for (const f of await fsp.readdir(MEDIA)) if (!keep.has('media/' + f)) { await fsp.unlink(path.join(MEDIA, f)); removed++; }
      return json(res, 200, { removed });
    }

    if (p === '/api/git-status') {
      const remote = await run('git', ['remote', 'get-url', 'origin']);
      const st = await run('git', ['status', '--porcelain', '--', 'docs']);
      return json(res, 200, { isRepo: fs.existsSync(path.join(ROOT, '.git')), remote: remote.code === 0 ? remote.out.trim() : null, changes: st.out.split('\n').filter(Boolean).length });
    }

    if (p === '/api/publish' && req.method === 'POST') {
      const log = [];
      const step = async (args) => { const r = await run('git', args); log.push('$ git ' + args.join(' ') + '\n' + (r.out + r.err).trim()); return r; };
      await step(['add', '-A']);
      const stamp = new Date().toLocaleString('uk-UA');
      const c = await step(['commit', '-m', 'Оновлення портфоліо ' + stamp]);
      if (c.code !== 0 && !/nothing to commit|нечего|нічого/i.test(c.out + c.err)) return json(res, 500, { ok: false, log: log.join('\n\n') });
      const ps = await step(['push']);
      return json(res, ps.code === 0 ? 200 : 500, { ok: ps.code === 0, log: log.join('\n\n') });
    }

    if (p.startsWith('/original/')) { const f = path.join(ROOT, path.basename(p.slice(10))); return sendFile(req, res, f); }
    if (p === '/site') { res.writeHead(302, { Location: '/site/' }); return res.end(); }
    if (p.startsWith('/site/')) {
      let rel = p.slice(6) || 'index.html';
      if (rel.endsWith('/')) rel += 'index.html';
      const f = safeJoin(DOCS, rel); if (!f) { res.writeHead(403); return res.end(); }
      return sendFile(req, res, f);
    }
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const f = safeJoin(path.join(ADMIN, 'ui'), rel); if (!f) { res.writeHead(403); return res.end(); }
    return sendFile(req, res, f);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const u = `http://localhost:${PORT}/`;
  console.log('\n  Адмінка портфоліо:  ' + u + '\n  Перегляд сайту:     ' + u + 'site/\n\n  Не закривайте це вікно, поки працюєте в адмінці.\n');
  if (process.argv.includes('--open')) spawn('cmd', ['/c', 'start', '', u], { windowsHide: true, detached: true });
});
