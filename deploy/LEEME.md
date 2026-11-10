# Despliegue en el servidor (Hetzner · `ssh hetzner`)

Mismo patrón que el resto de webs del servidor (p. ej. raquel.eulogioqt.com):

| Qué | Dónde |
|---|---|
| Código (clon del repo) | `/opt/github/salud` (eulogioqt:api) |
| Runtime | `/srv/salud/app` → `/opt/github/salud/app` |
| Datos (una BD por persona, fotos y copias) | `/srv/salud/private/usuarios/<usuario>/` |
| Cuentas y sesiones | `/srv/salud/private/usuarios.json`, `sesiones.json` |
| Servicio | `salud.service` · usuario `eulogioqt` · `127.0.0.1:7670` (no expuesto) |
| Web | nginx `sites-available/salud.eulogioqt.com` → HTTPS (Let's Encrypt, webroot `/var/www/letsencrypt`) |
| Atajo CLI | `/usr/local/bin/salud` |

Lo único público es `https://salud.eulogioqt.com` (web + `/api/…` + conector `/mcp`). Todo `/api/` y `/mcp` exigen sesión o token, salvo `/api/login`, `/api/cuentas` (nombres para la pantalla de entrada) y el OAuth del conector (`/.well-known/oauth-*`, `/oauth/register`, `/oauth/authorize` —pide sesión—, `/oauth/token`). Los clientes OAuth registrados se guardan en `/srv/salud/private/oauth_clientes.json`.

## Actualizar
Claude empuja el código al clon del servidor (`git push hetzner main`, con `receive.denyCurrentBranch=updateInstead`) y ejecuta `bash /opt/github/salud/deploy/instalar.sh`.

## Cuentas
```
salud usuario-crear eulogio --nombre Eulogio --sexo H --nacimiento AAAA-MM-DD --altura 180
salud usuario-crear raquel --nombre Raquel --sexo M --nacimiento AAAA-MM-DD --altura 170
salud usuario-password raquel      # cambiar contraseña
salud usuario-token eulogio        # token de API para Claude/scripts
sudo systemctl restart salud
```

## Operar
`salud --usuario eulogio hoy` (mismos comandos que la CLI local).
