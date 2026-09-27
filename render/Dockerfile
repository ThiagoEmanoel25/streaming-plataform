FROM alpine:3.20
RUN apk add --no-cache ffmpeg python3 font-dejavu
WORKDIR /app
COPY render.py server.py handler.py ./
ENV OUT_DIR=/app/out SOURCE_DIR=/app/sources PORT=9000
RUN mkdir -p /app/out /app/sources
EXPOSE 9000
CMD ["python3", "-u", "server.py"]
