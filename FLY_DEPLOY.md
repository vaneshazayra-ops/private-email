# 🚀 Deploy RichMail ke Fly.io (GRATIS)

## Langkah-langkah:

---

### Step 1: Install Fly CLI

**Windows (PowerShell):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**Mac:**
```bash
brew install flyctl
```

**Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

---

### Step 2: Daftar & Login Fly.io

```bash
fly auth signup
# atau kalau sudah punya akun:
fly auth login
```

> ⚠️ Perlu kartu kredit/debit untuk verifikasi, tapi TIDAK akan dicharge jika pakai free tier.

---

### Step 3: Clone Repository

```bash
git clone https://github.com/ramax100/Richmail.git
cd Richmail
```

---

### Step 4: Edit Domain

Buka file `fly.toml`, ganti domain Anda:

```toml
[env]
  MAIL_DOMAINS = "yourdomain.com"
```

---

### Step 5: Launch App

```bash
fly launch --no-deploy
```
- Pilih nama app (contoh: `richmail` atau `my-tempmail`)
- Pilih region: **Singapore (sin)** untuk Indonesia
- Pilih **No** untuk database

---

### Step 6: Buat Volume (Storage)

```bash
fly volumes create richmail_data --size 1 --region sin
```

---

### Step 7: Allocate IP untuk SMTP

```bash
# IP dedicated (diperlukan untuk port 25 SMTP)
fly ips allocate-v4
fly ips allocate-v6
```

Catat IP yang didapat (contoh: `123.45.67.89`)

---

### Step 8: Deploy!

```bash
fly deploy
```

Tunggu sampai selesai (biasanya 1-3 menit).

---

### Step 9: Setup DNS Domain

Di panel DNS domain Anda, tambahkan:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| A | @ | IP_DARI_STEP_7 | - |
| MX | @ | yourdomain.com | 10 |

**Atau** jika pakai subdomain (misal `mail.yourdomain.com`):
| Type | Name | Value | Priority |
|------|------|-------|----------|
| A | mail | IP_DARI_STEP_7 | - |
| MX | @ | mail.yourdomain.com | 10 |

---

### Step 10: Custom Domain di Fly.io

```bash
fly certs add yourdomain.com
```

Ini akan otomatis generate SSL certificate (HTTPS gratis!).

---

### Step 11: Test!

1. Buka: `https://yourdomain.com`
2. Generate email address
3. Kirim email dari Gmail ke address tersebut
4. Cek inbox — email akan muncul! ✅

---

## Perintah Berguna

```bash
# Cek status
fly status

# Lihat logs (realtime)
fly logs

# SSH ke container
fly ssh console

# Restart
fly apps restart

# Scale (jika perlu)
fly scale count 1

# Lihat IP
fly ips list

# Update setelah edit code
fly deploy
```

---

## Free Tier Fly.io

Yang didapat gratis:
- ✅ 3 shared-cpu-1x VMs
- ✅ 256MB RAM per VM
- ✅ 3GB persistent storage
- ✅ 160GB outbound transfer/bulan
- ✅ Dedicated IPv4 & IPv6
- ✅ Custom domain + SSL gratis
- ✅ Port TCP (untuk SMTP)

Lebih dari cukup untuk TempMail!

---

## Troubleshooting

### "Port 25 not reachable"
```bash
# Pastikan IP sudah dialokasi
fly ips list

# Cek service TCP aktif
fly status
```

### "Email tidak masuk"
1. Cek MX record: https://mxtoolbox.com
2. Cek logs: `fly logs`
3. Pastikan domain MX pointing ke IP Fly

### "App not starting"
```bash
fly logs
fly status
```

### Ganti domain
```bash
# Edit fly.toml -> MAIL_DOMAINS
fly deploy
```

---

## Arsitektur di Fly.io

```
Internet
    │
    ├── Port 443 (HTTPS) ──→ Fly Proxy ──→ Web UI (:8080)
    │
    └── Port 25 (SMTP)   ──→ Fly TCP  ──→ SMTP Server (:25)
                                              │
                                              ▼
                                        Volume Storage
                                       (richmail_data)
```
