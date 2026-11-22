# Department of Artifacts (D/A) — Web MVP & Panel Admin

Web MVP untuk studio fotografi dokumenter **Department of Artifacts (D/A)** yang dibangun sesuai panduan identitas visual D/A (`Krem Berkas #F3E9D2`, `Cokelat Tinta #24140C`, `Oranye Arsip #E0561B`, `Biru Kosmik #1D4E9E`, `Kuning Sinyal #E8B53A`) dan dilengkapi **Panel Admin (`FORM D/A-ADM`)** untuk kustomisasi situs secara langsung.

## Menjalankan Aplikasi

```bash
npm install
npm start
```

- **Web Publik:** `http://localhost:3000`
- **Panel Admin:** `http://localhost:3000/admin`
- **Kata Sandi Admin Bawaan:** `da-admin-2026` *(bisa diganti di menu 07 · Pengaturan)*

## Fitur Utama

### Web Publik (`/`)
- **Identitas & Tema Dinamis:** Seluruh warna, radius, teks, kontak, dan visibilitas seksi mengikuti konfigurasi dari Panel Admin.
- **Katalog Arsip Interaktif:** Filter kategori dinamis + Lightbox modal dengan catatan lapangan dan tombol langsung ke formulir booking.
- **Layanan & Paket:** Kartu paket bernomor form (`FORM D/A-WSD`, `FORM D/A-WDD`, `FORM D/A-EVT`) dengan estimasi tarif.
- **Formulir Pengajuan Jadwal:** Tersimpan otomatis ke backend, menerbitkan nomor resi resmi (`D/A-YYYY-XXXX`), dilengkapi tombol **Kirim ke WhatsApp** dan **Salin Ringkasan**.

### Panel Admin (`/admin`)
- **00 · Ringkasan:** Statistik pengajuan baru, arsip aktif, paket layanan, dan pengajuan terbaru.
- **01 · Identitas & Kontak:** Ubah nama merek, monogram, kota, Instagram, WhatsApp, email, dan jam balasan.
- **02 · Tampilan & Warna:** Color picker palet warna, 4 preset tema arsip, slider radius sudut, dan toggle tampil/sembunyi tiap seksi.
- **03 · Hero & Alur Kerja:** Edit headline, deskripsi, unggah foto Hero baru, watermark, caption, tahapan proses, serta kutipan brand voice.
- **04 · Katalog Arsip:** Tambah, edit, hapus, urutkan, sembunyikan/tampilkan arsip, serta unggah foto langsung (JPG/PNG/WEBP).
- **05 · Layanan & Paket:** Kelola paket layanan, harga, daftar fasilitas, highlight paket utama, dan daftar tambahan opsional (add-ons).
- **06 · Pengajuan Masuk:** Kelola berkas booking klien (`BARU`, `DIKONFIRMASI`, `SELESAI`, `DIBATALKAN`) dan catatan internal admin.
- **07 · Pengaturan:** Ganti kata sandi admin, Ekspor/Impor JSON konfigurasi, dan Reset ke standar D/A.
- **Pratinjau Live:** Lihat hasil kustomisasi dalam mode Desktop/Mobile sebelum disimpan.
