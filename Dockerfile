FROM ubuntu:20.04

RUN apt-get update
RUN apt install bash-completion

WORKDIR /app
COPY . .

EXPOSE 80

CMD ["echo", "Hello World"]

