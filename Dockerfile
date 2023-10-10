#
# Development Environment Ubuntu - NodeJS
# @author Philip Wingemo 
#
FROM ubuntu:20.04

#
# Update the system 
#
RUN apt-get update

#
# Install packages
#
RUN apt install nodejs=18
RUN apt install npm=10.2.0

# Expose port 80
EXPOSE 80

WORKDIR /app
COPY . .

CMD ["echo", "Hello World"]

