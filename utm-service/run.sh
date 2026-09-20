#!/bin/sh
# 一条命令完成镜像构建与服务启动：./run.sh
set -e
IMAGE=utm-service:latest
PORT="${PORT:-3000}"

echo ">> 构建镜像 ${IMAGE}"
docker build -t "${IMAGE}" .

echo ">> 启动服务，监听 0.0.0.0:${PORT}"
exec docker run --rm -p "${PORT}:3000" "${IMAGE}"
