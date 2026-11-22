"""Private fixed-profile adapter. No source URLs, shell commands or arbitrary filters."""
import base64
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import urlopen

ROOT = Path('/work')
MAX_INPUT = 12 * 1024 * 1024
MAX_OUTPUT = 5 * 1024 * 1024
PROFILES = {'thumb': (160, 84), 'card': (720, 86), 'display': (1600, 92)}


def command(args):
    # No shell, protocols limited on file inputs, single encoder thread, finite time.
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '1'] + args,
                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=40, check=True)


def image_outputs():
    outputs = []
    for profile, (width, quality) in PROFILES.items():
        with urlopen(f'http://127.0.0.1:8081/insecure/rs:fit:{width}:0:0/q:{quality}/plain/local:///input@webp', timeout=45) as response:
            content = response.read(MAX_OUTPUT + 1)
        if len(content) > MAX_OUTPUT:
            raise ValueError('Output limit')
        outputs.append({'profile': profile, 'data': base64.b64encode(content).decode('ascii')})
    return outputs


def video_outputs():
    # Deterministic generated content: no MLS virtual tours are fetched or reencoded.
    command(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=15', '-t', '3', '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', str(ROOT / 'source.mp4')])
    command(['-protocol_whitelist', 'file', '-i', str(ROOT / 'source.mp4'), '-frames:v', '1', '-c:v', 'libwebp', '-threads', '1', '-quality', '86', str(ROOT / 'poster.webp')])
    command(['-protocol_whitelist', 'file', '-i', str(ROOT / 'source.mp4'), '-t', '3', '-an', '-vf', 'scale=480:-2', '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(ROOT / 'preview.mp4')])
    command(['-protocol_whitelist', 'file', '-i', str(ROOT / 'preview.mp4'), '-c', 'copy', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', str(ROOT / 'segment%d.ts'), str(ROOT / 'playlist.m3u8')])
    playlist = ROOT / 'playlist.m3u8'
    playlist.write_text(playlist.read_text().replace('segment0.ts', 'segment'))
    outputs = []
    for profile, name in {'poster': 'poster.webp', 'preview': 'preview.mp4', 'playlist': 'playlist.m3u8', 'segment': 'segment0.ts'}.items():
        path = ROOT / name
        if path.stat().st_size > MAX_OUTPUT:
            raise ValueError('Output limit')
        outputs.append({'profile': profile, 'data': base64.b64encode(path.read_bytes()).decode('ascii')})
    return outputs


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log MLS bytes, URLs or source metadata.

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/health':
            return self.reply(404, {'error': 'Not found'})
        try:
            with urlopen('http://127.0.0.1:8081/health', timeout=1) as response:
                return self.reply(200 if response.status == 200 else 503, {'ready': response.status == 200})
        except Exception:
            return self.reply(503, {'ready': False})

    def do_POST(self):
        started = time.monotonic()
        try:
            if self.path == '/image':
                length = int(self.headers.get('Content-Length', '0'))
                if length < 1 or length > MAX_INPUT or self.headers.get('Transfer-Encoding'):
                    return self.reply(413, {'error': 'Invalid input size'})
                self.connection.settimeout(10)
                content = self.rfile.read(length)
                if len(content) != length:
                    raise ValueError('Incomplete input')
                (ROOT / 'input').write_bytes(content)
                outputs = image_outputs()
            elif self.path == '/video':
                outputs = video_outputs()
            else:
                return self.reply(404, {'error': 'Not found'})
            return self.reply(200, {'outputs': outputs, 'timings': {'nativeMs': round((time.monotonic() - started) * 1000)}})
        except Exception:
            return self.reply(422, {'error': 'Processing failed'})
        finally:
            for path in ROOT.iterdir():
                if path.is_file():
                    path.unlink(missing_ok=True)


if __name__ == '__main__':
    # Independent wall-clock stop even if the Worker disconnects or an alarm is delayed.
    watchdog = threading.Timer(180, lambda: os._exit(0))
    watchdog.daemon = True
    watchdog.start()
    subprocess.Popen(['imgproxy'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
