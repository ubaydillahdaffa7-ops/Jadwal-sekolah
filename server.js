// Server Jadwal SMPN 2 Bondowoso: tanpa library tambahan, hanya Node.js 18+
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const SANDI = process.env.SANDI || "ubayxxx7777"; // sebaiknya atur lewat Environment Variable SANDI
const DB = process.env.DATA_FILE || path.join(__dirname, "data.json");

let data = { pengguna: [] };
try { data = JSON.parse(fs.readFileSync(DB, "utf8")); } catch (e) {}
if (!Array.isArray(data.pengguna)) data.pengguna = [];
const simpan = () => fs.writeFile(DB, JSON.stringify(data), () => {});

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
  if (req.method === "GET" && (u === "/" || u === "/index.html")) {
    return fs.readFile(path.join(__dirname, "index.html"), (e, d) => {
      if (e) { res.writeHead(404); return res.end("index.html tidak ditemukan"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(d);
    });
  }
  res.writeHead(404); res.end("Tidak ditemukan");
}).listen(PORT, () => console.log("Server jalan di port " + PORT));
