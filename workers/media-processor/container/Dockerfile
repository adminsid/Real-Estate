FROM ghcr.io/imgproxy/imgproxy:v3.31.0@sha256:6db046632f568931e165d61ce289382804f7bbce5b791db6fb6b8d4ace507378
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg && rm -rf /var/lib/apt/lists/* \
    && mkdir /work && chown 999:999 /work
COPY server.py /opt/media/server.py
ENV IMGPROXY_BIND=127.0.0.1:8081 IMGPROXY_LOCAL_FILESYSTEM_ROOT=/work IMGPROXY_ALLOWED_SOURCES=local:/// \
    IMGPROXY_CONCURRENCY=1 IMGPROXY_MAX_SRC_RESOLUTION=30 IMGPROXY_MAX_SRC_FILE_SIZE=12582912 \
    IMGPROXY_MAX_ANIMATION_FRAMES=1 IMGPROXY_TIMEOUT=45 IMGPROXY_WEBP_EFFORT=3 VIPS_CONCURRENCY=1
USER 999:999
WORKDIR /work
EXPOSE 8080
ENTRYPOINT ["python3", "-u", "/opt/media/server.py"]
