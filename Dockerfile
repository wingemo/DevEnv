FROM ubuntu:latest
RUN apt-get update
RUN sudo apt install bash-completion
RUN apt-get install -y nodejs npm
COPY packages.json /packages.json
RUN cat packages.json | jq -r '.packages[]' | xargs -I {} apt-get install -y {}
WORKDIR /app
COPY . .
EXPOSE 80
CMD ["echo", "Hello World"]

