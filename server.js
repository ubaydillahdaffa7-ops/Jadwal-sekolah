// Server Jadwal SMPN 2 Bondowoso: tanpa library tambahan, hanya Node.js 18+
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const PORT = process.env.PORT || 3000;
const SANDI = process.env.SANDI || "ubayxxx7777"; // sebaiknya atur lewat Environment Variable SANDI
const DB = process.env.DATA_FILE || path.join(__dirname, "data.json");

let data = { pengguna: [] };
try { data = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
if (!Array.isArray(data.pengguna)) data.pengguna = [];
const simpan = () => fs.writeFile(DB, JSON.stringify(data), () => {});

// ---- Ikon aplikasi dibuat otomatis oleh server (tidak perlu upload gambar) ----
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(tipe, d) {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(tipe), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([l, td, c]);
}
const HURUF = {
  S: ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"]
};
function buatIkon(n) {
  const cell = Math.floor(n * 0.5 / 17), x0 = Math.floor((n - 17 * cell) / 2), y0 = Math.floor((n - 7 * cell) / 2);
  const r = n * 0.34, cx = n / 2, w = n * 4 + 1, raw = Buffer.alloc(w * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const gx = Math.floor((x - x0) / cell), gy = Math.floor((y - y0) / cell);
    let warna = Math.hypot(x - cx, y - cx) <= r ? [198, 150, 46] : [22, 42, 77];
    if (gx >= 0 && gx < 17 && gy >= 0 && gy < 7 && gx % 6 < 5 && HURUF["S2B"[Math.floor(gx / 6)]][gy][gx % 6] === "1") warna = [14, 29, 56];
    const o = y * w + 1 + x * 4; raw[o] = warna[0]; raw[o + 1] = warna[1]; raw[o + 2] = warna[2]; raw[o + 3] = 255;
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const ikon = {};
const ambilIkon = u => ikon[u] || (ikon[u] = buatIkon(u === "/icon-192.png" ? 192 : 512));

const hash = s => crypto.createHash("sha256").update(String(s)).digest();
const sandiBenar = s => crypto.timingSafeEqual(hash(s), hash(SANDI));
const bersih = n => String(n || "").trim().replace(/\s+/g, " ").slice(0, 24);
const gagal = {}; // batas percobaan sandi per IP

function tambah(n) {
  if (n.length < 2) return false;
  if (!data.pengguna.some(x => x.nama.toLowerCase() === n.toLowerCase())) {
    if (data.pengguna.length >= 2000) return false;
    data.pengguna.push({ nama: n, waktu: new Date().toISOString() });
    simpan();
  }
  return true;
}
const daftarNama = () => data.pengguna.map(x => x.nama);
const json = (res, kode, obj) => {
  res.writeHead(kode, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
};
const baca = req => new Promise((ok, no) => {
  let b = "";
  req.on("data", c => { b += c; if (b.length > 2048) { no(); req.destroy(); } });
  req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch (e) { ok({}); } });
  req.on("error", no);
});

const statis = {
  "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"], "/sw.js": ["sw.js", "text/javascript; charset=utf-8"]
};

http.createServer(async (req, res) => {
  const u = req.url.split("?")[0];
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,GET" });
    return res.end();
  }
  if (req.method === "POST" && (u === "/api/daftar" || u === "/api/admin")) {
    let b; try { b = await baca(req); } catch (e) { return json(res, 400, { ok: false }); }
    if (u === "/api/daftar") return json(res, 200, { ok: tambah(bersih(b.nama)) });

    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const g = gagal[ip] || { n: 0, t: 0 };
    if (g.n >= 5 && Date.now() - g.t < 600000) return json(res, 429, { ok: false, pesan: "Terlalu banyak percobaan. Coba lagi 10 menit lagi." });
    if (!sandiBenar(b.sandi)) { gagal[ip] = { n: g.n + 1, t: Date.now() }; return json(res, 401, { ok: false, pesan: "Sandi salah 🔒" }); }
    delete gagal[ip];

    if (b.aksi === "tambah") tambah(bersih(b.nama));
    if (b.aksi === "hapus") { const n = bersih(b.nama).toLowerCase(); data.pengguna = data.pengguna.filter(x => x.nama.toLowerCase() !== n); simpan(); }
    return json(res, 200, { ok: true, pengguna: daftarNama() });
  }
  if (req.method === "GET" && (u === "/icon-192.png" || u === "/icon-512.png" || u === "/icon-maskable.png")) {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(ambilIkon(u));
  }
  if (req.method === "GET" && statis[u]) {
    return fs.readFile(path.join(__dirname, statis[u][0]), (e, d) => {
      if (e) { res.writeHead(404); return res.end("File tidak ditemukan"); }
      res.writeHead(200, { "Content-Type": statis[u][1] });
      res.end(d);
    });
  }
  res.writeHead(404); res.end("Tidak ditemukan");
}).listen(PORT, () => console.log("Server jalan di port " + PORT));
