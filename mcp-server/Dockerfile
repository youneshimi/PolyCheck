FROM php:8.2-cli

# Installer les extensions et outils nécessaires
RUN apt-get update && apt-get install -y \
    zip unzip curl git libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Installer Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Installer les dépendances PHP (layer caching)
COPY composer.json .
RUN composer install --no-dev --optimize-autoloader --no-scripts

# Copier le code source
COPY . .

EXPOSE 3002

# Lancer le serveur PHP built-in avec index.php comme router
CMD ["php", "-S", "0.0.0.0:3002", "-t", "public", "public/index.php"]
