# Project Brief: Aplikasi Superadmin untuk Platform Chika POS F&B

## 1. Tujuan Utama Proyek

Membangun sebuah aplikasi web internal (panel admin) yang aman dan efisien bagi **Superadmin** untuk mengelola seluruh ekosistem platform Chika POS F&B. Aplikasi ini terpisah dari aplikasi kasir yang digunakan oleh tenant (toko).

Fungsi utamanya adalah untuk melakukan manajemen tenant, memverifikasi transaksi keuangan (top-up token), mengelola fitur premium, dan memantau kesehatan platform secara keseluruhan.

## 2. Pengguna Target

- **Superadmin / Pemilik Platform**: Satu-satunya pengguna aplikasi ini.

## 3. Fitur-Fitur Inti yang Diperlukan

### 3.1. Dashboard Utama Platform
- **Tujuan**: Memberikan gambaran umum (helicopter view) tentang kondisi seluruh platform dalam satu layar.
- **Metrik yang Harus Ditampilkan**:
    - **Total Saldo Token**: Jumlah gabungan saldo Pradana Token dari semua toko.
    - **Total Toko Terdaftar**: Jumlah total dokumen di koleksi `stores`.
    - **Total Transaksi Platform**: Jumlah total transaksi dari semua toko.
    - **Total Pendapatan Platform**: Jumlah total `totalAmount` dari semua transaksi di semua toko.
    - **Grafik Pertumbuhan**: Grafik garis yang menunjukkan pertumbuhan pendapatan platform dalam 6 bulan terakhir.
- **Tabel Aksi Cepat**:
    - Daftar **5 pengajuan top-up terbaru** yang berstatus `pending` dengan tombol "Verifikasi Sekarang".
    - Daftar **5 toko terbaru** yang mendaftar.

### 3.2. Manajemen Verifikasi Top-Up
- **Tujuan**: Memproses permintaan top-up saldo Pradana Token dari semua toko.
- **Alur Kerja**:
    1. Superadmin melihat daftar semua pengajuan top-up di **root collection `topUpRequests`**, diurutkan dari yang terbaru, dengan status `pending` di paling atas.
    2. Setiap baris menampilkan: Nama Toko, Tanggal Pengajuan, Jumlah Transfer (termasuk kode unik), dan tombol "Lihat Bukti".
    3. Mengklik "Lihat Bukti" akan membuka gambar bukti transfer di tab baru atau modal.
    4. Superadmin memiliki dua tombol aksi untuk setiap permintaan `pending`: **Approve** dan **Reject**.
    5. **Jika `Approve`**:
        - Status permintaan diubah menjadi `completed`.
        - Saldo `pradanaTokenBalance` di dokumen `stores/{storeId}` yang bersangkutan **ditambah** sesuai jumlah token yang dibeli.
        - (Opsional) Kirim notifikasi WhatsApp/email ke pemilik toko bahwa top-up berhasil.
    6. **Jika `Reject`**:
        - Status permintaan diubah menjadi `rejected`.
        - Saldo token toko tidak berubah.
        - (Opsional) Kirim notifikasi bahwa top-up ditolak, mungkin beserta alasannya.

### 3.3. Manajemen Toko (Tenant)
- **Tujuan**: Mengelola siklus hidup dan data master dari setiap toko yang terdaftar.
- **Fitur**:
    - **Daftar Semua Toko**: Tampilkan semua toko dalam bentuk tabel dengan kolom: Nama Toko, Nama Admin, Saldo Token, Status (Aktif/Nonaktif), Tanggal Bergabung.
    - **Lihat Detail Toko**: Kemampuan untuk mengklik satu toko dan melihat detail lebih lanjut, termasuk daftar semua karyawan yang terdaftar di toko tersebut.
    - **Kelola Langganan Katalog Premium**: Di halaman detail toko, Superadmin harus bisa mengatur atau memperpanjang tanggal kedaluwarsa langganan katalog digital dengan mengatur field `catalogSubscriptionExpiry` (timestamp).
    - **Ubah Saldo Token Manual**: Superadmin harus bisa **menambah** atau **mengurangi** saldo `pradanaTokenBalance` secara manual untuk tujuan koreksi, bonus, atau penalti. Setiap perubahan manual harus dicatat (di-log).
    - **Aktifkan/Nonaktifkan Toko**: Kemampuan untuk mengubah status toko. Toko yang nonaktif tidak akan bisa login atau melakukan transaksi.

### 3.4. Pengaturan Global Platform
- **Tujuan**: Mengelola variabel dan konfigurasi yang berlaku untuk seluruh platform.
- **Halaman Pengaturan**:
    - **Biaya Platform & Langganan**: Form untuk mengubah nilai di dokumen `appSettings/transactionFees` (misal: `feePercentage`, `minFeeRp`, `aiUsageFee`, `newStoreBonusTokens`, `catalogMonthlyFee`, `catalogSixMonthFee`, `catalogYearlyFee`).
    - **Info Rekening Bank**: Form untuk mengubah data rekening bank tujuan transfer yang ada di `appSettings/bankAccount`.
    - **Promo Halaman Login**: Form untuk mengubah teks promosi yang ditampilkan di halaman login (`appSettings/loginPromo`).

## 4. Persyaratan Teknis & Struktur Data

- **Framework**: Disarankan menggunakan Next.js & TypeScript, konsisten dengan aplikasi utama.
- **Database**: Terhubung ke project Firebase yang sama dengan aplikasi kasir.
- **Struktur Data Firestore yang Relevan**:
    - `stores/{storeId}`: Dokumen utama untuk setiap toko. Superadmin perlu akses `read` & `write` penuh ke koleksi ini.
    - `topUpRequests/{requestId}`: **(Root Collection)** Koleksi utama untuk semua riwayat top-up dari semua toko. Superadmin perlu akses `read` & `write`.
    - `stores/{storeId}/topUpRequests/{requestId}`: Sub-koleksi yang disinkronkan oleh Cloud Function untuk riwayat per toko (hanya untuk tampilan di aplikasi toko).
    - `users/{userId}`: Superadmin perlu akses `read` ke semua dokumen pengguna untuk manajemen.
    - `appSettings/{documentId}`: Superadmin perlu akses `read` & `write` penuh ke koleksi ini.
- **Aturan Keamanan (Firestore Rules)**:
    - Buat peran `superadmin` di Custom Claims Firebase Auth.
    - Aturan harus memberikan hak akses baca/tulis penuh ke seluruh database **hanya jika** `request.auth.token.role == 'superadmin'`.

## 5. Alur Login & Keamanan

- Superadmin harus login melalui halaman login yang terpisah dari aplikasi kasir.
- Gunakan akun email khusus untuk Superadmin.
- Setelah login, Firebase Auth Custom Claims harus digunakan untuk mengidentifikasi pengguna sebagai `superadmin`, yang akan divalidasi oleh Firestore Rules.
