/**
 * expand-catalog.js
 *
 * Dipanggil otomatis oleh GitHub Actions (expand.yml) tiap beberapa jam.
 * Tugasnya: ambil BATCH_SIZE produk berikutnya dari catalog-index.json
 * (5.359 produk hasil ekstrak PDF) yang BELUM ada di urls.txt, lalu:
 *   1. Tambahkan URL-nya ke urls.txt (supaya ikut di-refresh harian selamanya)
 *   2. Tulis batch itu SAJA ke new-batch-urls.txt (supaya scrape.js cuma
 *      proses yang baru — bukan scrape ulang semua yang sudah ada tiap 4 jam)
 *
 * Kalau semua produk sudah tercover (remaining = 0), new-batch-urls.txt
 * ditulis kosong dan workflow otomatis skip langkah scrape untuk batch baru.
 *
 * Usage: node expand-catalog.js [--batch-size N]
 */

const fs = require('fs');
const path = require('path');

const BATCH_SIZE = (() => {
  const idx = process.argv.indexOf('--batch-size');
  return idx !== -1 ? Number(process.argv[idx + 1]) : Number(process.env.BATCH_SIZE || 50);
})();

const catalogIndexPath = path.join(__dirname, 'catalog-index.json');
const urlsPath = path.join(__dirname, 'urls.txt');
const newBatchPath = path.join(__dirname, 'new-batch-urls.txt');

if (!fs.existsSync(catalogIndexPath)) {
  console.error('catalog-index.json tidak ditemukan. Jalankan generate-urls.js dulu (tanpa --add) untuk membuatnya.');
  process.exit(1);
}

const catalogIndex = JSON.parse(fs.readFileSync(catalogIndexPath, 'utf-8'));
const allCodes = Object.keys(catalogIndex).sort();

const existingUrls = fs.existsSync(urlsPath)
  ? fs.readFileSync(urlsPath, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)
  : [];

function catalogNoFromUrl(url) {
  const m = url.match(/\/mm\/(\d{6,})$/);
  if (!m) return null;
  const digits = m[1];
  return digits[0] + '.' + digits.slice(1);
}

const existingCodes = new Set(
  existingUrls.map(catalogNoFromUrl).filter(Boolean)
);

const remaining = allCodes.filter((code) => !existingCodes.has(code));

console.log(`Total katalog: ${allCodes.length}`);
console.log(`Sudah ada di urls.txt: ${existingCodes.size}`);
console.log(`Sisa belum tercover: ${remaining.length}`);

if (remaining.length === 0) {
  console.log('\n✓ SEMUA produk sudah tercover. Tidak ada yang ditambahkan.');
  console.log('Mode sekarang otomatis jadi "refresh saja" — expand.yml tidak akan nambah apapun lagi.');
  fs.writeFileSync(newBatchPath, '');
  process.exit(0);
}

const batch = remaining.slice(0, BATCH_SIZE);
const batchUrls = batch.map((code) => {
  const urlCode = code.replace('.', '');
  return `https://www.sigmaaldrich.com/ID/id/product/mm/${urlCode}`;
});

// Tulis batch baru ke file terpisah (buat di-scrape terpisah, cepat)
fs.writeFileSync(newBatchPath, batchUrls.join('\n') + '\n');

// Tambahkan juga ke urls.txt utama (biar ikut di-refresh harian selamanya)
const updatedUrls = [...existingUrls, ...batchUrls];
fs.writeFileSync(urlsPath, updatedUrls.join('\n') + '\n');

console.log(`\n✓ ${batch.length} produk baru ditambahkan batch ini:`);
batch.forEach((code) => console.log(`  ${code} — ${catalogIndex[code]}`));
console.log(`\nSisa setelah batch ini: ${remaining.length - batch.length}`);
console.log(`Estimasi selesai total (di rate ${BATCH_SIZE}/batch): ${Math.ceil((remaining.length - batch.length) / BATCH_SIZE)} batch lagi`);
