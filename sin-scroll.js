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
const gallery = $('#color-gallery');
const palette = [...$('#palette').children];
const label = $('#color-label');
const index = $('#stage-index');
const cue = $('#scroll-label');
const progress = $('#scroll-progress');

// Cut the red woven strap directly from the supplied high resolution photo.
// Canvas preserves the photographed weave and drops only the pale background.
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
  { name: 'BLANC', hex: '#f3f1ed' },
  { name: 'GRIS', hex: '#85888d' },
  { name: 'BLEU', hex: '#1947b8' },
  { name: 'ROSE', hex: '#e6a8b8' },
  { name: 'ORANGE', hex: '#ef6228' },
  { name: 'BORDEAUX', hex: '#68152d' },
];

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
  const colorsIn = smooth(0.52, 0.64, p);
  const colorsOut = 1 - smooth(0.90, 0.99, p);

  front.style.opacity = String(1 - reveal);
  front.style.transform = `rotateY(${-turn * 74}deg) scale(${1 - turn * 0.04})`;
  back.style.opacity = String(reveal);
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

  const colorIndex = clamp((p - 0.56) / 0.30) * (colors.length - 1);
  const left = Math.floor(colorIndex);
  const mix = colorIndex - left;
  const currentColor = colors[Math.min(left, colors.length - 1)];
  const nextColor = colors[Math.min(left + 1, colors.length - 1)];
  // A tint on the cap silhouette keeps the studio background and red tab clean.
  wash.style.backgroundColor = mix < 0.5 ? currentColor.hex : nextColor.hex;
  wash.style.opacity = String(colorsIn * colorsOut * (p > 0.57 ? 0.42 : 0));

  gallery.style.opacity = String(colorsIn * colorsOut * 0.92);
  gallery.style.transform = `translateY(${(1 - colorsIn) * 20}px)`;
  palette.forEach((dot, i) => dot.classList.toggle('active', i === Math.round(colorIndex)));
  label.textContent = `${colors[Math.round(colorIndex)].name} · ${String(Math.round(colorIndex) + 1).padStart(2, '0')} / 06`;
  label.style.opacity = String(colorsIn * colorsOut);
  $('#palette').style.opacity = String(colorsIn * colorsOut);
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
