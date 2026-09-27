FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# só o app: Dockerfile, nginx.conf e tests/ ficam de fora da pasta servida
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/  /usr/share/nginx/html/js/
