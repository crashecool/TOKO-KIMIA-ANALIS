/**
 * parse.js
 * Mengubah teks mentah (innerText) dari section "Pilih Ukuran"
 * menjadi array data terstruktur: { size, sku, status, statusRaw, location, price }
 *
 * Didesain berbasis POLA TEKS, bukan CSS selector, karena struktur DOM asli
 * situs (Next.js, client-rendered) belum kita ketahui persis. Kalau nanti
 * layout situs berubah, biasanya cukup sesuaikan regex di sini saja.
 */

function parseSizeTable(rawText) {
  // Bersihkan whitespace aneh (tab, non-breaking space, dst)
  const text = rawText.replace(/\u00A0/g, ' ').replace(/\t/g, ' ');

  // Satu "entry" = Ukuran -> SKU -> Status(+lokasi opsional) -> Harga
  // Contoh yang harus tertangkap:
  //   "1 L\n1.00983.1000\nDiperkirakan dikirim HARI INIDariJakarta Timur,ID\nRp 550.000"
  //   "180 L\n1.00983.9180\nPemenuhan dan pengiriman tertunda\nRp 38.005.000"
  const entryRegex =
    /(\d+(?:\.\d+)?\s?L)\s*\n\s*(\d+(?:\.\d+){2,3})\s*\n\s*([^\n]+?)\s*\n\s*Rp\s?([\d.,]+)/g;

  const results = [];
  let match;

  while ((match = entryRegex.exec(text)) !== null) {
    const [, sizeRaw, sku, statusLine, priceRaw] = match;

    const isReady = /HARI INI|diperkirakan dikirim/i.test(statusLine);
    const isIndent = /tertunda/i.test(statusLine);

    // Coba pisahkan lokasi kalau ada, format: "...HARI INIDariJakarta Timur,ID"
    const locationMatch = statusLine.match(/Dari\s*([A-Za-z\s]+,\s*[A-Z]{2})$/);

    results.push({
      size: sizeRaw.replace(/\s+/g, ' ').trim(),
      sku: sku.trim(),
      status: isReady ? 'Ready' : isIndent ? 'Indent' : 'Unknown',
      statusRaw: statusLine.trim(),
      location: locationMatch ? locationMatch[1].trim() : null,
      price: Number(priceRaw.replace(/\./g, '').replace(',', '.')),
      priceDisplay: `Rp ${priceRaw}`,
    });
  }

  return results;
}

module.exports = { parseSizeTable };

// Quick self-test kalau file ini dijalankan langsung: `node parse.js`
if (require.main === module) {
  const sample = `
1 L
1.00983.1011	
Pemenuhan dan pengiriman tertunda
Rp 500.000
1 L
1.00983.1000	
Diperkirakan dikirim HARI INIDariJakarta Timur,ID
Rp 550.000
5 L
1.00983.5000	
Diperkirakan dikirim HARI INIDariJakarta Timur,ID
Rp 1.876.000
180 L
1.00983.9180	
Pemenuhan dan pengiriman tertunda
Rp 38.005.000
`;
  console.log(JSON.stringify(parseSizeTable(sample), null, 2));
}
