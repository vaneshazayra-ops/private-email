# 🚀 Panduan Deploy RichMail

## Cara Paling Gampang (VPS + Docker)

### Butuh:
- VPS (DigitalOcean, Vultr, Linode, dll) — mulai $4/bulan
- Domain (beli di Namecheap, Cloudflare, Niagahoster, dll)

---

## Step 1: Beli/Sewa VPS

Rekomendasi murah:
- **Vultr** — $3.50/bulan (1 CPU, 512MB RAM) ✅ cukup
- **DigitalOcean** — $4/bulan (Basic Droplet)
- **Linode** — $5/bulan
- **Contabo** — €3.99/bulan (lebih murah)

Pilih OS: **Ubuntu 22.04** atau **24.04**

---

## Step 2: Setup DNS Domain

Di panel DNS domain Anda (Cloudflare/Namecheap/dll), tambahkan:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| A | @ | IP_VPS_ANDA | - |
| A | mail | IP_VPS_ANDA | - |
| MX | @ | yourdomain.com | 10 |

**Contoh:**
Jika domain = `richmail.xyz` dan IP VPS = `123.45.67.89`:
```
A    @      123.45.67.89
A    mail   123.45.67.89
MX   @      richmail.xyz    (priority: 10)
```

⚠️ DNS propagation bisa 5 menit - 48 jam (biasanya 5-30 menit)

---

## Step 3: Deploy di VPS

SSH ke VPS Anda:
```bash
ssh root@IP_VPS_ANDA
```

Clone repository:
```bash
git clone https://github.com/ramax100/Richmail.git
cd Richmail
```

Jalankan deploy script:
```bash
chmod +x deploy.sh
./deploy.sh yourdomain.com
```

**Selesai!** 🎉

---

## Step 4: Test

1. Buka browser → `http://yourdomain.com`
2. Generate atau buat email address
3. Kirim test email dari Gmail/Yahoo ke address tersebut
4. Email akan muncul di inbox dalam beberapa detik!

---

## Perintah Berguna

```bash
# Lihat logs
docker compose logs -f richmail

# Restart
docker compose restart

# Stop
docker compose down

# Update (setelah git pull)
docker compose up -d --build

# Ganti domain
# Edit docker-compose.yml -> MAIL_DOMAINS=newdomain.com
docker compose up -d --build
```

---

## Multi-Domain

Untuk menggunakan beberapa domain sekaligus:

```yaml
# docker-compose.yml
environment:
  - MAIL_DOMAINS=domain1.com,domain2.com,domain3.com
```

Pastikan setiap domain punya MX record pointing ke VPS Anda.

---

## Tambah HTTPS (Opsional tapi Recommended)

Untuk HTTPS, tambahkan Nginx + Let's Encrypt:

```bash
# Install Nginx
apt install nginx certbot python3-certbot-nginx -y

# Buat config Nginx
cat > /etc/nginx/sites-available/richmail << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/richmail /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Dapatkan SSL certificate
certbot --nginx -d yourdomain.com
```

Jika pakai HTTPS, ubah port mapping di docker-compose.yml:
```yaml
ports:
  - "3000:3000"   # Nginx yang handle port 80/443
  - "25:25"       # SMTP tetap
```

---

## Troubleshooting

### Email tidak masuk?
1. Cek MX record: `dig MX yourdomain.com`
2. Cek port 25 terbuka: `telnet yourdomain.com 25`
3. Cek container running: `docker compose ps`
4. Cek logs: `docker compose logs richmail`

### Port 25 diblock?
Beberapa cloud provider (AWS, GCP) block port 25 by default.
- **Vultr** — Port 25 terbuka ✅
- **DigitalOcean** — Perlu request buka port 25
- **AWS/GCP** — Perlu request khusus

### DNS belum propagate?
Cek di: https://mxtoolbox.com/SuperTool.aspx

---

## Arsitektur

```
Internet
    │
    ├── Port 80 (HTTP) ──→ Web Interface (lihat inbox)
    │
    └── Port 25 (SMTP) ──→ SMTP Server (terima email)
                                │
                                ▼
                          JSON Database
                          (data/emails.json)
```
