# Sigma-Aldrich Scraper → Google Sheets

Scraper harga + status stok (Ready/Indent) dari halaman publik produk
Sigma-Aldrich, ditulis ke Google Sheets untuk dipakai website (GitHub Pages).

## ⚠️ Sebelum pakai

- **Selector CSS di `scrape.js` (`SIZE_SECTION_SELECTOR`) adalah tebakan.**
  Saya menyusun script ini tanpa bisa membuka DevTools situs Sigma-Aldrich
  sendiri. Jalankan dulu mode debug (lihat di bawah) untuk memastikan
  section "Pilih Ukuran" benar-benar ketemu. Kalau gagal, buka
  https://www.sigmaaldrich.com/ID/id/product/mm/100983 di browser → F12 →
  Elements → cari elemen pembungkus tabel ukuran → sesuaikan selector.
- Situs besar seperti ini biasanya punya Terms of Use yang melarang scraping
  otomatis untuk tujuan komersial, dan bisa mendeteksi/blokir bot. Ini bukan
  larangan teknis dari script-nya, tapi pertimbangkan risikonya sendiri
  (IP block, dsb) — terutama kalau dijalankan sering & di-scale ke ratusan
  produk. Lihat juga apakah Merck/Sigma Indonesia punya jalur resmi
  (reseller/distributor) untuk data harga, yang jauh lebih aman.
- Jangan scrape terlalu sering atau paralel. Default sudah dikasih jeda
  4-5 detik antar produk.

## Setup

```bash
npm install
npx playwright install chromium
```

### 1. Test parser (tanpa browser)

```bash
npm run test-parser
```

### 2. Test scraping 1 produk, browser kelihatan (debug)

```bash
npm run scrape:debug -- https://www.sigmaaldrich.com/ID/id/product/mm/100983
```

Kalau berhasil, `sigma-data.json` akan terisi data varian ukuran/harga/stok.
Kalau `variants` kosong / selector tidak ketemu, sesuaikan
`SIZE_SECTION_SELECTOR` di `scrape.js` sesuai temuan DevTools-mu.

### 3. Scrape banyak produk sekaligus

Isi `urls.txt` (satu URL per baris), lalu:

```bash
npm run scrape -- --file urls.txt
```

### 4. Setup Google Sheets

1. Buat Google Cloud Project → aktifkan **Google Sheets API**.
2. Buat **Service Account** → generate key JSON → simpan sebagai
   `credentials.json` di folder ini.
3. Buka Google Sheet tujuan → klik **Share** → tambahkan email service
   account (format `xxx@xxx.iam.gserviceaccount.com`) sebagai **Editor**.
4. Set environment variable:
   ```bash
   export SHEET_ID="ID_dari_url_sheet_kamu"
   ```
5. Jalankan:
   ```bash
   npm run update-sheet
   ```

### 5. Otomatisasi harian via GitHub Actions

Workflow sudah disiapkan di `.github/workflows/scrape.yml`, jalan tiap hari
jam 06:00 WIB. Yang perlu kamu siapkan di **Settings → Secrets → Actions**
repo GitHub-mu:

- `SHEET_ID` — ID Google Sheet
- `GOOGLE_CREDENTIALS_JSON_BASE64` — isi `credentials.json` di-encode base64:
  ```bash
  base64 -i credentials.json | tr -d '\n'
  ```
  (paste hasilnya sebagai secret; **jangan pernah commit credentials.json
  langsung ke repo**, apalagi kalau repo-nya publik)

## Menemukan produk lain dari PDF katalog

PDF katalog kamu (mis. `Daftar_Harga_Merck_2020.pdf`) kemungkinan berisi ribuan
produk, bukan cuma 5 yang sudah ada di demo. Untuk menemukan & menambahkannya:

```bash
# 1. Lihat semua produk yang ada di PDF (tidak mengubah urls.txt)
node generate-urls.js "path/ke/Daftar_Harga_Merck_2020.pdf"
# -> menulis all-products.csv, buka di Excel untuk cari produk yang kamu mau

# 2. Cari produk spesifik dan lihat hasilnya dulu (tanpa menambah apapun)
node generate-urls.js "path/ke/Daftar_Harga_Merck_2020.pdf" --search "asam"

# 3. Kalau hasilnya sudah pas, baru tambahkan ke urls.txt
node generate-urls.js "path/ke/Daftar_Harga_Merck_2020.pdf" --search "asam" --add --limit 10
```

⚠️ **Jangan generate ribuan URL sekaligus untuk di-scrape.** Selain lama,
ini menaikkan risiko rate-limit/block dari situs (lihat catatan ToS di atas).
Tambahkan bertahap sesuai kebutuhan katalog kamu, misalnya 10-30 produk per
kategori dulu, cek hasilnya, baru tambah lagi.

Setelah `urls.txt` terisi produk baru, alurnya sama seperti biasa:
```bash
npm run scrape:debug -- --file urls.txt
npm run merge-to-site
node add-categories.js   # opsional, kalau produk baru butuh kategori
```

Halaman **Katalog** dan **MSDS/SDS** otomatis mengikuti isi `docs/data.json`
— tidak perlu edit HTML manual lagi setiap nambah produk.

## Alur data lengkap

```
generate-urls.js (baca PDF katalog, cari & pilih produk)
   → urls.txt
   → scrape.js (Playwright buka tiap URL produk)
   → parse.js (ubah teks jadi data terstruktur)
   → sigma-data.json
   → merge-to-site.js (update produk lama + BUAT produk baru otomatis)
   → docs/data.json (sumber data situs, dipakai katalog.html DAN msds.html)
   → Website (katalog.html render dari data.json, msds.html juga render dari data.json)
```

## Menambah produk baru ke katalog (skala besar)

Jangan langsung scrape semua ribuan produk di PDF sekaligus — selain lama,
ini menaikkan risiko rate-limit dari situs Sigma-Aldrich. Alurnya:

```bash
# 1. Cari produk yang relevan dari PDF, lihat dulu tanpa nambah apa-apa
node generate-urls.js Daftar_Harga_Merck_2020.pdf --search "asam"

# 2. Kalau hasilnya sesuai, tambahkan ke urls.txt (batasi jumlahnya per batch)
node generate-urls.js Daftar_Harga_Merck_2020.pdf --search "asam" --add --limit 10

# 3. Scrape data live untuk URL yang baru ditambahkan
npm run scrape:debug -- --file urls.txt

# 4. Gabungkan ke situs (otomatis bikin entri baru untuk produk yang belum ada)
npm run merge-to-site
```

`all-products.csv` juga otomatis dibuat setiap kali `generate-urls.js` jalan —
berisi SEMUA produk di PDF (No. Katalog, nama, URL) sebagai referensi untuk
kamu telusuri manual sebelum memutuskan kata kunci `--search` apa yang dipakai.

Produk baru yang dibuat otomatis oleh `merge-to-site.js` belum punya CAS
Number (tidak ada di PDF katalog harga) — itu wajar, halaman katalog & MSDS
akan menampilkan kolom itu kosong sampai kamu isi manual di `docs/data.json`
kalau perlu.

## Halaman MSDS/SDS

`msds.html` sekarang render otomatis dari `docs/data.json` (sama seperti
katalog), jadi tidak perlu diedit manual setiap nambah produk. Link SDS
di-generate dari pola URL resmi Sigma-Aldrich: `/sds/mm/<No.Katalog>`.

## Struktur data per varian

```json
{
  "size": "5 L",
  "sku": "1.00983.5000",
  "status": "Ready",
  "statusRaw": "Diperkirakan dikirim HARI INIDariJakarta Timur,ID",
  "location": "Jakarta Timur,ID",
  "price": 1876000,
  "priceDisplay": "Rp 1.876.000"
}
```
