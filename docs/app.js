// ==== GANTI NOMOR INI dengan WhatsApp bisnis kamu (format: kode negara tanpa +, tanpa spasi) ====
const WHATSAPP_NUMBER = '6289652809692'; // CONTOH — WAJIB DIGANTI

const catalogEl = document.getElementById('catalog');
const searchInput = document.getElementById('searchInput');
const resultCount = document.getElementById('resultCount');
const template = document.getElementById('productCardTemplate');
const lastUpdatePill = document.getElementById('lastUpdatePill');

let allProducts = [];

function statusClass(status) {
  if (status === 'Ready') return 'ready';
  if (status === 'Indent') return 'indent';
  return 'unknown';
}

function buildWhatsAppLink(product) {
  const message =
    `Halo, saya mau tanya harga & stok terbaru untuk:\n` +
    `${product.name}\n` +
    `No. Katalog: ${product.catalogNo}\n` +
    `CAS: ${product.casNumber}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function renderProduct(product) {
  const node = template.content.cloneNode(true);

  node.querySelector('.label-catalog').textContent = product.catalogNo;
  node.querySelector('.label-cas').textContent = product.casNumber ? 'CAS ' + product.casNumber : '';
  node.querySelector('.product-name').textContent = product.name;

  const waLink = node.querySelector('.whatsapp-link');
  waLink.href = buildWhatsAppLink(product);

  const sourceNote = node.querySelector('.source-note');
  if (product.source === 'live_scrape') {
    sourceNote.textContent = `Data live · terakhir discrape ${product.scrapedAt}`;
    sourceNote.classList.add('live');
  } else {
    sourceNote.textContent = 'Harga referensi katalog 2020 · belum di-scrape live';
    sourceNote.classList.add('catalog');
  }

  const tbody = node.querySelector('.variant-table tbody');
  for (const v of product.variants) {
    const tr = document.createElement('tr');

    const tdSize = document.createElement('td');
    tdSize.textContent = v.size;

    const tdSku = document.createElement('td');
    tdSku.className = 'sku';
    tdSku.textContent = v.sku;

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'status-badge ' + statusClass(v.status);
    badge.textContent = v.status === 'Ready' ? 'Ready'
      : v.status === 'Indent' ? 'Indent'
      : 'Belum tahu';
    tdStatus.appendChild(badge);

    tr.append(tdSize, tdSku, tdStatus);
    tbody.appendChild(tr);
  }

  return node;
}

function renderCatalog(products) {
  catalogEl.innerHTML = '';
  resultCount.textContent = `${products.length} produk`;
  if (products.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Tidak ada produk yang cocok dengan filter/pencarian.';
    catalogEl.appendChild(empty);
    return;
  }
  for (const p of products) {
    catalogEl.appendChild(renderProduct(p));
  }
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();

  let result = allProducts.filter((p) => {
    if (q) {
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.catalogNo.toLowerCase().includes(q) ||
        (p.casNumber || '').toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    return true;
  });

  // Selalu urut Nama A-Z
  result.sort((a, b) => a.name.localeCompare(b.name));

  renderCatalog(result);
}

searchInput.addEventListener('input', applyFilters);

fetch('data.json')
  .then((res) => {
    if (!res.ok) throw new Error('Gagal load data.json (status ' + res.status + ')');
    return res.json();
  })
  .then((data) => {
    allProducts = data.products;
    const liveCount = allProducts.filter((p) => p.source === 'live_scrape').length;
    lastUpdatePill.textContent = `${allProducts.length} produk · ${liveCount} live-scraped`;
    applyFilters();
  })
  .catch((err) => {
    lastUpdatePill.textContent = 'gagal memuat data';
    catalogEl.innerHTML = `<div class="empty-state">
      Gagal memuat data.json.<br>
      Kalau kamu buka file ini langsung (file://), browser biasanya blok fetch lokal karena CORS.<br>
      Jalankan lewat server lokal, misalnya: <code>npx serve</code> atau <code>python3 -m http.server</code>
      di folder ini, lalu buka http://localhost.
    </div>`;
    console.error(err);
  });
