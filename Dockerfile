FROM ubuntu:latest
RUN apt-get update 
RUN apt-get install -y nodejs npm
WORKDIR /app
COPY . .
EXPOSE 80
CMD ["echo", "Hello World"]

