import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

let renderer;
let scene;
let camera;
let bubbles;
let raf = 0;
let pointer = { x: 0, y: 0 };
let reducedMotion = false;

const BUBBLE_COUNT = 48;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function createBubbleMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    metalness: 0.05,
    transmission: 0.85,
    thickness: 0.8,
    ior: 1.15,
    envMapIntensity: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.1
  });
}

function initLights(targetScene) {
  const ambient = new THREE.AmbientLight(0x6ec8ff, 0.45);
  targetScene.add(ambient);

  const key = new THREE.DirectionalLight(0xffd6f0, 0.85);
  key.position.set(4, 8, 6);
  targetScene.add(key);

  const rim = new THREE.PointLight(0x4ecdc4, 1.4, 40);
  rim.position.set(-6, 2, -4);
  targetScene.add(rim);

  const gold = new THREE.PointLight(0xffd166, 0.9, 30);
  gold.position.set(5, -3, 2);
  targetScene.add(gold);
}

function buildBubbles(targetScene) {
  const geometry = new THREE.SphereGeometry(1, 24, 24);
  const material = createBubbleMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, BUBBLE_COUNT);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const meta = [];

  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    const scale = rand(0.35, 1.65);
    dummy.position.set(rand(-14, 14), rand(-10, 14), rand(-8, 4));
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    meta.push({
      x: dummy.position.x,
      y: dummy.position.y,
      z: dummy.position.z,
      scale,
      driftX: rand(-0.25, 0.25),
      driftY: rand(0.12, 0.42),
      phase: rand(0, Math.PI * 2),
      wobble: rand(0.4, 1.1)
    });
  }

  mesh.instanceMatrix.needsUpdate = true;
  targetScene.add(mesh);
  return { mesh, meta, dummy };
}

function buildParticles(targetScene) {
  const count = 120;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = rand(-18, 18);
    positions[i * 3 + 1] = rand(-12, 16);
    positions[i * 3 + 2] = rand(-10, 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xb8f0ff,
    size: 0.06,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  targetScene.add(points);
  return points;
}

function onResize(canvas) {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function onPointerMove(event) {
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = -(event.clientY / window.innerHeight) * 2 + 1;
  pointer.x = x;
  pointer.y = y;
}

function tick(time) {
  if (!renderer || !scene || !camera || !bubbles) return;
  const t = time * 0.001;
  const { mesh, meta, dummy } = bubbles;

  if (!reducedMotion) {
    for (let i = 0; i < BUBBLE_COUNT; i += 1) {
      const b = meta[i];
      let y = b.y + Math.sin(t * b.wobble + b.phase) * 0.35 + t * b.driftY * 0.08;
      let x = b.x + Math.cos(t * 0.35 + b.phase) * b.driftX;
      if (y > 16) {
        y = -12;
        x = rand(-14, 14);
        b.x = x;
        b.y = y;
      }
      dummy.position.set(x + pointer.x * 0.6, y, b.z + pointer.y * 0.25);
      dummy.scale.setScalar(b.scale * (1 + Math.sin(t * 1.4 + b.phase) * 0.04));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.02;
    camera.position.y += (pointer.y * 0.2 - camera.position.y) * 0.02;
    camera.lookAt(0, 0, 0);
  }

  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);
}

export function initScene(canvas) {
  if (!canvas || renderer) return;

  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  onResize(canvas);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x061220, 0.045);

  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(0, 0, 14);

  initLights(scene);
  bubbles = buildBubbles(scene);
  buildParticles(scene);

  window.addEventListener("resize", () => onResize(canvas));
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  if (!reducedMotion) {
    raf = requestAnimationFrame(tick);
  } else {
    renderer.render(scene, camera);
  }
}

export function destroyScene() {
  cancelAnimationFrame(raf);
  window.removeEventListener("pointermove", onPointerMove);
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  bubbles = null;
}
