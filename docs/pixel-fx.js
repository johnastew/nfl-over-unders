// A pixel burst across a card, in the spirit of the ReactBits PixelCard effect: a grid of
// small squares that pop in on staggered random delays, hold, then fade out.

const GAP = 5;
const SIZE = 6;
const STAGGER = 350; // ms window the pixels start within
const GROW = 120; // ms for one pixel to reach full size
const HOLD = 160; // ms at full size before fading
const FADE = 220; // ms to fade out

// Every card keeps at most one burst, so a fast double tap doesn't stack loops.
const running = new WeakMap();

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Three tints of the team's colour, mixed toward white so the burst reads as that team
// rather than a flat block.
function tints(hex) {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const mix = (amount) =>
    `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
  return [mix(0), mix(0.35), mix(0.65)];
}

export function playPixelBurst(card, hex) {
  if (!card || reducedMotion()) return;

  const previous = running.get(card);
  if (previous) {
    cancelAnimationFrame(previous.frame);
    previous.canvas.remove();
  }

  const { width, height } = card.getBoundingClientRect();
  if (!width || !height) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-fx';
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  // A canvas is a replaced element, so inset:0 alone leaves it at its intrinsic (device
  // pixel) size — the CSS box has to be set explicitly.
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  card.appendChild(canvas);

  const palette = tints(hex);
  const step = SIZE + GAP;
  const pixels = [];
  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < height; y += step) {
      pixels.push({
        x,
        y,
        delay: Math.random() * STAGGER,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
  }

  const total = STAGGER + GROW + HOLD + FADE;
  const start = performance.now();

  const state = { canvas, frame: 0 };
  running.set(card, state);

  function draw(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, width, height);

    for (const pixel of pixels) {
      const age = elapsed - pixel.delay;
      if (age <= 0) continue;

      let scale;
      let alpha = 1;
      if (age < GROW) {
        scale = age / GROW;
      } else if (age < GROW + HOLD) {
        scale = 1;
      } else {
        const out = (age - GROW - HOLD) / FADE;
        if (out >= 1) continue;
        scale = 1;
        alpha = 1 - out;
      }

      const side = SIZE * scale;
      const inset = (SIZE - side) / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pixel.color;
      ctx.fillRect(pixel.x + inset, pixel.y + inset, side, side);
    }
    ctx.globalAlpha = 1;

    if (elapsed < total) {
      state.frame = requestAnimationFrame(draw);
    } else {
      canvas.remove();
      running.delete(card);
    }
  }

  state.frame = requestAnimationFrame(draw);
}
