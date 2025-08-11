Mess SRIE — Aplikasi Pemesanan Snack & Nasi Kotak (STEP 1)

Isi paket:
- gas/Code.gs — Backend Google Apps Script (Web App)
- index.html — Frontend (buka langsung atau host di web server)
- assets/js/*.js — Modul JavaScript
- assets/css/style.css

Cara Setup Cepat (Step 1):
1) Buat Google Spreadsheet kosong (nama bebas). 
2) Buat Apps Script (Stand-alone atau bound ke spreadsheet). 
   - Salin isi gas/Code.gs ke editor.
   - (Opsional) Jika stand-alone dan ingin DB di spreadsheet tadi, buka Script Editor > jalankan fungsi setDbSheetId('SPREADSHEET_ID').
3) Jalankan fungsi ensureSchema_() sekali (menu Run) untuk membuat semua sheet & header. 
   - Admin default: admin / admin123
   - Menu default: Snack=7000, Nasi Kotak=25000
4) Deploy: Deploy > Web app. Set Who has access: Anyone. Salin URL Web App.
5) Buka folder frontend:
   - Edit assets/js/config.js → ganti WEB_APP_URL dengan URL Web App Anda.
   - Buka index.html di browser, login admin (untuk uji coba), lalu buat 1 user "biasa" di sheet Users jika diperlukan.
6) (Opsional) Konfigurasi Telegram:
   - Isi Config sheet: TELEGRAM_BOT_TOKEN dan ADMIN_CHAT_ID.
   - Saat pesanan baru dibuat, admin akan menerima notifikasi.

Catatan:
- Step 1 hanya mencakup alur Pengguna (Pemesanan + Daftar Pesanan).
- Step berikutnya akan menambahkan fitur Admin (persetujuan & alokasi), Mess (penerimaan & update status), laporan & ekspor, audit yang lebih lengkap, serta backup otomatis.
