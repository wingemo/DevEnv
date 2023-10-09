# DevEnv
Version control of installed tools is a fundamental practice to establish self-contained and replicable development environments. It provides isolated and reproducible environments for your projects, enabling seamless migration of your entire setup across different machines while maintaining consistent configurations throughout all environments

```sh
docker build -t DevEnv .
```

```sh
docker run -d -p 80:80 -v C:\absolut\path\till\din\kod:/app DevEnv
```

