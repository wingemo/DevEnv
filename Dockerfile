FROM ubuntu:latest
RUN apt-get update
RUN sudo apt install bash-completion
RUN apt-get install -y nodejs npm
WORKDIR /app
COPY . .
EXPOSE 80
CMD ["echo", "Hello World"]

