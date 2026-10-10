FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080
ENV PORT=8080

CMD ["npm", "start"]
