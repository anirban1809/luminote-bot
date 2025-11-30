FROM node:20-bullseye

ENV DEBIAN_FRONTEND=noninteractive

# System deps: X, WM, audio, ffmpeg, fonts, Chromium
RUN apt-get update && \
    apt-get install -y \
    xvfb x11vnc fluxbox \
    pulseaudio pulseaudio-utils \
    ffmpeg \
    fonts-liberation \
    xdg-utils \
    wget gnupg ca-certificates \
    software-properties-common \
    git \
    chromium && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Tell Puppeteer not to download its own (x86) Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV WIDTH=1920
ENV HEIGHT=1080
RUN npm init -y && \
    npm install puppeteer-screen-recorder puppeteer-extra puppeteer-extra-plugin-stealth

COPY entrypoint.sh /entrypoint.sh
COPY record.js /app/record.js

RUN chmod +x /entrypoint.sh

# X display and PulseAudio system socket
ENV DISPLAY=:99
ENV PULSE_SERVER=unix:/var/run/pulse/native

# Shared memory for Chromium
RUN mkdir -p /dev/shm && chmod 1777 /dev/shm

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "/app/record.js", "https://example.com", "/recordings/output.mkv"]
