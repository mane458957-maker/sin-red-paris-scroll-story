const $ = (selector) => document.querySelector(selector);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const story = $('.story');
const frame = $('#photo-frame');
const front = $('#cap-front');
const back = $('#cap-back');
const logo = $('#hero-signature');
const logoLetters = [...logo.querySelectorAll('span')];
const tab = $('#tab-flight');
const wash = $('#color-wash');
const colorA = $('#cap-color-a');
const colorB = $('#cap-color-b');
const palette = [...$('#palette').children];
const label = $('#color-label');
const index = $('#stage-index');
const cue = $('#scroll-label');
const progress = $('#scroll-progress');

// Preserve the photographed red weave and buckle as the logo's falling tab.
const source = new Image();
source.src = 'assets/sin-tab-source.jpg';
source.onload = () => {
  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const redThread = r > g * 1.20 && r > b * 1.12 && r - g > 20;
    const hardware = r < 76 && g < 76 && b < 80;
    data[i + 3] = redThread || hardware ? 255 : 0;
  }
  context.putImageData(pixels, 0, 0);
  tab.src = canvas.toDataURL('image/png');
};

const colors = [
  { name: 'BLANC', src: 'assets/sin-cap-front.jpg' },
  { name: 'GRIS', src: 'assets/colors/sin-grey.jpg' },
  { name: 'BLEU', src: 'assets/colors/sin-blue.jpg' },
  { name: 'ROSE', src: 'assets/colors/sin-pink.jpg' },
  { name: 'NUDE ROSE', src: 'assets/colors/sin-nude-rose.jpg' },
  { name: 'ORANGE', src: 'assets/colors/sin-orange.jpg' },
  { name: 'BORDEAUX', src: 'assets/colors/sin-bordeaux.jpg' },
  { name: 'ROUGE', src: 'assets/colors/sin-red.jpg' },
  { name: 'NOIR', src: 'assets/colors/sin-black.jpg' },
  { name: 'VERT', src: 'assets/colors/sin-green.jpg' },
  { name: 'MARRON', src: 'assets/colors/sin-brown.jpg' },
];
let loadedPair = '';
let scheduled = false;
let lastProgress = -1;
function draw() {
  scheduled = false;
  if (!story) return;
  const rect = story.getBoundingClientRect();
  const scrollable = Math.max(1, story.offsetHeight - innerHeight);
  const p = clamp(-rect.top / scrollable);
  if (Math.abs(p - lastProgress) < 0.001) return;
  lastProgress = p;

  const turn = smooth(0.13, 0.47, p);
  const reveal = smooth(0.30, 0.48, p);
  const logoDrop = smooth(0.10, 0.35, p);
  const tabIn = smooth(0.23, 0.42, p);
  const colorsIn = smooth(0.54, 0.62, p);
  const colorsOut = 1 - smooth(0.94, 0.995, p);

  front.style.opacity = String((1 - reveal) * (1 - colorsIn));
  front.style.transform = `rotateY(${-turn * 74}deg) scale(${1 - turn * 0.04})`;
  back.style.opacity = String(reveal * (1 - colorsIn));
  back.style.transform = `rotateY(${(1 - turn) * 74}deg) scale(${0.96 + turn * 0.04})`;
  frame.style.transform = `translate(-50%,-50%) translateY(${Math.sin(p * Math.PI) * -12}px) scale(${1 + turn * 0.025})`;

  logo.style.opacity = String(1 - smooth(0.19, 0.35, p));
  logo.style.transform = `translateX(-50%) translateY(${logoDrop * 92}px) scaleY(${1 - logoDrop * 0.72})`;
  logoLetters.forEach((letter, i) => {
    const drift = (i - 1) * 16;
    letter.style.transform = `translate(${drift * logoDrop}px,${logoDrop * (i === 1 ? 5 : -2)}px) scaleX(${1 - logoDrop * 0.18})`;
  });

  tab.style.opacity = String(tabIn * (p < 0.48 ? 1 : 0));
  tab.style.transform = `translateY(${(1 - tabIn) * -44}vh) rotate(${(1 - tabIn) * -7}deg)`;
  tab.style.filter = `drop-shadow(0 ${6 + tabIn * 3}px ${7 + tabIn * 2}px #15141225)`;

  const colorPosition = clamp((p - 0.61) / 0.31) * (colors.length - 1);
  const current = Math.floor(colorPosition);
  const next = Math.min(current + 1, colors.length - 1);
  const blend = colorPosition - current;
  const pairKey = `${current}:${next}`;
  if (pairKey !== loadedPair) {
    loadedPair = pairKey;
    colorA.src = colors[current].src;
    colorB.src = colors[next].src;
  }
  const colorFade = colorsIn * colorsOut;
  colorA.style.opacity = String(colorFade * (1 - blend));
  colorB.style.opacity = String(colorFade * blend);
  wash.style.opacity = '0';

  const selected = Math.round(colorPosition);
  palette.forEach((dot, i) => dot.classList.toggle('active', i === selected));
  label.textContent = `${colors[selected].name} · ${String(selected + 1).padStart(2, '0')} / ${colors.length}`;
  label.style.opacity = String(colorFade);
  $('#palette').style.opacity = String(colorFade);
  cue.style.opacity = String(1 - smooth(0.55, 0.69, p));
  index.textContent = `SIN RED PARIS · ${String(Math.min(5, Math.floor(p * 5) + 1)).padStart(2, '0')} / 05`;
  progress.style.transform = `scaleX(${p})`;
}
function requestDraw() {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(draw);
  }
}
addEventListener('scroll', requestDraw, { passive: true });
addEventListener('resize', requestDraw);
requestDraw();
