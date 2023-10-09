FROM ubuntu:latest
RUN apt-get update && apt-get install -y nodejs npm
RUN npm install -g nodemon
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 80
CMD ["nodemon", "your-server-file.js"]

