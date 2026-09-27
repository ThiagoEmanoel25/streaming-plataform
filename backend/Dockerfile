# API de desenvolvimento: o mesmo Worker de src/, servido por Node (sem dependências).
# Produção continua sendo `wrangler deploy` na Cloudflare.
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown -R node:node /data
USER node
ENV PORT=8787 DB_FILE=/data/homecreators.db
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dev/server.mjs"]
