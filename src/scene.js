// Three.js scene management — per SDD §7
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let containerGroup;       // wireframe + floor
let boxesGroup;           // all rendered boxes
let canvasEl;
let opacity = 1.0;

export function initScene(canvasContainerEl) {
  canvasEl = canvasContainerEl;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);

  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  camera = new THREE.PerspectiveCamera(60, w / h, 1, 10000);
  camera.position.set(800, 600, 1200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  canvasEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(500, 800, 600);
  scene.add(dir);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshStandardMaterial({ color: 0xdcdcdc, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  scene.add(floor);

  // Grid
  const grid = new THREE.GridHelper(2000, 40, 0xbbbbbb, 0xdddddd);
  grid.position.y = 0;
  scene.add(grid);

  containerGroup = new THREE.Group();
  scene.add(containerGroup);

  boxesGroup = new THREE.Group();
  scene.add(boxesGroup);

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  if (!canvasEl) return;
  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Render a packing result.
 * @param {Object} result - From packer.pack()
 * @param {Object} containerSpec - Container definition
 */
export function renderResult(result, containerSpec) {
  clearScene();
  const containers = result.containers ?? [];
  if (containers.length === 0) {
    drawContainerFrame(containerSpec, 0);
    frameCamera(containerSpec, 1);
    return;
  }

  // Display containers side by side along X axis with gap
  const gap = 200;
  for (let i = 0; i < containers.length; i++) {
    const offsetX = i * (containerSpec.internal.length + gap);
    drawContainerFrame(containerSpec, offsetX);
    for (const p of containers[i].placements) {
      drawBox(p, offsetX);
    }
  }

  frameCamera(containerSpec, containers.length);
}

function clearScene() {
  while (containerGroup.children.length) {
    const obj = containerGroup.children.pop();
    obj.geometry?.dispose();
    obj.material?.dispose();
  }
  while (boxesGroup.children.length) {
    const obj = boxesGroup.children.pop();
    if (obj.isGroup) {
      obj.children.forEach((c) => {
        c.geometry?.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material?.dispose();
      });
    } else {
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
  }
}

function drawContainerFrame(spec, offsetX) {
  const { length: L, width: W, height: H } = spec.internal;
  const geom = new THREE.BoxGeometry(L, H, W);
  const edges = new THREE.EdgesGeometry(geom);
  const mat = new THREE.LineBasicMaterial({ color: 0x333333 });
  const wire = new THREE.LineSegments(edges, mat);
  // Position so corner is at (offsetX, 0, 0)
  wire.position.set(offsetX + L / 2, H / 2, W / 2);
  containerGroup.add(wire);
  geom.dispose();
}

function drawBox(p, offsetX) {
  const geom = new THREE.BoxGeometry(p.L, p.H, p.W);
  const mat = new THREE.MeshStandardMaterial({
    color: p.color || '#3498db',
    transparent: opacity < 1,
    opacity,
    roughness: 0.7,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geom, mat);
  // Place by min-corner (p.x, p.y, p.z) → mesh center
  // Mapping: world X = container length, world Y = container height (z), world Z = container width (y)
  mesh.position.set(
    offsetX + p.x + p.L / 2,
    p.z + p.H / 2,
    p.y + p.W / 2
  );

  // Outline
  const edges = new THREE.EdgesGeometry(geom);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: opacity * 0.7 });
  const outline = new THREE.LineSegments(edges, edgeMat);
  outline.position.copy(mesh.position);

  boxesGroup.add(mesh);
  boxesGroup.add(outline);
}

function frameCamera(spec, containerCount) {
  const { length: L, width: W, height: H } = spec.internal;
  const totalLen = L * containerCount + 200 * Math.max(0, containerCount - 1);
  const center = new THREE.Vector3(totalLen / 2, H / 2, W / 2);
  const distance = Math.max(totalLen, W * 3, H * 3) * 0.9;
  camera.position.set(center.x + distance * 0.7, center.y + distance * 0.6, center.z + distance);
  controls.target.copy(center);
  controls.update();
}

export function setOpacity(v) {
  opacity = Math.max(0.1, Math.min(1, v));
  for (const obj of boxesGroup.children) {
    if (obj.material) {
      obj.material.transparent = opacity < 1;
      obj.material.opacity = obj.isLineSegments ? opacity * 0.7 : opacity;
      obj.material.needsUpdate = true;
    }
  }
}
