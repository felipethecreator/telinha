#!/usr/bin/env bash
# =====================================================================
# Telinha — instala e configura o coturn (relay TURN) numa VM Ubuntu.
# Feito pra VM "always free" da Oracle Cloud. Rodar com:
#   sudo bash setup-coturn.sh
# =====================================================================
set -euo pipefail

if [ "$(id -u)" != 0 ]; then
  echo "Roda com sudo: sudo bash setup-coturn.sh"
  exit 1
fi

echo ">> Descobrindo o IP público da VM..."
IP_PUBLICO=$(curl -s https://checkip.amazonaws.com || curl -s https://api.ipify.org)
echo "   IP: ${IP_PUBLICO}"

echo ">> Gerando segredo compartilhado..."
SECRET=$(openssl rand -hex 32)

echo ">> Instalando o coturn..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq coturn

echo ">> Escrevendo /etc/turnserver.conf..."
cat > /etc/turnserver.conf << EOF
# --- Telinha / coturn ---
listening-port=3478
fingerprint
# autenticação REST: o servidor da Telinha gera credenciais temporárias com este segredo
use-auth-secret
static-auth-secret=${SECRET}
realm=telinha
external-ip=${IP_PUBLICO}
# faixa de portas usada pra retransmitir a mídia
min-port=49152
max-port=65535
# limite de banda por sessão (~12 Mbps) pra ninguém abusar do relay
max-bps=1500000
no-multicast-peers
no-cli
no-tlsv1
no-tlsv1_1
EOF

echo ">> Habilitando e iniciando o serviço..."
sed -i 's/#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null \
  || echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn
systemctl enable coturn
systemctl restart coturn

echo ">> Abrindo as portas no firewall local (imagens da Oracle vêm travadas)..."
iptables -I INPUT -p udp --dport 3478 -j ACCEPT
iptables -I INPUT -p tcp --dport 3478 -j ACCEPT
iptables -I INPUT -p udp --dport 49152:65535 -j ACCEPT
apt-get install -y -qq iptables-persistent || true
netfilter-persistent save 2>/dev/null || true

echo ">> Conferindo se o coturn subiu..."
sleep 2
systemctl is-active coturn

echo
echo "======================================================================"
echo "  ✅ coturn instalado e rodando!"
echo
echo "  Adiciona estas variáveis no Render (Environment):"
echo
echo "     COTURN_HOST=${IP_PUBLICO}"
echo "     COTURN_SECRET=${SECRET}"
echo
echo "  ⚠️  NÃO ESQUECE: abre também na Security List da Oracle"
echo "     (VCN da instância → Security List → Ingress Rules):"
echo "       - UDP porta 3478   (origem 0.0.0.0/0)"
echo "       - TCP porta 3478   (origem 0.0.0.0/0)"
echo "       - UDP portas 49152-65535 (origem 0.0.0.0/0)"
echo "     Sem isso o firewall da Oracle bloqueia tudo antes de chegar na VM."
echo "======================================================================"
