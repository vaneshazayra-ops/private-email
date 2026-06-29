#!/bin/bash
#============================================================
# RichMail - One-Click Deploy Script
# 
# Cara pakai:
#   chmod +x deploy.sh
#   ./deploy.sh yourdomain.com
#
# Prerequisites: Docker & Docker Compose terinstall di VPS
#============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║     RichMail - Deployment Script        ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check domain argument
DOMAIN=${1:-""}
if [ -z "$DOMAIN" ]; then
    echo -e "${YELLOW}Usage: ./deploy.sh yourdomain.com${NC}"
    echo ""
    read -p "Masukkan domain Anda: " DOMAIN
    if [ -z "$DOMAIN" ]; then
        echo -e "${RED}Error: Domain diperlukan!${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Domain: ${DOMAIN}${NC}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker belum terinstall. Installing...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed!${NC}"
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Docker Compose belum terinstall. Installing...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed!${NC}"
fi

# Update docker-compose with domain
echo -e "${YELLOW}Configuring for domain: ${DOMAIN}${NC}"
sed -i "s/MAIL_DOMAINS=yourdomain.com/MAIL_DOMAINS=${DOMAIN}/" docker-compose.yml

# Stop existing container if running
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true

# Build and start
echo -e "${YELLOW}Building and starting RichMail...${NC}"
docker compose up -d --build 2>/dev/null || docker-compose up -d --build

# Wait for startup
sleep 3

# Check if running
if curl -s http://localhost/api/config > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ RichMail berhasil di-deploy!                 ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║                                                  ║${NC}"
    echo -e "${GREEN}║  Web:  http://${DOMAIN}                          ${NC}"
    echo -e "${GREEN}║  SMTP: ${DOMAIN}:25                              ${NC}"
    echo -e "${GREEN}║                                                  ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║  LANGKAH SELANJUTNYA:                            ║${NC}"
    echo -e "${GREEN}║                                                  ║${NC}"
    echo -e "${GREEN}║  1. Set DNS A Record:                            ║${NC}"
    echo -e "${GREEN}║     ${DOMAIN} -> $(curl -s ifconfig.me)          ${NC}"
    echo -e "${GREEN}║                                                  ║${NC}"
    echo -e "${GREEN}║  2. Set DNS MX Record:                           ║${NC}"
    echo -e "${GREEN}║     ${DOMAIN} -> ${DOMAIN} (priority 10)         ${NC}"
    echo -e "${GREEN}║                                                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}❌ Deployment gagal. Cek logs:${NC}"
    echo "   docker compose logs richmail"
fi
