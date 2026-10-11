#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/root/apps/healthy-island-api}"
ARCHIVE="${ARCHIVE:-/tmp/healthy-island-api-deploy.tgz}"

mkdir -p "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "missing $APP_DIR/.env" >&2
  exit 1
fi

python3 - << 'PY'
import sys
from pathlib import Path
from urllib.parse import quote

def read_env(path):
    values = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values

values = read_env('.env')
user = values.get('MYSQL_USER') or 'island'
database = values.get('MYSQL_DATABASE') or 'healthy_island'
password = values.get('MYSQL_PASSWORD', '')
if not password or not values.get('MYSQL_ROOT_PASSWORD') or not values.get('API_IMAGE'):
    sys.exit('MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD and API_IMAGE are required')
url = f"mysql://{quote(user)}:{quote(password)}@mysql:3306/{quote(database)}"
path = Path('.env')
lines = [line for line in path.read_text().splitlines() if not line.startswith('DATABASE_URL=')]
lines.append(f'DATABASE_URL={url}')
path.write_text('\n'.join(lines) + '\n')
PY

docker compose pull api
docker compose up -d

cid="$(docker compose ps -q api)"
docker exec "$cid" ./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma

docker compose ps
