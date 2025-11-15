FROM node:20-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci || npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]