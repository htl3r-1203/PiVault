# ---- Build-Phase: Vue 3 + TypeScript mit Vite bauen ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Laufzeit-Phase: Apache liefert die gebauten Dateien aus ----
FROM httpd:2.4-alpine
COPY apache.conf /usr/local/apache2/conf/extra/pivault.conf
# Benötigte Module aktivieren und PiVault-Konfiguration einbinden
RUN sed -i \
      -e 's/^#\(LoadModule proxy_module\)/\1/' \
      -e 's/^#\(LoadModule proxy_http_module\)/\1/' \
      -e 's/^#\(LoadModule rewrite_module\)/\1/' \
      -e 's/^#\(LoadModule headers_module\)/\1/' \
      /usr/local/apache2/conf/httpd.conf \
 && echo 'Include conf/extra/pivault.conf' >> /usr/local/apache2/conf/httpd.conf
COPY --from=build /app/dist/ /usr/local/apache2/htdocs/
EXPOSE 80
