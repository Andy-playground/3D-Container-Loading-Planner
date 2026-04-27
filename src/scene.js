// Three.js scene management — per SDD §7
import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let groundGroup;          // floor + grid (resized per render)
let containerGroup;       // wireframe + door indicator
let boxesGroup;           // all rendered boxes
let canvasEl;
let opacity = 1.0;
let labelsVisible = true;
let highlightMesh = null;

const GAP_BETWEEN_CONTAINERS = 200; // cm, in world units

// Listeners for box click events
const boxClickListeners = [];
export function onBoxClick(fn) { boxClickListeners.push(fn); }

export function initScene(canvasContainerEl) {
  canvasEl = canvasContainerEl;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);

  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  camera = new THREE.PerspectiveCamera(60, w / h, 1, 20000);
  camera.position.set(800, 600, 1200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  canvasEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 2.0;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(500, 800, 600);
  scene.add(dir);

  groundGroup = new THREE.Group();
  scene.add(groundGroup);
  containerGroup = new THREE.Group();
  scene.add(containerGroup);
  boxesGroup = new THREE.Group();
  scene.add(boxesGroup);

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragStart = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('click', onCanvasClick);
  animate();

  // Debug hook
  window.__clp = { scene, camera, controls, renderer, THREE };
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragStart = null;
function onCanvasClick(event) {
  // Skip if pointer dragged (orbit), only handle simple clicks
  if (dragStart && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 5) {
    dragStart = null;
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(boxesGroup.children, false);
  const hit = hits.find((h) => h.object.isMesh && h.object.userData.placement);
  if (hit) {
    setHighlight(hit.object);
    boxClickListeners.forEach((fn) => fn(hit.object.userData.placement));
  } else {
    setHighlight(null);
    boxClickListeners.forEach((fn) => fn(null));
  }
}

function setHighlight(mesh) {
  if (highlightMesh && highlightMesh !== mesh) {
    if (Array.isArray(highlightMesh.material)) {
      highlightMesh.material.forEach((m) => { m.emissive?.setHex(0x000000); });
    }
  }
  if (mesh) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => { m.emissive?.setHex(0x444400); });
    }
  }
  highlightMesh = mesh;
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
 */
export function renderResult(result, containerSpec) {
  clearAll();

  const containers = result.containers ?? [];
  const count = Math.max(containers.length, 1);
  const totalLen = count * containerSpec.internal.length + (count - 1) * GAP_BETWEEN_CONTAINERS;
  const maxW = containerSpec.internal.width;

  drawGround(totalLen, maxW);

  if (containers.length === 0) {
    drawContainerFrame(containerSpec, 0);
    frameCamera(containerSpec, 1);
    return;
  }

  for (let i = 0; i < containers.length; i++) {
    const offsetX = i * (containerSpec.internal.length + GAP_BETWEEN_CONTAINERS);
    drawContainerFrame(containerSpec, offsetX);
    for (const p of containers[i].placements) {
      drawBox(p, offsetX);
    }
  }

  frameCamera(containerSpec, containers.length);
}

function clearAll() {
  disposeGroup(groundGroup);
  disposeGroup(containerGroup);
  disposeGroup(boxesGroup);
}

function disposeGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    if (obj.isGroup) {
      obj.children.forEach(disposeObj);
    } else {
      disposeObj(obj);
    }
  }
}

function disposeObj(obj) {
  obj.geometry?.dispose();
  if (Array.isArray(obj.material)) {
    obj.material.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
  } else if (obj.material) {
    obj.material.map?.dispose();
    obj.material.dispose();
  }
}

// ===== Ground (floor + grid) =====
function drawGround(totalLen, maxW) {
  const sizeX = totalLen + 600;
  const sizeZ = Math.max(maxW, 600) * 4;
  const centerX = totalLen / 2;
  const centerZ = maxW / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeX, sizeZ),
    new THREE.MeshStandardMaterial({ color: 0xdcdcdc, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, -0.5, centerZ);
  groundGroup.add(floor);

  const gridDivX = Math.max(20, Math.round(sizeX / 50));
  const grid = new THREE.GridHelper(Math.max(sizeX, sizeZ), Math.max(gridDivX, 20), 0xbbbbbb, 0xdddddd);
  grid.position.set(centerX, 0, centerZ);
  groundGroup.add(grid);
}

// ===== Container frame + door =====
function drawContainerFrame(spec, offsetX) {
  const { length: L, width: W, height: H } = spec.internal;

  // Wireframe
  const geom = new THREE.BoxGeometry(L, H, W);
  const edges = new THREE.EdgesGeometry(geom);
  const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x333333 }));
  wire.position.set(offsetX + L / 2, H / 2, W / 2);
  containerGroup.add(wire);
  geom.dispose();

  // Door = +X end (red translucent panel + thick red frame + label)
  const doorGeom = new THREE.PlaneGeometry(W, H);
  const doorMat = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });
  const doorPanel = new THREE.Mesh(doorGeom, doorMat);
  doorPanel.rotation.y = Math.PI / 2;
  doorPanel.position.set(offsetX + L, H / 2, W / 2);
  containerGroup.add(doorPanel);

  const doorEdges = new THREE.EdgesGeometry(doorGeom);
  const doorWire = new THREE.LineSegments(
    doorEdges,
    new THREE.LineBasicMaterial({ color: 0xcc0000, linewidth: 2 })
  );
  doorWire.rotation.y = Math.PI / 2;
  doorWire.position.set(offsetX + L, H / 2, W / 2);
  containerGroup.add(doorWire);
  doorGeom.dispose();

  // Door label sprite above door
  const label = makeTextSprite('🚪 DOOR', {
    fontSize: 56,
    bgColor: '#cc0000',
    textColor: '#ffffff',
    padding: 14,
  });
  const labelHeight = 50;
  label.scale.set(label.userData.aspectRatio * labelHeight, labelHeight, 1);
  label.position.set(offsetX + L + 20, H + 35, W / 2);
  containerGroup.add(label);

  // "BACK" label at -X end (lighter)
  const backLabel = makeTextSprite('BACK', {
    fontSize: 44,
    bgColor: '#888888',
    textColor: '#ffffff',
    padding: 10,
  });
  backLabel.scale.set(backLabel.userData.aspectRatio * 32, 32, 1);
  backLabel.position.set(offsetX - 20, H + 25, W / 2);
  containerGroup.add(backLabel);
}

// ===== Box rendering =====
function drawBox(p, offsetX) {
  const geom = new THREE.BoxGeometry(p.L, p.H, p.W);

  const baseColor = p.color || '#3498db';

  // Build the 6 materials with or without textures depending on labelsVisible
  const buildMat = (tex) => {
    const m = new THREE.MeshStandardMaterial({
      transparent: opacity < 1,
      opacity,
      roughness: 0.7,
      metalness: 0.05,
    });
    if (labelsVisible && tex) {
      m.map = tex;
      m.color = new THREE.Color('#ffffff');
    } else {
      m.color = new THREE.Color(baseColor);
    }
    return m;
  };

  const topTex = labelsVisible ? makeBoxFaceTexture(p, p.L, p.W) : null;
  const endTex = labelsVisible ? makeBoxFaceTexture(p, p.W, p.H) : null;
  const sideTex = labelsVisible ? makeBoxFaceTexture(p, p.L, p.H) : null;

  const bottomMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    transparent: opacity < 1,
    opacity,
    roughness: 0.7,
    metalness: 0.05,
  });

  // Material order: [+x, -x, +y, -y, +z, -z]
  const materials = [
    buildMat(endTex),
    buildMat(endTex),
    buildMat(topTex),
    bottomMat,
    buildMat(sideTex),
    buildMat(sideTex),
  ];
  const mesh = new THREE.Mesh(geom, materials);
  mesh.position.set(offsetX + p.x + p.L / 2, p.z + p.H / 2, p.y + p.W / 2);
  mesh.userData.placement = { ...p, worldX: mesh.position.x, worldY: mesh.position.y, worldZ: mesh.position.z };

  // Outline
  const edges = new THREE.EdgesGeometry(geom);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x222222,
    transparent: true,
    opacity: opacity * 0.6,
  });
  const outline = new THREE.LineSegments(edges, edgeMat);
  outline.position.copy(mesh.position);

  boxesGroup.add(mesh);
  boxesGroup.add(outline);
}

export function setLabelsVisible(v) {
  labelsVisible = !!v;
  // Re-create textures or strip them on existing materials
  for (const mesh of boxesGroup.children) {
    if (!mesh.isMesh || !mesh.userData.placement) continue;
    const p = mesh.userData.placement;
    const baseColor = p.color || '#3498db';
    if (Array.isArray(mesh.material)) {
      // Faces: 0 +x end, 1 -x end, 2 +y top, 3 -y bottom, 4 +z side, 5 -z side
      const facePairs = [
        [0, p.W, p.H], [1, p.W, p.H],
        [2, p.L, p.W],
        [4, p.L, p.H], [5, p.L, p.H],
      ];
      if (labelsVisible) {
        for (const [idx, a, b] of facePairs) {
          const m = mesh.material[idx];
          m.map?.dispose();
          m.map = makeBoxFaceTexture(p, a, b);
          m.color = new THREE.Color('#ffffff');
          m.needsUpdate = true;
        }
      } else {
        for (const [idx] of facePairs) {
          const m = mesh.material[idx];
          m.map?.dispose();
          m.map = null;
          m.color = new THREE.Color(baseColor);
          m.needsUpdate = true;
        }
      }
    }
  }
}

/**
 * Render a face texture with the cargo name and optional icons.
 * Aspect of canvas matches face dimensions (faceA × faceB) so text isn't squished.
 */
function makeBoxFaceTexture(p, faceA, faceB, opts = {}) {
  const showIcons = opts.showIcons ?? true;
  const canvas = document.createElement('canvas');
  const aspect = faceA / Math.max(faceB, 1);
  if (aspect >= 1) {
    canvas.width = 256;
    canvas.height = Math.max(48, Math.min(256, Math.round(256 / aspect)));
  } else {
    canvas.height = 256;
    canvas.width = Math.max(48, Math.min(256, Math.round(256 * aspect)));
  }
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = p.color || '#3498db';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  const lum = colorLuminance(p.color || '#3498db');
  const fg = lum > 0.55 ? '#000000' : '#ffffff';

  // Name centered
  const minDim = Math.min(canvas.width, canvas.height);
  const nameSize = Math.min(
    canvas.width / Math.max(5, p.name.length * 0.65),
    minDim * 0.4
  );
  ctx.fillStyle = fg;
  ctx.font = `bold ${nameSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.name, canvas.width / 2, canvas.height / 2);

  if (showIcons) {
    const icons = [];
    if (p.thisSideUp) icons.push({ char: '↑', color: fg, size: minDim * 0.28 });
    if (p.nonStackable) icons.push({ char: '⊘', color: '#ff3333', size: minDim * 0.30 });

    let iconX = canvas.width - 8;
    const iconY = 6;
    for (const ic of icons) {
      ctx.font = `bold ${ic.size}px sans-serif`;
      ctx.fillStyle = ic.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      if (ic.color === '#ff3333') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeText(ic.char, iconX, iconY);
      }
      ctx.fillText(ic.char, iconX, iconY);
      iconX -= ic.size * 0.95;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function colorLuminance(hex) {
  hex = String(hex).replace('#', '');
  if (hex.length !== 6) return 0.5;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ===== Text sprite helper =====
function makeTextSprite(text, opts = {}) {
  const {
    fontSize = 48,
    bgColor = 'rgba(0,0,0,0)',
    textColor = '#000000',
    padding = 8,
  } = opts;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + padding * 2);
  canvas.height = Math.ceil(fontSize * 1.3 + padding * 2);

  ctx.font = `bold ${fontSize}px sans-serif`;
  if (bgColor !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = bgColor;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
    ctx.fill();
  }
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.userData.aspectRatio = canvas.width / canvas.height;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function frameCamera(spec, containerCount) {
  const { length: L, width: W, height: H } = spec.internal;
  const totalLen = L * containerCount + GAP_BETWEEN_CONTAINERS * Math.max(0, containerCount - 1);
  const center = new THREE.Vector3(totalLen / 2, H / 2, W / 2);
  const distance = Math.max(totalLen, W * 3, H * 3) * 0.85;
  camera.position.set(center.x + distance * 0.6, center.y + distance * 0.7, center.z + distance * 1.0);
  controls.target.copy(center);
  controls.update();
}

export function setOpacity(v) {
  opacity = Math.max(0.1, Math.min(1, v));
  for (const obj of boxesGroup.children) {
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        for (const m of obj.material) {
          m.transparent = opacity < 1;
          m.opacity = opacity;
          m.needsUpdate = true;
        }
      } else {
        obj.material.transparent = opacity < 1;
        obj.material.opacity = obj.isLineSegments ? opacity * 0.6 : opacity;
        obj.material.needsUpdate = true;
      }
    }
  }
}
