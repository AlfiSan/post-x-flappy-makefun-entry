// render-flappy.js — renders FLAPPY MAKEFUN gameplay frames as raw RGB24 video
// (1080x1920, 30 fps) to stdout, for ffmpeg to encode. Pure Node, no deps.
// Simulates real flappy physics with a simple autopilot so the bird survives
// and scores. Usage:
//   node render-flappy.js | ffmpeg -f rawvideo -pix_fmt rgb24 -s 1080x1920 -r 30 -i - ...
//   SIM_ONLY=1 node render-flappy.js   # run the sim only, print score/events
const W = 1080, H = 1920, FPS = 30, DUR = 21.5;
const FRAMES = Math.round(DUR * FPS);
const GROUND_Y = 1780;
const BIRD_X = 300, BIRD_R = 44;
const GRAV = 2400, FLAP_VY = -760, PIPE_SPEED = 215, PIPE_W = 140, GAP = 430;
const SPAWN_EVERY = 2.3, FIRST_PIPE_AT = 0.6;

// Seeded RNG so the run is deterministic.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(7);

// --- pixel helpers -----------------------------------------------------------
const rowCache = new Map();
function rowBuf(w, r, g, b) {
  const key = w + ',' + r + ',' + g + ',' + b;
  let row = rowCache.get(key);
  if (!row) {
    row = Buffer.alloc(w * 3);
    for (let i = 0; i < w; i++) { row[i * 3] = r; row[i * 3 + 1] = g; row[i * 3 + 2] = b; }
    rowCache.set(key, row);
  }
  return row;
}
function fillRect(buf, x, y, w, h, c) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(w, W - x); h = Math.min(h, H - y);
  if (w <= 0 || h <= 0) return;
  const row = rowBuf(w, c[0], c[1], c[2]);
  for (let j = 0; j < h; j++) row.copy(buf, (y + j) * W * 3 + x * 3);
}
function fillCircle(buf, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    fillRect(buf, cx - half, cy + dy, half * 2 + 1, 1, c);
  }
}

// --- colours -----------------------------------------------------------------
const SKY_TOP = [95, 178, 240], SKY_BOT = [207, 238, 255];
const GRASS = [88, 179, 104], DIRT = [217, 179, 128], DIRT_DARK = [190, 150, 100];
const PIPE = [76, 175, 80], PIPE_DARK = [46, 125, 50], PIPE_LIGHT = [129, 199, 132];
const MAGENTA = [196, 28, 131], MAGENTA_DARK = [163, 18, 107];
const WHITE = [255, 255, 255], INK = [25, 20, 25], BEAK = [255, 159, 28];

// --- static background (sky gradient + clouds + ground base) -----------------
const bg = Buffer.alloc(W * H * 3);
for (let y = 0; y < GROUND_Y; y++) {
  const t = y / GROUND_Y;
  const r = Math.round(SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * t);
  const g = Math.round(SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * t);
  const b = Math.round(SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * t);
  const row = rowBuf(W, r, g, b);
  row.copy(bg, y * W * 3);
}
// clouds (soft white ellipses)
const clouds = [[180, 260, 150, 46], [760, 420, 190, 54], [420, 700, 170, 48], [880, 950, 160, 46], [140, 1150, 180, 52], [640, 1420, 170, 48]];
for (const [cx, cy, rx, ry] of clouds) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    fillRect(bg, cx - half, cy + dy, half * 2 + 1, 1, [255, 255, 255]);
  }
}
fillRect(bg, 0, GROUND_Y, W, 46, GRASS);
fillRect(bg, 0, GROUND_Y + 46, W, H - GROUND_Y - 46, DIRT);

// --- pixel font (3x5) for the score ------------------------------------------
const FONT = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
};
function drawScore(buf, score) {
  const s = String(score), cell = 16, dw = 3 * cell, dh = 5 * cell, gapX = 14;
  const totalW = s.length * dw + (s.length - 1) * gapX;
  let x0 = Math.round((W - totalW) / 2), y0 = 110;
  for (const ch of s) {
    const glyph = FONT[ch];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (glyph[r][c] === '1') {
        // dark outline then white face
        fillRect(buf, x0 + c * cell - 3, y0 + r * cell - 3, cell + 6, cell + 6, INK);
        fillRect(buf, x0 + c * cell, y0 + r * cell, cell, cell, WHITE);
      }
    }
    x0 += dw + gapX;
  }
}

// --- simulation ---------------------------------------------------------------
const SIM_ONLY = process.env.SIM_ONLY === '1';
const dt = 1 / 120; // physics substep
let birdY = 900, birdVy = 0, score = 0, dead = false, deadAt = null;
let pipes = []; // {x, gapY, counted}
let nextSpawn = FIRST_PIPE_AT;
const scoreTimes = [];
const flapTimes = [];
let simT = 0;

function step() {
  simT += dt;
  if (simT >= nextSpawn) {
    const gapY = 520 + rand() * 780;
    pipes.push({ x: 1180, gapY, counted: false });
    nextSpawn += SPAWN_EVERY;
  }
  for (const p of pipes) p.x -= PIPE_SPEED * dt;
  pipes = pipes.filter(p => p.x > -220);
  // autopilot: flap when below the next gap centre and falling / too slow
  const next = pipes.find(p => p.x + PIPE_W > BIRD_X - BIRD_R);
  if (!dead && next) {
    const gapC = next.gapY;
    if ((birdY > gapC + 20 && birdVy > -120) || birdY > GROUND_Y - BIRD_R - 90) {
      birdVy = FLAP_VY;
      flapTimes.push(+simT.toFixed(2));
    }
  }
  birdVy += GRAV * dt;
  birdY += birdVy * dt;
  // score
  for (const p of pipes) {
    if (!p.counted && p.x + PIPE_W < BIRD_X - BIRD_R) { p.counted = true; score++; scoreTimes.push(+simT.toFixed(2)); }
  }
  // collisions
  if (!dead) {
    if (birdY + BIRD_R >= GROUND_Y || birdY - BIRD_R <= 0) { dead = true; deadAt = +simT.toFixed(2); }
    for (const p of pipes) {
      const gapTop = p.gapY - GAP / 2, gapBot = p.gapY + GAP / 2;
      if (BIRD_X + BIRD_R > p.x && BIRD_X - BIRD_R < p.x + PIPE_W) {
        if (birdY - BIRD_R < gapTop || birdY + BIRD_R > gapBot) { dead = true; deadAt = +simT.toFixed(2); }
      }
    }
  }
  if (dead) { birdVy = 0; } // freeze on death so the video keeps a clean frame
}

function drawFrame(buf, t) {
  bg.copy(buf);
  // scrolling ground dashes
  const off = Math.floor((t * PIPE_SPEED) % 120);
  for (let x = -off; x < W; x += 120) fillRect(buf, x, GROUND_Y + 80, 60, 26, DIRT_DARK);
  // pipes
  for (const p of pipes) {
    const gapTop = p.gapY - GAP / 2, gapBot = p.gapY + GAP / 2;
    // top pipe
    fillRect(buf, p.x, -4, PIPE_W, gapTop + 4, PIPE);
    fillRect(buf, p.x, -4, 10, gapTop + 4, PIPE_LIGHT);
    fillRect(buf, p.x + PIPE_W - 10, -4, 10, gapTop + 4, PIPE_DARK);
    fillRect(buf, p.x - 10, gapTop - 64, PIPE_W + 20, 64, PIPE);
    fillRect(buf, p.x - 10, gapTop - 64, 12, 64, PIPE_LIGHT);
    fillRect(buf, p.x + PIPE_W - 2, gapTop - 64, 12, 64, PIPE_DARK);
    // bottom pipe
    fillRect(buf, p.x, gapBot, PIPE_W, GROUND_Y - gapBot, PIPE);
    fillRect(buf, p.x, gapBot, 10, GROUND_Y - gapBot, PIPE_LIGHT);
    fillRect(buf, p.x + PIPE_W - 10, gapBot, 10, GROUND_Y - gapBot, PIPE_DARK);
    fillRect(buf, p.x - 10, gapBot, PIPE_W + 20, 64, PIPE);
    fillRect(buf, p.x - 10, gapBot, 12, 64, PIPE_LIGHT);
    fillRect(buf, p.x + PIPE_W - 2, gapBot, 12, 64, PIPE_DARK);
  }
  // bird (magenta disc, white belly, eye, beak, flapping wing)
  const wingUp = Math.sin(t * 18) > 0;
  fillCircle(buf, BIRD_X, Math.round(birdY), BIRD_R, MAGENTA);
  fillCircle(buf, BIRD_X - 4, Math.round(birdY) + 16, 26, WHITE); // belly
  fillCircle(buf, BIRD_X + 14, Math.round(birdY) - 16, 15, WHITE); // eye
  fillCircle(buf, BIRD_X + 19, Math.round(birdY) - 16, 7, INK); // pupil
  fillRect(buf, BIRD_X + BIRD_R - 8, Math.round(birdY) - 4, 26, 12, BEAK); // beak
  fillCircle(buf, BIRD_X - 26, Math.round(birdY) + (wingUp ? -14 : 6), 17, MAGENTA_DARK); // wing
  drawScore(buf, score);
}

// --- run ----------------------------------------------------------------------
const frame = Buffer.alloc(W * H * 3);
const stepsPerFrame = Math.round(1 / FPS / dt);
for (let f = 0; f < FRAMES; f++) {
  for (let s = 0; s < stepsPerFrame; s++) step();
  if (SIM_ONLY) continue;
  drawFrame(frame, f / FPS);
  // Copy: stdout.write queues Buffer references, and `frame` is mutated for
  // the next frame before the queue flushes — without the copy every frame
  // in the video would be the last one.
  process.stdout.write(Buffer.from(frame));
}
console.error(JSON.stringify({ score, dead, deadAt, scoreTimes, flapCount: flapTimes.length }));
if (SIM_ONLY) console.error('SIM_ONLY done');
