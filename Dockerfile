#
# Development Environment Ubuntu 
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
RUN apt install bash-completion

# Expose port 80
EXPOSE 80

WORKDIR /app
COPY . .

CMD ["echo", "Hello World"]

