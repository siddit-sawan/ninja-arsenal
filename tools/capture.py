"""Store art for CrazyGames: three covers and two silent preview videos, rendered from the game itself.

Needs Chrome, ffmpeg and the game served on http://localhost:8010 (python -m http.server 8010).
Run from the repo root:  python tools/capture.py   [covers|landscape|portrait ...]

Each shot opens the game headless with the dev recording switch (&rec, see record() in js/main.js), which steps the
game frame by frame on a virtual clock and posts every frame here; ffmpeg then joins the clips. Output: marketing/.
"""
import http.server, os, shutil, subprocess, sys, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'marketing')
FRAMES = os.path.join(OUT, 'frames')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
GAME = 'http://localhost:8010/'
FPS = 30
done = set()


class Recv(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        parts = self.path.strip('/').split('/')
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if parts[0] == 'f':
            d = os.path.join(FRAMES, parts[1]); os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, '%05d.png' % int(parts[2])), 'wb') as f: f.write(body)
        elif parts[0] == 'done':
            done.add(parts[1])
        self.send_response(200); self._cors(); self.end_headers()

    def log_message(self, *a): pass


def shoot(tag, query, w, h, timeout=1800):
    """Render one clip (or still) into marketing/frames/<tag>/."""
    shutil.rmtree(os.path.join(FRAMES, tag), ignore_errors=True)
    url = f'{GAME}?{query}&rec&tag={tag}&fps={FPS}&size={w}x{h}'   # the game renders exactly w x h (headless windows are capped by the screen)
    prof = os.path.join(FRAMES, '_profile_' + tag)
    p = subprocess.Popen([CHROME, '--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720',
                          '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required', f'--user-data-dir={prof}', url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t = time.time()
    while tag not in done and time.time() - t < timeout and p.poll() is None: time.sleep(0.5)
    p.kill(); p.wait(); shutil.rmtree(prof, ignore_errors=True)
    n = len(os.listdir(os.path.join(FRAMES, tag))) if os.path.isdir(os.path.join(FRAMES, tag)) else 0
    print(f'  {tag}: {n} frames in {time.time() - t:.0f}s' + ('' if tag in done else '  (TIMED OUT)'))
    return os.path.join(FRAMES, tag)


# The shots. Each clip is a few seconds of real gameplay driven by the dev switches (autopilot, test scenes).
CLIPS = [
    ('fight', 'test=play&stage=9&auto&w=katana&warm=2.5&rec=4.5'),                         # katana in a crowd at a stage arena
    ('sky', 'test=storm&air&stage=7&at=3.5&spawn=grunt,runner,samurai,grunt,brute&warm=3.2&rec=3.6'),                              # the Sky Storm, from the jump to the fall
    ('bomb', 'test=play&stage=12&auto&w=horoku&warm=3&rec=3.5'),                             # bombs bursting in a crowd
    ('raid', 'test=explore&map=shrine&at=-54,-44&raid&auto&time=0.47&wx=rain&warm=4&rec=4.5'),  # a bandit raid on a town at dusk, in the rain
]
COVER = 'test=storm&air&stage=5&at=3.5&spawn=samurai,grunt,runner,grunt,brute&warm=4.3&frames=1&notrail&shot=1.6,-0.9,2.4,0,0.25,0&fov=50&light&title'   # Blood Moon: the hero mid Sky Storm, framed from below


def ff(*args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)


def covers():
    for name, w, h in [('cover-landscape-1920x1080', 1920, 1080), ('cover-portrait-800x1200', 800, 1200), ('cover-square-800x800', 800, 800)]:
        d = shoot(name, COVER, w, h)
        shutil.copy(os.path.join(d, '00000.png'), os.path.join(OUT, name + '.png'))


def video(orient):
    w, h = (1920, 1080) if orient == 'landscape' else (1080, 1620)
    parts = []
    # first frame = the static cover (title over the Sky Storm), held half a second
    d = shoot(f'{orient}-cover', COVER, w, h)
    cov = os.path.join(FRAMES, f'{orient}-cover.mp4')
    ff('-loop', '1', '-t', '0.5', '-framerate', str(FPS), '-i', os.path.join(d, '00000.png'), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-r', str(FPS), cov)
    parts.append(cov)
    for tag, q in CLIPS:
        d = shoot(f'{orient}-{tag}', q, w, h)
        m = os.path.join(FRAMES, f'{orient}-{tag}.mp4')
        ff('-framerate', str(FPS), '-i', os.path.join(d, '%05d.png'), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', '-r', str(FPS), m)
        parts.append(m)
    lst = os.path.join(FRAMES, f'{orient}.txt')
    with open(lst, 'w') as f: f.write(''.join(f"file '{p}'\n" for p in parts))
    dst = os.path.join(OUT, f'preview-{orient}-{w}x{h}.mp4')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-an', '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst)
    print(f'  -> {dst} ({os.path.getsize(dst) / 1e6:.1f} MB)')


if __name__ == '__main__':
    os.makedirs(FRAMES, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('localhost', 8011), Recv)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    jobs = sys.argv[1:] or ['covers', 'landscape', 'portrait']
    for j in jobs:
        print(j); covers() if j == 'covers' else video(j)
    srv.shutdown()
