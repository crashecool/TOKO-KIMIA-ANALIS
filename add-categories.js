/**
 * add-categories.js
 *
 * Menambahkan field `category` dan `regulatoryType` ke docs/data.json kamu
 * berdasarkan No. Katalog, TANPA menyentuh variants/status/harga yang sudah
 * kamu scrape live. Aman dijalankan kapan saja.
 *
 * Kalau nanti nambah produk baru, cukup tambahkan entrinya di CATEGORY_MAP
 * di bawah, lalu jalankan lagi: node add-categories.js
 */

const fs = require('fs');
const path = require('path');

const sitePath = path.join(__dirname, 'docs', 'data.json');

const CATEGORY_MAP = {
  '1.00983': { category: 'Pelarut', regulatoryType: 'Ethanol (Kena Cukai)' },
  '1.00014': { category: 'Pelarut', regulatoryType: 'Prekursor' },
  '1.06009': { category: 'Pelarut', regulatoryType: null },
  '1.00731': { category: 'Asam', regulatoryType: 'Prekursor' },
  '1.00316': { category: 'Asam', regulatoryType: 'Prekursor' },
};

const site = JSON.parse(fs.readFileSync(sitePath, 'utf-8'));

let updated = 0;
for (const product of site.products) {
  const meta = CATEGORY_MAP[product.catalogNo];
  if (meta) {
    product.category = meta.category;
    product.regulatoryType = meta.regulatoryType;
    updated++;
  } else {
    product.category = product.category || 'Lainnya';
    product.regulatoryType = product.regulatoryType ?? null;
  }
}

fs.writeFileSync(sitePath, JSON.stringify(site, null, 2));
console.log(`✓ ${updated} produk diberi kategori. docs/data.json diperbarui, variants tidak diubah.`);
