#!/bin/bash
set -e

echo "============================================"
echo "Pimcore Docker Entrypoint"
echo "============================================"

cd /var/www/html

# Create database configuration
DB_HOST_VAL=${DB_HOST:-mariadb}
DB_PORT_VAL=${DB_PORT:-3306}
DB_USER_VAL=${DB_USER:-pimcore}
DB_PASSWORD_VAL=${DB_PASSWORD:-pimcore}
DB_NAME_VAL=${DB_NAME:-pimcore}

echo "Creating database configuration..."
cat > /var/www/html/.env.local << ENVEOF
DATABASE_URL=mysql://${DB_USER_VAL}:${DB_PASSWORD_VAL}@${DB_HOST_VAL}:${DB_PORT_VAL}/${DB_NAME_VAL}
ENVEOF

# Wait for MariaDB
echo "Waiting for MariaDB at ${DB_HOST_VAL}:${DB_PORT_VAL}..."
timeout=120
counter=0
while ! nc -z ${DB_HOST_VAL} ${DB_PORT_VAL} 2>/dev/null; do
    counter=$((counter+1))
    if [ $counter -ge $timeout ]; then
        echo "ERROR: MariaDB not ready after ${timeout} seconds"
        exit 1
    fi
    sleep 1
done
echo "MariaDB is ready!"

# Check if Pimcore is already installed
if [ ! -f /var/www/html/var/.installed ]; then
    echo "First run - Installing Pimcore..."
    
    # Run Pimcore installer
    ./vendor/bin/pimcore-install \
        --admin-username=${PIMCORE_ADMIN_USER:-admin} \
        --admin-password=${PIMCORE_ADMIN_PASSWORD:-admin} \
        --mysql-host-socket=${DB_HOST_VAL} \
        --mysql-port=${DB_PORT_VAL} \
        --mysql-username=${DB_USER_VAL} \
        --mysql-password=${DB_PASSWORD_VAL} \
        --mysql-database=${DB_NAME_VAL} \
        --no-interaction
    
    # Clear cache
    php bin/console cache:clear || true
    
    # Mark as installed
    touch /var/www/html/var/.installed
    
    echo "Pimcore installation complete!"
else
    echo "Pimcore already installed, running migrations..."
    php bin/console doctrine:migrations:migrate --no-interaction 2>/dev/null || true
fi

# Fix permissions
chown -R www-data:www-data /var/www/html/var /var/www/html/public/var 2>/dev/null || true

# Create php-fpm socket directory
mkdir -p /run/php
chown www-data:www-data /run/php

# Create supervisor log directory
mkdir -p /var/log/supervisor

# Configure PHP-FPM environment (critical for database connectivity)
echo "Configuring PHP-FPM environment..."
cat > /usr/local/etc/php-fpm.d/zz-env.conf << FPMEOF
[www]
clear_env = no
env[DATABASE_URL] = ${DATABASE_URL:-mysql://${DB_USER_VAL}:${DB_PASSWORD_VAL}@${DB_HOST_VAL}:${DB_PORT_VAL}/${DB_NAME_VAL}}
env[APP_ENV] = ${APP_ENV:-dev}
env[REDIS_URL] = ${REDIS_URL:-redis://redis:6379}
FPMEOF

# Clear Symfony cache to use new env
rm -rf /var/www/html/var/cache/* 2>/dev/null || true

echo "============================================"
echo "Starting Pimcore services..."
echo "============================================"

exec "$@"
