FROM node:20-alpine

WORKDIR /app

COPY package*.json yarn.lock* ./
RUN npm install --production=false

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/server.js"]
