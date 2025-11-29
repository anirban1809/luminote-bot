#!/usr/bin/env bash
set -e

# Defaults if not set
WIDTH=${WIDTH:-1920}
HEIGHT=${HEIGHT:-1080}

# Start virtual X server with the same size
Xvfb :99 -screen 0 ${WIDTH}x${HEIGHT}x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Start lightweight WM
fluxbox >/tmp/fluxbox.log 2>&1 &
FLUX_PID=$!

# PulseAudio setup (same as we just had)
export XDG_RUNTIME_DIR=/tmp/pulse-runtime
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

echo "Starting PulseAudio..."
pulseaudio -D --exit-idle-time=-1 --log-target=stderr || echo "Pulseaudio start failed"

PULSE_SOCKET="$XDG_RUNTIME_DIR/pulse/native"
for i in $(seq 1 10); do
  if [ -S "$PULSE_SOCKET" ]; then
    echo "PulseAudio socket is up at $PULSE_SOCKET"
    break
  fi
  echo "Waiting for PulseAudio socket..."
  sleep 1
done

export PULSE_SERVER="unix:$PULSE_SOCKET"

pactl load-module module-null-sink sink_name=record_sink sink_properties=device.description=record_sink || echo "Failed to load null sink"
pactl set-default-sink record_sink || echo "Failed to set default sink"

sleep 1

exec "$@"

kill $XVFB_PID $FLUX_PID || true
