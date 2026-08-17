#!/usr/bin/env bash
# =====================================================================
# Telinha — expõe o consumo de banda da VM pra página /uso
# (vnstat + mini endpoint HTTP na porta 9091, protegido pelo segredo
#  do coturn). Rodar DEPOIS do setup-coturn.sh, com:
#   sudo bash setup-stats.sh
# =====================================================================
set -euo pipefail

if [ "$(id -u)" != 0 ]; then
  echo "Roda com sudo: sudo bash setup-stats.sh"
  exit 1
fi

SECRET=$(grep '^static-auth-secret=' /etc/turnserver.conf | cut -d= -f2 || true)
if [ -z "${SECRET}" ]; then
  echo "Não achei o segredo do coturn — roda o setup-coturn.sh primeiro."
  exit 1
fi

echo ">> Instalando o vnstat (medidor de tráfego)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq vnstat
systemctl enable --now vnstat

IFACE=$(ip route get 1.1.1.1 | grep -oP 'dev \K\S+')
echo "   interface de rede: ${IFACE}"

echo ">> Criando o endpoint de consumo (porta 9091)..."
cat > /opt/telinha-stats.py << EOF
#!/usr/bin/env python3
# Endpoint de consumo pra página /uso da Telinha (vnstat em JSON).
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

SECRET = "${SECRET}"
IFACE = "${IFACE}"


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if q.get("token", [""])[0] != SECRET:
            self.send_response(401)
            self.end_headers()
            return
        try:
            out = subprocess.check_output(
                ["vnstat", "--json", "d", "35", "-i", IFACE], timeout=10
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(out)
        except Exception:
            self.send_response(500)
            self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(("0.0.0.0", 9091), H).serve_forever()
EOF

cat > /etc/systemd/system/telinha-stats.service << 'EOF'
[Unit]
Description=Telinha stats (consumo de banda via vnstat)
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/telinha-stats.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now telinha-stats

echo ">> Abrindo a porta 9091 no firewall local..."
iptables -I INPUT -p tcp --dport 9091 -j ACCEPT
netfilter-persistent save 2>/dev/null || true

sleep 1
systemctl is-active telinha-stats

echo
echo "======================================================================"
echo "  ✅ Endpoint de consumo rodando na porta 9091!"
echo
echo "  ⚠️  Falta abrir na Security List da Oracle (mesmo lugar das outras):"
echo "       - TCP porta 9091 (origem 0.0.0.0/0)"
echo
echo "  Nada pra configurar no Render — o servidor da Telinha já usa o"
echo "  COTURN_HOST e o COTURN_SECRET que você cadastrou."
echo "======================================================================"
