#!/usr/bin/env bash
# Instala/actualiza Salud siguiendo el patrón del servidor (ejecutar como eulogioqt, con sudo):
#   código     /opt/github/salud          (clon del repo, grupo api)
#   runtime    /srv/salud/app -> /opt/github/salud/app, datos en /srv/salud/private
#   servicio   salud.service (usuario eulogioqt, 127.0.0.1:7670)
#   web        /etc/nginx/sites-available/salud.eulogioqt.com (ACME webroot + HTTPS)
set -euo pipefail
REPO=/opt/github/salud
SRV=/srv/salud
DOM=salud.eulogioqt.com

[ -d "$REPO/app" ] || { echo "Falta el código en $REPO"; exit 1; }
sudo install -d -o eulogioqt -g eulogioqt -m 755 "$SRV"
sudo install -d -o eulogioqt -g eulogioqt -m 750 "$SRV/private"
ln -sfn "$REPO/app" "$SRV/app"

sudo install -m 644 "$REPO/deploy/salud.service" /etc/systemd/system/salud.service
sudo install -m 755 "$REPO/deploy/salud" /usr/local/bin/salud
sudo systemctl daemon-reload
sudo systemctl enable -q salud

if sudo test -f /etc/letsencrypt/live/$DOM/fullchain.pem; then
  sudo install -m 644 "$REPO/deploy/$DOM.conf" /etc/nginx/sites-available/$DOM
else
  # aún sin certificado: solo el bloque HTTP (ACME) para poder pedirlo
  sudo sh -c "sed -n '1,/^}/p' '$REPO/deploy/$DOM.conf' > /etc/nginx/sites-available/$DOM"
  echo ">>> Sin certificado: sudo certbot certonly --webroot -w /var/www/letsencrypt -d $DOM  y vuelve a ejecutar este script"
fi
sudo ln -sfn /etc/nginx/sites-available/$DOM /etc/nginx/sites-enabled/$DOM
sudo nginx -t -q && sudo systemctl reload nginx

if [ -f "$SRV/private/usuarios.json" ]; then sudo systemctl restart salud; else echo ">>> Crea las cuentas con: salud usuario-crear <usuario>"; fi
echo "Hecho."
