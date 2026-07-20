/**
 * scrape.js
 *
 * Membuka halaman produk Sigma-Aldrich pakai headless browser (Playwright),
 * menunggu section "Pilih Ukuran" ter-render oleh JS, lalu mengekstrak
 * teksnya dan mem-parsenya lewat parse.js.
 *
 * PENTING - baca sebelum pakai:
 * - Selector CSS di bawah (SIZE_SECTION_SELECTOR) adalah TEBAKAN karena saya
 *   tidak bisa membuka DevTools situs ini sendiri. Jalankan dulu dengan
 *   `HEADLESS=false node scrape.js <url>` untuk lihat browsernya beneran
 *   nemu section itu atau tidak. Kalau gagal, cek di DevTools browser kamu
 *   selector apa yang membungkus tabel "Pilih Ukuran", lalu ganti di bawah.
 * - Situs ini kemungkinan besar punya Terms of Use yang melarang scraping
 *   otomatis untuk tujuan komersial. Pertimbangkan risiko itu (rate limit,
 *   IP block, atau masalah ToS) sebelum menjalankan ini secara terjadwal
 *   dan publik.
 * - Jangan scrape terlalu cepat/banyak sekaligus. Ada delay + user-agent
 *   wajar di bawah supaya tidak membebani server mereka.
 *
 * Usage:
 *   node scrape.js <product_url> [<product_url2> ...]
 *   node scrape.js --file urls.txt
 *
 * Output: sigma-data.json (array hasil scrape semua produk)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { parseSizeTable } = require('./parse');

const HEADLESS = process.env.HEADLESS !== 'false';
const DELAY_MS = Number(process.env.DELAY_MS || 4000); // jeda antar produk

// TEBAKAN selector — sesuaikan setelah cek DevTools kamu sendiri.
// Fallback: kalau selector ini tidak ketemu, kita ambil innerText <body>
// penuh dan biarkan regex di parse.js yang menyaring.
const SIZE_SECTION_SELECTOR = '[class*="size" i], [data-testid*="size" i]';

async function scrapeProduct(browser, url) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });

  console.log(`\n→ Membuka ${url}`);
  // 'domcontentloaded' jauh lebih reliable daripada 'networkidle' di situs
  // modern — 'networkidle' sering timeout kalau ada chat widget/analytics/
  // polling yang bikin network tidak pernah benar-benar diam.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Nama & CAS number biasanya ada di elemen H1/heading & tabel identitas
  const productName = await page
    .locator('h1')
    .first()
    .textContent()
    .catch(() => null);

  // Tunggu section ukuran/harga muncul (kalau selector-nya benar).
  // Ini yang benar-benar menentukan "sudah siap di-scrape", bukan status
  // network global.
  let rawText = '';
  try {
    await page.waitForSelector(SIZE_SECTION_SELECTOR, { timeout: 20000 });
    // beri jeda kecil supaya harga/stok yang di-render belakangan (async) sempat masuk
    await page.waitForTimeout(1500);
    rawText = await page.locator(SIZE_SECTION_SELECTOR).first().innerText();
  } catch (e) {
    console.warn(
      '  ⚠ Selector ukuran tidak ketemu, fallback ke seluruh body. ' +
        'Cek DevTools untuk selector yang lebih presisi.'
    );
    rawText = await page.locator('body').innerText();
  }

  const variants = parseSizeTable(rawText);

  await page.close();

  return {
    url,
    productName: productName ? productName.trim() : null,
    scrapedAt: new Date().toISOString(),
    variants,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let urls = [];

  if (args[0] === '--file') {
    const filePath = args[1];
    urls = fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } else {
    urls = args;
  }

  if (urls.length === 0) {
    console.error('Kasih minimal 1 URL produk, atau --file urls.txt');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const output = [];

  const MAX_RETRIES = 2;

  for (const url of urls) {
    let lastErr = null;
    let result = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await scrapeProduct(browser, url);
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`  ⚠ Percobaan ${attempt}/${MAX_RETRIES} gagal: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    if (result) {
      output.push(result);
      console.log(`  ✓ ${result.variants.length} varian ukuran ditemukan`);
    } else {
      console.error(`  ✗ Gagal scrape ${url} setelah ${MAX_RETRIES}x percobaan:`, lastErr.message);
      output.push({ url, error: lastErr.message, scrapedAt: new Date().toISOString() });
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  await browser.close();

  const outPath = path.join(__dirname, 'sigma-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nSelesai. Data tersimpan di ${outPath}`);
}

main();
