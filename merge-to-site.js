/**
 * merge-to-site.js
 *
 * Menggabungkan hasil scraper (sigma-data.json, dari scrape.js) ke dalam
 * docs/data.json (yang dibaca website).
 *
 * - Kalau produk (dicocokkan lewat URL) SUDAH ADA di data.json: variants
 *   di-refresh, catalogNo/casNumber/name yang sudah ada TIDAK diganti.
 * - Kalau produk BELUM ADA (baru dari hasil generate-urls.js + scrape.js):
 *   entri baru dibuat otomatis. catalogNo diambil dari URL, nama diambil
 *   dari hasil scrape (fallback ke catalog-index.json kalau ada dan hasil
 *   scrape tidak dapat nama). CAS number tidak tersedia dari scrape/PDF,
 *   jadi diisi null dulu — isi manual belakangan kalau perlu ditampilkan.
 *
 * Usage: node merge-to-site.js
 */

const fs = require('fs');
const path = require('path');

const scrapedPath = path.join(__dirname, 'sigma-data.json');
const sitePath = path.join(__dirname, 'docs', 'data.json');
const catalogIndexPath = path.join(__dirname, 'catalog-index.json');

const catalogIndex = fs.existsSync(catalogIndexPath)
  ? JSON.parse(fs.readFileSync(catalogIndexPath, 'utf-8'))
  : {};

function catalogNoFromUrl(url) {
  // https://www.sigmaaldrich.com/ID/id/product/mm/100983 -> "1.00983"
  const m = url.match(/\/mm\/(\d{6,})$/);
  if (!m) return null;
  const digits = m[1];
  return digits[0] + '.' + digits.slice(1);
}

if (!fs.existsSync(scrapedPath)) {
  console.error('sigma-data.json tidak ditemukan. Jalankan scrape.js dulu.');
  process.exit(1);
}
if (!fs.existsSync(sitePath)) {
  console.error('docs/data.json tidak ditemukan.');
  process.exit(1);
}

const scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf-8'));
const site = JSON.parse(fs.readFileSync(sitePath, 'utf-8'));

let updated = 0;
let created = 0;
let skipped = 0;

for (const scrapedProduct of scraped) {
  if (scrapedProduct.error) {
    console.warn(`⚠ Lewati ${scrapedProduct.url} — gagal saat scrape: ${scrapedProduct.error}`);
    skipped++;
    continue;
  }
  if (!scrapedProduct.variants || scrapedProduct.variants.length === 0) {
    console.warn(`⚠ Lewati ${scrapedProduct.url} — 0 varian ditemukan (kemungkinan selector belum cocok)`);
    skipped++;
    continue;
  }

  const cleanVariants = scrapedProduct.variants.map((v) => ({
    size: v.size,
    sku: v.sku,
    status: v.status,
    location: v.location || null,
    price: v.price,
  }));

  const match = site.products.find((p) => p.url === scrapedProduct.url);

  if (match) {
    match.variants = cleanVariants;
    match.source = 'live_scrape';
    match.scrapedAt = scrapedProduct.scrapedAt;
    updated++;
    console.log(`✓ (update) ${match.name} — ${match.variants.length} varian`);
  } else {
    const catalogNo = catalogNoFromUrl(scrapedProduct.url);
    const name =
      scrapedProduct.productName ||
      (catalogNo && catalogIndex[catalogNo]) ||
      'Nama produk belum diketahui';

    site.products.push({
      name,
      catalogNo: catalogNo || '',
      casNumber: null, // tidak tersedia dari scrape/PDF, isi manual kalau perlu ditampilkan
      url: scrapedProduct.url,
      source: 'live_scrape',
      scrapedAt: scrapedProduct.scrapedAt,
      variants: cleanVariants,
    });
    created++;
    console.log(`＋ (baru) ${name} — ${cleanVariants.length} varian`);
  }
}

site.generatedNote = `Terakhir digabung dari hasil scrape: ${new Date().toISOString()}`;
fs.writeFileSync(sitePath, JSON.stringify(site, null, 2));

console.log(`\nSelesai. ${updated} produk diperbarui, ${created} produk baru ditambahkan, ${skipped} dilewati.`);
console.log(`docs/data.json sudah ditulis ulang. Refresh browser (Ctrl+Shift+R) untuk lihat hasilnya.`);
