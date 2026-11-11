FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api ./api
COPY robo/base ./robo/base
COPY index.html app.js style.css server.js ./
COPY img ./img
ENV TZ=America/Sao_Paulo
EXPOSE 3000
USER node
CMD ["node", "server.js"]
