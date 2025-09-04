FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3200

CMD ["npm", "start"]