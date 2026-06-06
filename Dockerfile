FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "dashboard"]
