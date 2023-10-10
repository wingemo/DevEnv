#
# Development Environment - Ubuntu & NodeJS
# @version 20.18
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

#
# Set alias 
#
alias install='npm install'

#
# Expose port 8080
#
EXPOSE 8080

#
# Set the working directory 
#
WORKDIR /app

#
# Copy the contents of the current directory
#
COPY . .

CMD ["echo", "DevEnv - Ubuntu & NodeJS"]

