import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('sin-canvas');
const story = document.getElementById('story');
const progressBar = document.getElementById('scroll-progress');
const stageMark = document.getElementById('stage-mark');
const stageColor = document.getElementById('stage-color');
const paletteName = document.getElementById('palette-name');
const modelStatus = document.getElementById('model-status');
const paletteDots = [...document.querySelectorAll('#palette i')];
const sequenceDots = [...document.querySelectorAll('#sequence i')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
const ambient = new THREE.HemisphereLight(0xece7e0, 0x29231f, 2.0);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xfff6ee, 3.1);
keyLight.position.set(-2.8, 3.2, 4.5);
scene.add(keyLight);
const edgeLight = new THREE.DirectionalLight(0xd9dce6, 1.7);
edgeLight.position.set(3.4, 1.5, -2.8);
scene.add(edgeLight);
const redBounce = new THREE.PointLight(0xef1730, 1.25, 5, 2);
redBounce.position.set(-1.8, -0.4, 1.5);
scene.add(redBounce);

const capRoot = new THREE.Group();
scene.add(capRoot);
const letterRoot = new THREE.Group();
scene.add(letterRoot);

const colorStops = [
  { name: 'Blanc', hex: '#f3f1ed' },
  { name: 'Gris', hex: '#85888d' },
  { name: 'Bleu', hex: '#1947b8' },
  { name: 'Rose', hex: '#e6a8b8' },
  { name: 'Orange', hex: '#ef6228' },
  { name: 'Bordeaux', hex: '#68152d' },
];
const tintColors = colorStops.map(({ hex }) => new THREE.Color(hex));
const activeTint = new THREE.Color('#f3f1ed');
const renderedTint = new THREE.Color('#f3f1ed');
const colorMix = new THREE.Color();
let materialShaders = [];
let baseScale = 1;
let currentColorIndex = -1;
let targetProgress = 0;
let currentProgress = 0;
let lastFrame = performance.now();
let modelReady = false;
let strapGroup;
let strapMaterial;
let letterMeshes = [];

function addFabricShader(material) {
  // Keep the cap opaque. Enabling transparency for this single large mesh
  // makes Three.js sort its overlapping fabric panels incorrectly.
  material.transparent = false;
  material.depthWrite = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sinCapTint = { value: new THREE.Color('#f3f1ed') };
    shader.uniforms.sinStrapOut = { value: 0 };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 sinCapTint;\nuniform float sinStrapOut;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float sinIsStrap = step(0.18, diffuseColor.r)
         * step(diffuseColor.g * 1.30, diffuseColor.r)
         * step(diffuseColor.b * 1.27, diffuseColor.r);
       diffuseColor.rgb *= mix(sinCapTint, vec3(1.0), sinIsStrap);
       if (sinStrapOut > 0.97 && sinIsStrap > 0.5) discard;`
    );
    material.userData.sinShader = shader;
    materialShaders.push(shader);
  };
  material.customProgramCacheKey = () => 'sin-scroll-cap-tint-and-tab-v1';
  material.needsUpdate = true;
}

function makeFabricTexture() {
  const weave = document.createElement('canvas');
  weave.width = 256;
  weave.height = 96;
  const context = weave.getContext('2d');
  context.fillStyle = '#e90f2a';
  context.fillRect(0, 0, weave.width, weave.height);
  for (let x = 0; x < weave.width; x += 3) {
    context.fillStyle = x % 6 === 0 ? '#f83a4b' : '#c90d24';
    context.fillRect(x, 0, 1, weave.height);
  }
  for (let y = 0; y < weave.height; y += 3) {
    context.fillStyle = y % 6 === 0 ? '#fa3144' : '#d50d26';
    context.fillRect(0, y, weave.width, 1);
  }
  context.fillStyle = '#ff4958';
  context.fillRect(0, 3, weave.width, 2);
  context.fillStyle = '#950b1d';
  context.fillRect(0, weave.height - 5, weave.width, 2);
  const texture = new THREE.CanvasTexture(weave);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

const strapTexture = makeFabricTexture();

function ribbonGeometry(points, width, across = 'up') {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
    0.35
  );
  const segments = 42;
  const vertices = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    let side;
    if (across === 'xy') {
      side = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    } else {
      side = up.clone().addScaledVector(tangent, -up.dot(tangent)).normalize();
    }
    const half = side.multiplyScalar(width * 0.5);
    vertices.push(
      point.x - half.x, point.y - half.y, point.z - half.z,
      point.x + half.x, point.y + half.y, point.z + half.z
    );
    uvs.push(t * 3.5, 0, t * 3.5, 1);
    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addSignatureBand() {
  strapGroup = new THREE.Group();
  const geometry = ribbonGeometry([
    [-0.42, -0.15, -0.72],
    [-0.27, -0.19, -0.81],
    [-0.08, -0.205, -0.85],
    [0.12, -0.205, -0.85],
    [0.31, -0.18, -0.80],
    [0.43, -0.15, -0.71],
  ], 0.105, 'up');
  strapMaterial = new THREE.MeshStandardMaterial({
    map: strapTexture,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const band = new THREE.Mesh(geometry, strapMaterial);
  band.frustumCulled = false;
  strapGroup.add(band);
  capRoot.add(strapGroup);
}

function addLetterBand(path, order) {
  const material = new THREE.MeshStandardMaterial({
    map: strapTexture,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(ribbonGeometry(path, 0.12, 'xy'), material);
  mesh.frustumCulled = false;
  mesh.userData.order = order;
  letterRoot.add(mesh);
  letterMeshes.push(mesh);
}

function addSINBands() {
  addLetterBand([
    [-0.93, 0.28, 0], [-0.58, 0.30, 0], [-0.37, 0.19, 0],
    [-0.45, 0.04, 0], [-0.82, -0.02, 0], [-0.96, -0.17, 0],
    [-0.80, -0.31, 0], [-0.36, -0.30, 0],
  ], 0);
  addLetterBand([
    [-0.12, 0.30, 0], [0.20, 0.30, 0], [0.04, 0.30, 0],
    [0.04, -0.30, 0], [-0.12, -0.30, 0], [0.20, -0.30, 0],
  ], 1);
  addLetterBand([
    [0.42, -0.30, 0], [0.42, 0.30, 0], [0.88, -0.30, 0], [0.88, 0.30, 0],
  ], 2);
  letterRoot.position.set(-0.25, 0.0, 0.94);
  letterRoot.scale.setScalar(0.84);
}

function updateColor(progress) {
  let colorPosition = 0;
  if (progress < 0.18) {
    activeTint.copy(tintColors[0]);
  } else if (progress < 0.40) {
    colorPosition = clamp((progress - 0.18) / 0.22, 0, 1) * (tintColors.length - 1);
    const from = Math.floor(colorPosition);
    const to = Math.min(tintColors.length - 1, from + 1);
    const weight = smooth(from, Math.min(tintColors.length - 1, from + 1), colorPosition);
    activeTint.copy(tintColors[from]).lerp(tintColors[to], weight);
  } else if (progress < 0.45) {
    const returnToWhite = smooth(0.40, 0.45, progress);
    activeTint.copy(tintColors[tintColors.length - 1]).lerp(tintColors[0], returnToWhite);
  } else {
    activeTint.copy(tintColors[0]);
  }
  const nearest = progress >= 0.18 && progress < 0.40
    ? Math.min(tintColors.length - 1, Math.round(colorPosition))
    : 0;
  if (nearest !== currentColorIndex) {
    currentColorIndex = nearest;
    const label = colorStops[nearest].name;
    stageColor.textContent = label.toUpperCase();
    paletteName.textContent = label;
    paletteDots.forEach((dot, index) => dot.classList.toggle('active', index === nearest));
  }
  renderedTint.lerp(activeTint, 0.18);
  for (const shader of materialShaders) shader.uniforms.sinCapTint.value.copy(renderedTint);
}

function updateStory(progress) {
  const turnToBack = progress < 0.18
    ? smooth(0, 0.18, progress)
    : progress < 0.42
      ? 1 + smooth(0.18, 0.42, progress) * 2
      : progress < 0.80
        ? 3
        : 3 + smooth(0.80, 1, progress);
  // The supplied GLB faces its rear toward the camera at zero rotation.
  // Start on the front, turn around for the color reveal, then return to front.
  capRoot.rotation.y = Math.PI + turnToBack * Math.PI;
  capRoot.rotation.x = Math.sin(progress * Math.PI * 2) * 0.025;

  const logoMove = smooth(0.48, 0.67, progress) * (1 - smooth(0.82, 0.99, progress));
  capRoot.position.x = (window.innerWidth < 760 ? 0 : 0.34) + logoMove * (window.innerWidth < 760 ? 0.1 : 0.48);
  capRoot.position.y = -0.03 - logoMove * 0.04;
  capRoot.scale.setScalar(baseScale * (1 - logoMove * 0.12));

  const detach = smooth(0.42, 0.54, progress) * (1 - smooth(0.84, 0.95, progress));
  for (const shader of materialShaders) shader.uniforms.sinStrapOut.value = detach;
  const logoForm = smooth(0.57, 0.66, progress) * (1 - smooth(0.80, 0.89, progress));
  const strapVisible = clamp(detach * (1 - smooth(0.56, 0.64, progress)) + smooth(0.82, 0.91, progress) * (1 - smooth(0.96, 1, progress)), 0, 1);
  if (strapGroup) {
    // Pull the red tab out from the back of the cap and sweep it toward the
    // signature. The parent cap is facing away here, so local +X travels left.
    strapGroup.position.set(0.72 * detach, 0.10 * detach, -0.55 * detach);
    strapGroup.rotation.set(0.10 * detach, -0.18 * detach, -0.20 * detach);
    strapMaterial.opacity = strapVisible;
  }
  letterRoot.position.x = (window.innerWidth < 760 ? -0.66 : -0.38) + logoMove * 0.05;
  letterRoot.position.z = 0.95 + logoForm * 0.08;
  letterRoot.scale.setScalar(0.84 + logoForm * 0.05);
  for (const mesh of letterMeshes) {
    const n = mesh.userData.order;
    const arrive = smooth(0.58 + n * 0.025, 0.64 + n * 0.025, progress);
    mesh.material.opacity = arrive * (1 - smooth(0.80, 0.89, progress));
  }

  const chapter = Math.min(4, Math.floor(progress * 5));
  stageMark.textContent = `SIN RED PARIS · 0${chapter + 1} / 05`;
  sequenceDots.forEach((dot, index) => dot.classList.toggle('active', index === chapter));
  progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
  updateColor(progress);
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.35 : 1.7));
  camera.aspect = width / height;
  camera.fov = width < 760 ? 38 : 34;
  camera.position.set(width < 760 ? 0 : 0.18, 0.02, width < 760 ? 3.7 : 3.35);
  camera.lookAt(width < 760 ? 0 : 0.12, 0, 0);
  camera.updateProjectionMatrix();
}

function loadCap() {
  const loader = new GLTFLoader();
  // Resolve from this module so the GLB still loads when the page is served
  // from a nested preview route (instead of assuming the document is at /).
  const capUrl = new URL('./sin-cap-optimized.glb', import.meta.url).href;
  loader.load(
    capUrl,
    (gltf) => {
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);
      baseScale = 1.55 / Math.max(size.x, size.y, size.z);
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of mats) addFabricShader(material);
      });
      capRoot.add(model);
      capRoot.scale.setScalar(baseScale);
      capRoot.position.set(window.innerWidth < 760 ? 0 : 0.34, -0.03, 0);
      addSignatureBand();
      addSINBands();
      modelReady = true;
      modelStatus.classList.add('hidden');
      resize();
      updateStory(targetProgress);
    },
    undefined,
    (error) => {
      console.error('SIN cap model could not load', error);
      modelStatus.textContent = 'Le modèle 3D n’a pas pu se charger';
      canvas.setAttribute('aria-label', 'Le modèle 3D de la casquette SIN n’a pas pu être chargé.');
    }
  );
}

function storyProgress(scroll) {
  const start = story.offsetTop;
  const distance = Math.max(1, story.offsetHeight - window.innerHeight);
  return clamp((scroll - start) / distance, 0, 1);
}

function onLenisScroll({ scroll }) {
  targetProgress = storyProgress(scroll);
}

function animate(time) {
  requestAnimationFrame(animate);
  const dt = Math.min(50, Math.max(1, time - lastFrame));
  lastFrame = time;
  if (window.sinLenis) window.sinLenis.raf(time);
  if (reducedMotion) currentProgress = targetProgress;
  else currentProgress += (targetProgress - currentProgress) * (1 - Math.exp(-dt / 42));
  if (Math.abs(targetProgress - currentProgress) < 0.00015) currentProgress = targetProgress;
  updateStory(currentProgress);
  if (modelReady) renderer.render(scene, camera);
}

const lenis = window.Lenis ? new window.Lenis({
  lerp: 0.12,
  smoothWheel: true,
  anchors: true,
  respectReducedMotion: true,
}) : null;
if (lenis) {
  window.sinLenis = lenis;
  lenis.on('scroll', onLenisScroll);
  onLenisScroll({ scroll: lenis.scroll });
} else {
  window.addEventListener('scroll', () => { targetProgress = storyProgress(window.scrollY); }, { passive: true });
  targetProgress = storyProgress(window.scrollY);
}
window.addEventListener('resize', () => {
  resize();
  targetProgress = storyProgress(lenis ? lenis.scroll : window.scrollY);
}, { passive: true });

resize();
loadCap();
requestAnimationFrame(animate);
