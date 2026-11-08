# Serves the Vite build output (dist/apps/frontend, created by the Nx build target) with nginx.
# Built by the Nx image target with the workspace root as context; never builds the app itself.
# Rolling minor tag on purpose: the scheduled rebuild picks up patch and security updates.
FROM docker.io/nginxinc/nginx-unprivileged:1.30-alpine

# Security fixes of Alpine packages often land before a new base image is published; the
# scheduled rebuild picks them up as well.
USER 0
RUN apk upgrade --no-cache

# Templates are rendered by the image entrypoint (envsubst) at container start.
COPY apps/frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY dist/apps/frontend /usr/share/nginx/html

# Backend for /api; override with -e API_URL=... when running the container.
ENV API_URL=http://orders:8080
# Let the entrypoint export the container's DNS resolvers as NGINX_LOCAL_RESOLVERS (used by
# the template to resolve the backend per request).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Same non-root user as the base image (nginx, UID 101), set explicitly.
USER 101

EXPOSE 8080

# For Docker/Compose; Kubernetes uses its own probes (e.g. on /healthz).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
