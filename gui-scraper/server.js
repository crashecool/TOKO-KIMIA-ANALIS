/**
 * server.js — GUI Scraper
 *
 * Aplikasi lokal (buka di browser: http://localhost:3000) untuk scraping
 * seluruh katalog (5.359 produk) secara bertahap, batch 500, sampai habis.
 *
 * Fitur:
 * - Skip LANGSUNG kalau server balas HTTP 404 (tidak retry)
 * - Resumable: progress disimpan di attempted-codes.json, jadi kalau app
 *   ditutup/dibuka lagi atau laptop restart, lanjut dari yang belum selesai
 * - Pakai Firefox headless (bukan Chromium)
 * - Auto commit + push ke GitHub tiap batch 500 selesai (bisa dimatikan dari GUI)
 *
 * Jalankan: node server.js
 * Lalu buka: http://localhost:3000
 */

const express = require('express');
const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseSizeTable } = require('../parse');

const ROOT = path.join(__dirname, '..'); // folder sigma-scraper utama
const CATALOG_INDEX_PATH = path.join(ROOT, 'catalog-index.json');
const ATTEMPTED_PATH = path.join(ROOT, 'attempted-codes.json');
const URLS_PATH = path.join(ROOT, 'urls.txt');
const SITE_DATA_PATH = path.join(ROOT, 'docs', 'data.json');

const SIZE_SECTION_SELECTOR = '[class*="size" i], [data-testid*="size" i]';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- State ----------
let state = {
  running: false,
  paused: false,
  batchSize: 500,
  autoCommit: true,
  currentIndex: 0, // posisi di daftar "remaining" saat ini
  totalRemaining: 0,
  totalAll: 0,
  totalDone: 0, // dari attempted-codes.json
  successCount: 0,
  notFoundCount: 0,
  errorCount: 0,
  currentUrl: null,
};

const sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
}

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('id-ID')}] ${msg}`;
  console.log(line);
  broadcast('log', { line });
}

// ---------- Helpers data ----------
function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function loadAttempted() {
  return new Set(loadJson(ATTEMPTED_PATH, []));
}

function saveAttempted(set) {
  fs.writeFileSync(ATTEMPTED_PATH, JSON.stringify([...set], null, 0));
}

function catalogNoToUrl(code) {
  const urlCode = code.replace('.', '');
  return `https://www.sigmaaldrich.com/ID/id/product/mm/${urlCode}`;
}

function appendUrlToUrlsTxt(url) {
  const existing = fs.existsSync(URLS_PATH)
    ? fs.readFileSync(URLS_PATH, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  if (!existing.includes(url)) {
    existing.push(url);
    fs.writeFileSync(URLS_PATH, existing.join('\n') + '\n');
  }
}

function upsertProductToSiteData(productName, catalogNo, url, variants) {
  const site = loadJson(SITE_DATA_PATH, { products: [] });
  const cleanVariants = variants.map((v) => ({
    size: v.size,
    sku: v.sku,
    status: v.status,
    location: v.location || null,
    price: v.price,
  }));
  const match = site.products.find((p) => p.url === url);
  if (match) {
    match.variants = cleanVariants;
    match.source = 'live_scrape';
    match.scrapedAt = new Date().toISOString();
  } else {
    site.products.push({
      name: productName || 'Nama produk belum diketahui',
      catalogNo,
      casNumber: null,
      url,
      source: 'live_scrape',
      scrapedAt: new Date().toISOString(),
      variants: cleanVariants,
    });
  }
  fs.writeFileSync(SITE_DATA_PATH, JSON.stringify(site, null, 2));
}

function gitCommitAndPush(message) {
  try {
    execSync('git pull', { cwd: ROOT, stdio: 'pipe' });
    execSync('git add urls.txt docs/data.json attempted-codes.json catalog-index.json', {
      cwd: ROOT,
      stdio: 'pipe',
    });
    const diff = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (!diff) {
      log('Tidak ada perubahan untuk di-commit.');
      return;
    }
    execSync(`git commit -m "${message}"`, { cwd: ROOT, stdio: 'pipe' });
    execSync('git push', { cwd: ROOT, stdio: 'pipe' });
    log('✓ Commit & push berhasil.');
  } catch (err) {
    log(`⚠ Gagal commit/push: ${err.message.split('\n')[0]}`);
  }
}

// ---------- Scraping ----------
async function scrapeOne(browser, url) {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  });

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    await page.close();
    throw err;
  }

  if (response && response.status() === 404) {
    await page.close();
    return { notFound: true };
  }

  const productName = await page.locator('h1').first().textContent().catch(() => null);

  let rawText = '';
  try {
    await page.waitForSelector(SIZE_SECTION_SELECTOR, { timeout: 15000 });
    await page.waitForTimeout(1200);
    rawText = await page.locator(SIZE_SECTION_SELECTOR).first().innerText();
  } catch {
    rawText = await page.locator('body').innerText();
  }

  await page.close();

  const variants = parseSizeTable(rawText);
  return { productName: productName ? productName.trim() : null, variants };
}

// ---------- Loop utama ----------
let browserInstance = null;
let stopRequested = false;

async function startScraping() {
  if (state.running) return;
  state.running = true;
  state.paused = false;
  stopRequested = false;
  broadcast('state', state);

  const catalogIndex = loadJson(CATALOG_INDEX_PATH, {});
  const allCodes = Object.keys(catalogIndex).sort();
  let attempted = loadAttempted();

  state.totalAll = allCodes.length;

  log(`Memulai Firefox headless...`);
  browserInstance = await firefox.launch({ headless: true });

  let processedInBatch = 0;

  for (const code of allCodes) {
    if (stopRequested) break;

    // Tunggu kalau lagi di-pause (tanpa hentikan browser)
    while (state.paused && !stopRequested) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (stopRequested) break;

    if (attempted.has(code)) continue; // sudah pernah diproses (sukses/404/error), skip

    const url = catalogNoToUrl(code);
    state.currentUrl = url;
    broadcast('state', state);

    try {
      const result = await scrapeOne(browserInstance, url);

      if (result.notFound) {
        log(`⏭ 404, skip: ${code} (${catalogIndex[code]})`);
        state.notFoundCount++;
      } else if (result.variants.length === 0) {
        log(`⚠ 0 varian ditemukan: ${code} (${catalogIndex[code]}) — ditandai selesai, tidak diulang`);
        state.errorCount++;
      } else {
        log(`✓ ${code} (${catalogIndex[code]}) — ${result.variants.length} varian`);
        appendUrlToUrlsTxt(url);
        upsertProductToSiteData(result.productName || catalogIndex[code], code, url, result.variants);
        state.successCount++;
      }
    } catch (err) {
      log(`✗ Error ${code}: ${err.message.split('\n')[0]}`);
      state.errorCount++;
    }

    attempted.add(code);
    saveAttempted(attempted);

    state.totalDone = attempted.size;
    state.totalRemaining = state.totalAll - state.totalDone;
    processedInBatch++;
    broadcast('state', state);

    if (processedInBatch >= state.batchSize) {
      log(`--- Batch ${state.batchSize} selesai. Checkpoint. ---`);
      if (state.autoCommit) {
        gitCommitAndPush(
          `chore: scrape batch otomatis (GUI) — ${state.totalDone}/${state.totalAll} produk`
        );
      }
      processedInBatch = 0;
    }

    // Jeda sopan antar request
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (browserInstance) await browserInstance.close();
  browserInstance = null;

  if (state.autoCommit) {
    gitCommitAndPush(`chore: scrape final checkpoint (GUI) — ${state.totalDone}/${state.totalAll} produk`);
  }

  state.running = false;
  state.currentUrl = null;
  broadcast('state', state);
  log(stopRequested ? 'Dihentikan oleh user.' : '✓ SELESAI — semua produk sudah diproses.');
}

// ---------- Routes ----------
app.get('/api/status', (req, res) => {
  const catalogIndex = loadJson(CATALOG_INDEX_PATH, {});
  const attempted = loadAttempted();
  res.json({
    ...state,
    totalAll: Object.keys(catalogIndex).length,
    totalDone: attempted.size,
    totalRemaining: Object.keys(catalogIndex).length - attempted.size,
  });
});

app.post('/api/start', (req, res) => {
  const { batchSize, autoCommit } = req.body;
  if (batchSize) state.batchSize = Number(batchSize);
  if (typeof autoCommit === 'boolean') state.autoCommit = autoCommit;
  if (!state.running) startScraping();
  res.json({ ok: true });
});

app.post('/api/pause', (req, res) => {
  state.paused = true;
  broadcast('state', state);
  log('⏸ Dijeda oleh user.');
  res.json({ ok: true });
});

app.post('/api/resume', (req, res) => {
  state.paused = false;
  broadcast('state', state);
  log('▶ Dilanjutkan oleh user.');
  res.json({ ok: true });
});

app.post('/api/stop', (req, res) => {
  stopRequested = true;
  state.paused = false;
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\nGUI Scraper jalan di http://localhost:${PORT}\n`);
});
