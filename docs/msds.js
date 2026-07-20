const sdsBody = document.getElementById('sdsBody');
const sdsTable = document.getElementById('sdsTable');
const sdsEmpty = document.getElementById('sdsEmpty');
const searchInput = document.getElementById('searchInput');

let allProducts = [];

function buildSdsUrl(catalogNo) {
  // Pola resmi Sigma-Aldrich, sudah dikonfirmasi: /sds/mm/<No.Katalog dengan titik>
  return `https://www.sigmaaldrich.com/ID/id/sds/mm/${catalogNo}`;
}

function renderTable(products) {
  sdsBody.innerHTML = '';

  if (products.length === 0) {
    sdsTable.style.display = 'none';
    sdsEmpty.style.display = 'block';
    return;
  }
  sdsTable.style.display = 'table';
  sdsEmpty.style.display = 'none';

  for (const p of products) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = p.name;

    const tdCode = document.createElement('td');
    tdCode.className = 'sku';
    tdCode.textContent = p.catalogNo;

    const tdCas = document.createElement('td');
    tdCas.className = 'sku';
    tdCas.textContent = p.casNumber || '—';

    const tdLink = document.createElement('td');
    const a = document.createElement('a');
    a.className = 'sds-link';
    a.href = buildSdsUrl(p.catalogNo);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Unduh SDS ↗';
    tdLink.appendChild(a);

    tr.append(tdName, tdCode, tdCas, tdLink);
    sdsBody.appendChild(tr);
  }
}

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return renderTable(allProducts);

  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.catalogNo.toLowerCase().includes(q) ||
    (p.casNumber || '').toLowerCase().includes(q)
  );
  renderTable(filtered);
}

searchInput.addEventListener('input', applySearch);

fetch('data.json')
  .then((res) => {
    if (!res.ok) throw new Error('Gagal load data.json (status ' + res.status + ')');
    return res.json();
  })
  .then((data) => {
    allProducts = [...data.products].sort((a, b) => a.name.localeCompare(b.name));
    renderTable(allProducts);
  })
  .catch((err) => {
    sdsBody.innerHTML = '';
    sdsTable.style.display = 'none';
    sdsEmpty.style.display = 'block';
    sdsEmpty.textContent = 'Gagal memuat data.json. Pastikan situs dijalankan lewat server lokal (bukan file:// langsung).';
    console.error(err);
  });
