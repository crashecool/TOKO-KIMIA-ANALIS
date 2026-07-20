/**
 * update-sheet.js
 *
 * Membaca sigma-data.json (hasil scrape.js) dan menulis ulang ke Google Sheet,
 * satu baris per SKU/varian. Sheet ini nanti yang dibaca website GitHub Pages-mu.
 *
 * SETUP:
 * 1. Buat Google Cloud Project -> aktifkan "Google Sheets API"
 * 2. Buat Service Account -> download JSON key-nya -> simpan sebagai
 *    credentials.json di folder ini (JANGAN di-commit ke GitHub publik!)
 * 3. Share Google Sheet kamu ke email service account itu (role: Editor)
 * 4. Set environment variable SHEET_ID = ID sheet kamu
 *    (lihat di URL sheet: https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit)
 *
 * Usage: node update-sheet.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.SHEET_ID;
const SHEET_TAB = process.env.SHEET_TAB || 'Data';
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function main() {
  if (!SHEET_ID) {
    console.error('Set environment variable SHEET_ID dulu.');
    process.exit(1);
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('credentials.json tidak ditemukan. Lihat komentar di atas file ini untuk setup.');
    process.exit(1);
  }

  const dataPath = path.join(__dirname, 'sigma-data.json');
  const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Ratakan jadi satu baris per varian/SKU
  const rows = [
    ['Product Name', 'URL', 'Size', 'SKU', 'Status', 'Location', 'Price (IDR)', 'Scraped At'],
  ];

  for (const product of products) {
    if (product.error) continue;
    for (const v of product.variants) {
      rows.push([
        product.productName || '',
        product.url,
        v.size,
        v.sku,
        v.status,
        v.location || '',
        v.price,
        product.scrapedAt,
      ]);
    }
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Bersihkan tab dulu, lalu tulis ulang semua baris
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  console.log(`✓ ${rows.length - 1} baris varian ditulis ke Google Sheet.`);
}

main().catch((err) => {
  console.error('Gagal update sheet:', err.message);
  process.exit(1);
});
