# DevEnv
Version control of installed tools is a fundamental practice to establish self-contained and replicable development environments. It provides isolated and reproducible environments for your projects, enabling seamless migration of your entire setup across different machines while maintaining consistent configurations throughout all environments

| Tool          | Description                       |
| ------------- | --------------------------------- |
| Node.js       | Server-side JavaScript runtime    |
| swagger-codegen     | Web application framework for Node.js |


# DevEnv Docker Container

This Docker container is designed to set up a development environment for your project. It includes the necessary tools and dependencies for development work.

## Building the Docker Image

To build the Docker image, use the following command:

```bash
docker build -t DevEnv .
```

# Running the Docker Container

To run the Docker container, use the following command:

```sh
docker run -d -p 80:80 -v C:\absolut\path\till\din\kod:/app DevEnv
```

