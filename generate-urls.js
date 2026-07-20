/**
 * generate-urls.js
 *
 * Membaca file PDF katalog (mis. Daftar_Harga_Merck_2020.pdf), mengekstrak
 * semua No. Katalog unik + nama produk, lalu:
 *   1. Menulis all-products.csv — daftar LENGKAP semua produk (referensi,
 *      tidak otomatis di-scrape).
 *   2. Kalau dikasih --search, menambahkan URL yang cocok ke urls.txt
 *      (dipakai scrape.js).
 *
 * PENTING soal skala: PDF katalog biasanya berisi ribuan produk. JANGAN
 * langsung generate urls.txt berisi semua ribuan URL itu untuk di-scrape
 * sekaligus — selain makan waktu sangat lama, ini juga menaikkan risiko
 * kena rate-limit/block dari situs (lihat catatan ToS di README.md).
 * Pakai --search atau --limit untuk mengambil sebagian yang relevan dulu.
 *
 * Usage:
 *   node generate-urls.js <path-ke-pdf>
 *     -> hanya generate all-products.csv (tidak mengubah urls.txt)
 *
 *   node generate-urls.js <path-ke-pdf> --search "asam"
 *     -> cari produk yang namanya mengandung "asam", tampilkan hasilnya
 *
 *   node generate-urls.js <path-ke-pdf> --search "asam" --add
 *     -> sama seperti di atas, TAPI juga menambahkan URL-nya ke urls.txt
 *
 *   node generate-urls.js <path-ke-pdf> --search "asam" --add --limit 10
 *     -> batasi maksimal 10 produk yang ditambahkan
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const args = process.argv.slice(2);
const pdfPath = args[0];

if (!pdfPath || pdfPath.startsWith('--')) {
  console.error('Kasih path ke PDF katalog. Contoh:');
  console.error('  node generate-urls.js "Daftar_Harga_Merck_2020.pdf"');
  process.exit(1);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1];
}

const searchTerm = getArgValue('--search');
const shouldAdd = args.includes('--add');
const limit = Number(getArgValue('--limit')) || Infinity;

// Pola: <digit>.<5 digit>.<3-4 digit suffix>   NAMA PRODUK   (2+ spasi) ...
const PRODUCT_LINE_REGEX = /^\s*(\d\.\d{5})\.\d{3,4}\s+(.+?)\s{2,}/gm;

async function main() {
  const buffer = fs.readFileSync(pdfPath);
  console.log('Membaca PDF... (bisa beberapa detik untuk file besar)');
  const data = await pdfParse(buffer);
  const text = data.text;

  const seen = new Map(); // code -> name
  let match;
  while ((match = PRODUCT_LINE_REGEX.exec(text)) !== null) {
    const [, code, rawName] = match;
    const name = rawName.trim();
    if (!seen.has(code)) {
      seen.set(code, name);
    }
  }

  console.log(`Ditemukan ${seen.size} produk unik dari ${data.numpages} halaman PDF.`);

  const allRows = [...seen.entries()].map(([code, name]) => {
    const url = `https://www.sigmaaldrich.com/ID/id/product/mm/${code.replace('.', '')}`;
    return { code, name, url };
  });
  allRows.sort((a, b) => a.name.localeCompare(b.name));

  // Selalu tulis all-products.csv sebagai referensi lengkap
  const csvLines = ['No. Katalog,Nama Produk,URL Produk'];
  for (const row of allRows) {
    const safeName = `"${row.name.replace(/"/g, '""')}"`;
    csvLines.push(`${row.code},${safeName},${row.url}`);
  }
  fs.writeFileSync(path.join(__dirname, 'all-products.csv'), csvLines.join('\n'));
  console.log(`✓ all-products.csv ditulis (${allRows.length} baris, referensi lengkap).`);

  if (!searchTerm) {
    console.log('\nTidak ada --search, berhenti di sini. Buka all-products.csv untuk lihat semua produk.');
    return;
  }

  const q = searchTerm.toLowerCase();
  const matched = allRows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, limit);

  console.log(`\nDitemukan ${matched.length} produk cocok dengan "${searchTerm}" (limit ${limit === Infinity ? '-' : limit}):`);
  for (const r of matched) {
    console.log(`  ${r.code}  ${r.name}`);
  }

  if (shouldAdd) {
    const urlsPath = path.join(__dirname, 'urls.txt');
    const existing = fs.existsSync(urlsPath)
      ? fs.readFileSync(urlsPath, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)
      : [];
    const existingSet = new Set(existing);

    const newUrls = matched.map((r) => r.url).filter((u) => !existingSet.has(u));
    const combined = [...existing, ...newUrls];

    fs.writeFileSync(urlsPath, combined.join('\n') + '\n');
    console.log(`\n✓ ${newUrls.length} URL baru ditambahkan ke urls.txt (${combined.length} total sekarang).`);
  } else {
    console.log('\nBelum ditambahkan ke urls.txt. Tambahkan flag --add kalau sudah yakin dengan hasil di atas.');
  }
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
