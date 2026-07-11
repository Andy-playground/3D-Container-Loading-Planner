// Three.js scene management — per SDD §7
// three.js is vendored (vendor/) so the app works fully offline. OrbitControls
// is patched to import the vendored build directly — no import map needed,
// which keeps Safari 15 (NFR-2) working.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

let scene, camera, renderer, controls;
let groundGroup;          // floor + grid (resized per render)
let containerGroup;       // container shell + doors + labels
let boxesGroup;           // all rendered boxes
let cogGroup;             // center-of-gravity markers + axle indicators
let canvasEl;
let dirLight;             // shadow-casting key light (refit per render)
let hemiLight;            // sky/ground fill light (ground color follows theme)

// Scene palette follows the OS light/dark appearance, matching the CSS --bg token.
const SCENE_THEMES = {
  light: { bg: 0xe5eaf0, hemiGround: 0xb8c4cc, floor: 0xd6dce4, gridMajor: 0xbcc4cf, gridMinor: 0xd4dae2 },
  dark:  { bg: 0x161619, hemiGround: 0x30303a, floor: 0x242429, gridMajor: 0x42424c, gridMinor: 0x2e2e35 },
};
let sceneTheme = SCENE_THEMES.light;
let lastGroundDims = null; // { totalLen, maxW } — lets a theme switch re-draw the ground
let boxShadows = true;    // disabled automatically on very large plans
let opacity = 1.0;
let labelsVisible = true;
let cogVisible = true;
let highlightMesh = null;
let stepLimit = null;                 // null = show all; N = show loadSeq ≤ N
const hiddenCargoIds = new Set();     // cargo types toggled off in the UI
let totalSteps = 0;

const GAP_BETWEEN_CONTAINERS = 200; // cm, in world units

// Listeners for box click events
const boxClickListeners = [];
export function onBoxClick(fn) { boxClickListeners.push(fn); }

// Listeners for box hover events: fn(placement|null, clientX, clientY)
const boxHoverListeners = [];
export function onBoxHover(fn) { boxHoverListeners.push(fn); }

// Slide-in tweens for loading-sequence playback
const activeTweens = [];
function cancelTweens() {
  for (const tw of activeTweens) tw.g.position.set(0, 0, 0);
  activeTweens.length = 0;
}

export function initScene(canvasContainerEl) {
  canvasEl = canvasContainerEl;

  const darkMq = window.matchMedia?.('(prefers-color-scheme: dark)');
  sceneTheme = darkMq?.matches ? SCENE_THEMES.dark : SCENE_THEMES.light;
  darkMq?.addEventListener?.('change', (e) => applySceneTheme(e.matches));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneTheme.bg);

  const w = canvasEl.clientWidth;
  const h = canvasEl.clientHeight;
  camera = new THREE.PerspectiveCamera(60, w / h, 1, 20000);
  camera.position.set(800, 600, 1200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasEl.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomSpeed = 2.0;

  hemiLight = new THREE.HemisphereLight(0xffffff, sceneTheme.hemiGround, 0.9);
  scene.add(hemiLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(500, 900, 700);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);
  scene.add(dirLight.target);

  groundGroup = new THREE.Group();
  scene.add(groundGroup);
  containerGroup = new THREE.Group();
  scene.add(containerGroup);
  boxesGroup = new THREE.Group();
  scene.add(boxesGroup);
  cogGroup = new THREE.Group();
  scene.add(cogGroup);

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragStart = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
  renderer.domElement.addEventListener('pointerleave', () => {
    hoverEvent = null;
    notifyHover(null, 0, 0);
  });
  animate();

  // Debug hook
  window.__clp = { scene, camera, controls, renderer, THREE };
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragStart = null;
let hoverEvent = null;        // latest pointermove, raycast once per frame
let lastHoverPlacement = null;

function onCanvasPointerMove(event) {
  hoverEvent = { clientX: event.clientX, clientY: event.clientY, buttons: event.buttons };
}

function notifyHover(placement, x, y) {
  if (placement === lastHoverPlacement && placement === null) return;
  lastHoverPlacement = placement;
  renderer.domElement.style.cursor = placement ? 'pointer' : '';
  boxHoverListeners.forEach((fn) => fn(placement, x, y));
}

function processHover() {
  if (!hoverEvent) return;
  const ev = hoverEvent;
  hoverEvent = null;
  if (ev.buttons) { notifyHover(null, 0, 0); return; } // orbiting — no tooltip
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(boxesGroup.children, true);
  const hit = hits.find((h) => h.object.isMesh && h.object.userData.placement && h.object.parent?.visible !== false);
  notifyHover(hit ? hit.object.userData.placement : null, ev.clientX, ev.clientY);
}
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
  const hits = raycaster.intersectObjects(boxesGroup.children, true);
  const hit = hits.find((h) => h.object.isMesh && h.object.userData.placement && h.object.parent?.visible !== false);
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
  processHover();
  if (activeTweens.length) {
    const now = performance.now();
    for (let i = activeTweens.length - 1; i >= 0; i--) {
      const tw = activeTweens[i];
      const t = Math.min(1, (now - tw.start) / tw.duration);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      tw.g.position.set(tw.from.x * (1 - e), tw.from.y * (1 - e), tw.from.z * (1 - e));
      if (t >= 1) {
        tw.g.position.set(0, 0, 0);
        activeTweens.splice(i, 1);
      }
    }
  }
  renderer.render(scene, camera);
}

/**
 * Render a packing result.
 */
export function renderResult(result, containerSpec) {
  clearAll();
  stepLimit = null;
  highlightMesh = null;

  const containers = result.containers ?? [];
  totalSteps = containers.reduce((s, ct) => s + ct.placements.length, 0);
  const count = Math.max(containers.length, 1);
  const totalLen = count * containerSpec.internal.length + (count - 1) * GAP_BETWEEN_CONTAINERS;
  const maxW = containerSpec.internal.width;

  // Per-box shadows get expensive on very large plans — keep the key light
  // but stop boxes from casting beyond this threshold.
  boxShadows = totalSteps <= 500;
  fitShadowCamera(totalLen, maxW, containerSpec.internal.height);

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
    if (containers[i].cog) {
      drawCOGMarker(containers[i].cog, containerSpec, offsetX);
    }
    if (containers[i].axleLoads) {
      drawAxleIndicators(containers[i].axleLoads, containerSpec, offsetX);
    }
  }

  frameCamera(containerSpec, containers.length);
}

function drawCOGMarker(cog, containerSpec, offsetX) {
  const sphereGeom = new THREE.SphereGeometry(15, 16, 12);
  const color = cog.hasWeight ? 0xff8800 : 0xaaaaaa;
  const sphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
  );
  // World mapping: sceneX = packX, sceneY = packZ (vertical), sceneZ = packY
  sphere.position.set(offsetX + cog.x, cog.z, cog.y);
  sphere.userData.kind = 'cog';
  cogGroup.add(sphere);

  // Drop-line to floor for clarity
  const lineGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(offsetX + cog.x, 0, cog.y),
    new THREE.Vector3(offsetX + cog.x, cog.z, cog.y),
  ]);
  const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }));
  line.userData.kind = 'cog';
  cogGroup.add(line);

  cogGroup.visible = cogVisible;
}

function drawAxleIndicators(ax, containerSpec, offsetX) {
  const W = containerSpec.internal.width;
  const yA = -10; // just below floor
  const len = W + 60;
  const color = ax.balanced ? 0x28a745 : 0xdc3545;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
  for (const x of [ax.axleFrontX, ax.axleRearX]) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(offsetX + x, yA, -30),
      new THREE.Vector3(offsetX + x, yA, len - 30),
    ]);
    const line = new THREE.Line(g, mat);
    line.userData.kind = 'cog';
    cogGroup.add(line);
  }
}

export function setCOGVisible(v) {
  cogVisible = !!v;
  if (cogGroup) cogGroup.visible = cogVisible;
}

function clearAll() {
  cancelTweens();
  disposeGroup(groundGroup);
  disposeGroup(containerGroup);
  disposeGroup(boxesGroup);
  disposeGroup(cogGroup);
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

// Fit the directional light's orthographic shadow frustum to the laid-out containers.
function fitShadowCamera(totalLen, maxW, maxH) {
  if (!dirLight) return;
  dirLight.position.set(totalLen / 2 + 400, Math.max(900, maxH * 3.5), maxW / 2 + 700);
  dirLight.target.position.set(totalLen / 2, 0, maxW / 2);
  dirLight.target.updateMatrixWorld();
  const s = Math.max(totalLen, maxW * 3, 800) * 0.75;
  const c = dirLight.shadow.camera;
  c.left = -s; c.right = s; c.top = s; c.bottom = -s;
  c.near = 10; c.far = 8000;
  c.updateProjectionMatrix();
}

// ===== Ground (floor + grid) =====
function drawGround(totalLen, maxW) {
  lastGroundDims = { totalLen, maxW };
  const sizeX = totalLen + 600;
  const sizeZ = Math.max(maxW, 600) * 4;
  const centerX = totalLen / 2;
  const centerZ = maxW / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeX, sizeZ),
    new THREE.MeshStandardMaterial({ color: sceneTheme.floor, side: THREE.DoubleSide, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, -0.5, centerZ);
  floor.receiveShadow = true;
  groundGroup.add(floor);

  const gridDivX = Math.max(20, Math.round(sizeX / 50));
  const grid = new THREE.GridHelper(Math.max(sizeX, sizeZ), Math.max(gridDivX, 20), sceneTheme.gridMajor, sceneTheme.gridMinor);
  grid.position.set(centerX, 0, centerZ);
  groundGroup.add(grid);
}

function applySceneTheme(dark) {
  sceneTheme = dark ? SCENE_THEMES.dark : SCENE_THEMES.light;
  scene.background.setHex(sceneTheme.bg);
  hemiLight.groundColor.setHex(sceneTheme.hemiGround);
  if (lastGroundDims) {
    disposeGroup(groundGroup);
    drawGround(lastGroundDims.totalLen, lastGroundDims.maxW);
  }
}

// ===== Container: realistic shell (corrugated walls, plywood floor, swing doors) =====

const CONTAINER_PAINT = '#3f6c94';       // corrugated steel paint
const CONTAINER_PAINT_DARK = '#33587a';  // corrugation shadow
const CONTAINER_TRIM = '#2c3e50';        // corner posts / rails

// Corrugated steel: vertical trapezoid profile, drawn as repeating light/dark bands.
// One canvas tile covers ~2 corrugation pitches (~60 cm); repeatX scales per wall.
function makeCorrugatedTexture(repeatX, repeatY = 1, base = CONTAINER_PAINT, dark = CONTAINER_PAINT_DARK) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  const pitch = 32;
  for (let x = 0; x < 128; x += pitch) {
    let g = ctx.createLinearGradient(x, 0, x + pitch, 0);
    g.addColorStop(0.0, base);
    g.addColorStop(0.18, 'rgba(255,255,255,0.28)'); // lit flank
    g.addColorStop(0.38, base);
    g.addColorStop(0.62, dark);                     // recessed groove
    g.addColorStop(0.85, dark);
    g.addColorStop(1.0, base);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, pitch, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(repeatX)), repeatY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Plywood floor: warm planks with grain streaks and seams.
function makeFloorTexture(repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a08154';
  ctx.fillRect(0, 0, 256, 256);
  // grain streaks
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256;
    const alpha = 0.05 + Math.random() * 0.10;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(70,45,20,${alpha})` : `rgba(230,200,150,${alpha})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (Math.random() - 0.5) * 14, 170, y + (Math.random() - 0.5) * 14, 256, y);
    ctx.stroke();
  }
  // plank seams
  ctx.strokeStyle = 'rgba(60,40,20,0.55)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 256; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(256, y + 0.5); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(repeatX)), Math.max(1, Math.round(repeatY)));
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

// Door leaf: painted panel with lock rods, keepers and a handle.
function makeDoorTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#46759e';
  ctx.fillRect(0, 0, 128, 256);
  // subtle horizontal door corrugation
  for (let y = 0; y < 256; y += 32) {
    const g = ctx.createLinearGradient(0, y, 0, y + 32);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(6, y, 116, 32);
  }
  // frame
  ctx.strokeStyle = 'rgba(20,35,50,0.7)';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 122, 250);
  // two vertical lock rods with keeper brackets
  for (const x of [38, 90]) {
    ctx.fillStyle = '#c8d2da';
    ctx.fillRect(x - 3, 8, 6, 240);
    ctx.fillStyle = '#8a99a6';
    for (const y of [26, 120, 214]) ctx.fillRect(x - 6, y, 12, 14);
    // handle
    ctx.fillStyle = '#dde5eb';
    ctx.fillRect(x - 14, 150, 14, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function drawContainerFrame(spec, offsetX) {
  const { length: L, width: W, height: H } = spec.internal;

  // --- Shell: single box with BackSide materials. Faces are rendered only
  // from the inside, so whichever wall faces the camera is culled and the
  // cargo stays visible from every orbit angle (dollhouse view).
  const shellGeom = new THREE.BoxGeometry(L, H, W);
  const steelMat = (map) => new THREE.MeshStandardMaterial({
    map, side: THREE.BackSide, roughness: 0.75, metalness: 0.25,
  });
  const sideTexA = makeCorrugatedTexture(L / 60);
  const sideTexB = makeCorrugatedTexture(L / 60);
  const backTex = makeCorrugatedTexture(W / 60);
  const roofTex = makeCorrugatedTexture(L / 60, 1, '#7d8f9e', '#6a7b89');
  const floorMat = new THREE.MeshStandardMaterial({
    map: makeFloorTexture(L / 120, W / 120), side: THREE.BackSide, roughness: 0.9, metalness: 0,
  });
  const openEnd = new THREE.MeshBasicMaterial({ visible: false }); // door opening at +X
  const shell = new THREE.Mesh(shellGeom, [
    openEnd,             // +x (door end — left open)
    steelMat(backTex),   // -x back wall
    steelMat(roofTex),   // +y roof
    floorMat,            // -y floor (plywood, seen from above)
    steelMat(sideTexA),  // +z side
    steelMat(sideTexB),  // -z side
  ]);
  shell.position.set(offsetX + L / 2, H / 2, W / 2);
  shell.receiveShadow = true;
  containerGroup.add(shell);

  // Outline keeps the silhouette readable from culled sides
  const edges = new THREE.EdgesGeometry(shellGeom);
  const wire = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.55 })
  );
  wire.position.copy(shell.position);
  containerGroup.add(wire);

  // --- Corner posts + top/bottom rails (exterior trim)
  const trimMat = new THREE.MeshStandardMaterial({ color: CONTAINER_TRIM, roughness: 0.6, metalness: 0.4 });
  const post = new THREE.BoxGeometry(10, H + 8, 10);
  for (const [px, pz] of [[0, 0], [0, W], [L, 0], [L, W]]) {
    const m = new THREE.Mesh(post, trimMat);
    m.position.set(offsetX + px, H / 2, pz);
    m.castShadow = true;
    containerGroup.add(m);
  }
  const railX = new THREE.BoxGeometry(L, 8, 8);
  for (const [py, pz] of [[0, 0], [0, W], [H, 0], [H, W]]) {
    const m = new THREE.Mesh(railX, trimMat);
    m.position.set(offsetX + L / 2, py, pz);
    containerGroup.add(m);
  }
  const railZ = new THREE.BoxGeometry(8, 8, W);
  for (const [px, py] of [[0, 0], [0, H], [L, 0], [L, H]]) {
    const m = new THREE.Mesh(railZ, trimMat);
    m.position.set(offsetX + px, py, W / 2);
    containerGroup.add(m);
  }

  // --- Swing doors at +X, hinged on the corner posts, opened ~110° outward
  // so the interior stays visible from the door end.
  const leafW = W / 2 - 3;
  const leafGeom = new THREE.BoxGeometry(4, H - 6, leafW);
  const doorFace = makeDoorTexture();
  const doorEdge = new THREE.MeshStandardMaterial({ color: '#3a627f', roughness: 0.7, metalness: 0.3 });
  const doorMat = [
    new THREE.MeshStandardMaterial({ map: doorFace, roughness: 0.7, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ map: doorFace, roughness: 0.7, metalness: 0.3 }),
    doorEdge, doorEdge, doorEdge, doorEdge,
  ];
  const OPEN_ANGLE = THREE.MathUtils.degToRad(110);

  const leftHinge = new THREE.Group();
  leftHinge.position.set(offsetX + L + 2, H / 2, 0);
  const leftLeaf = new THREE.Mesh(leafGeom, doorMat);
  leftLeaf.position.set(0, 0, leafW / 2);
  leftLeaf.castShadow = true;
  leftHinge.add(leftLeaf);
  leftHinge.rotation.y = OPEN_ANGLE;
  containerGroup.add(leftHinge);

  const rightHinge = new THREE.Group();
  rightHinge.position.set(offsetX + L + 2, H / 2, W);
  const rightLeaf = new THREE.Mesh(leafGeom, doorMat);
  rightLeaf.position.set(0, 0, -leafW / 2);
  rightLeaf.castShadow = true;
  rightHinge.add(rightLeaf);
  rightHinge.rotation.y = -OPEN_ANGLE;
  containerGroup.add(rightHinge);
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
  mesh.castShadow = boxShadows;
  mesh.receiveShadow = true;
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

  // Wrap mesh + outline so visibility (cargo toggle / step playback) stays in sync
  const boxGroup = new THREE.Group();
  boxGroup.add(mesh);
  boxGroup.add(outline);
  boxGroup.userData.cargoId = p.cargoId;
  boxGroup.userData.loadSeq = p.loadSeq ?? 0;
  boxGroup.visible = computeBoxVisibility(p.cargoId, p.loadSeq ?? 0);
  boxesGroup.add(boxGroup);
}

function computeBoxVisibility(cargoId, loadSeq) {
  if (hiddenCargoIds.has(cargoId)) return false;
  if (stepLimit !== null && loadSeq > stepLimit) return false;
  return true;
}

function applyBoxVisibility() {
  for (const g of boxesGroup.children) {
    if (!g.isGroup) continue;
    g.visible = computeBoxVisibility(g.userData.cargoId, g.userData.loadSeq);
  }
}

/** Hide/show all boxes belonging to a cargo type. */
export function setCargoVisibility(cargoId, visible) {
  if (visible) hiddenCargoIds.delete(cargoId);
  else hiddenCargoIds.add(cargoId);
  applyBoxVisibility();
}

/** Loading-sequence playback: show only boxes with loadSeq ≤ n (null = all). Instant (scrub). */
export function setStepLimit(n) {
  cancelTweens();
  stepLimit = (n === null || n === undefined) ? null : Math.max(0, Math.floor(n));
  applyBoxVisibility();
}

/**
 * Animated playback step: reveal step n with the box sliding in from the
 * door side (+X, elevated). Scrubbing still uses setStepLimit (instant).
 */
export function playStep(n, durationMs = 260) {
  stepLimit = Math.max(0, Math.floor(n));
  applyBoxVisibility();
  for (const g of boxesGroup.children) {
    if (!g.isGroup || g.userData.loadSeq !== stepLimit || !g.visible) continue;
    // Restart any in-flight tween for this group
    const idx = activeTweens.findIndex((tw) => tw.g === g);
    if (idx >= 0) activeTweens.splice(idx, 1);
    activeTweens.push({
      g,
      from: { x: 320, y: 160, z: 0 },
      start: performance.now(),
      duration: durationMs,
    });
    g.position.set(320, 160, 0);
  }
}

export function getTotalSteps() {
  return totalSteps;
}

/** Capture the current 3D view as a PNG data URL. */
export function captureImage() {
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}

function* iterateBoxObjects() {
  for (const child of boxesGroup.children) {
    if (child.isGroup) {
      yield* child.children;
    } else {
      yield child;
    }
  }
}

export function setLabelsVisible(v) {
  labelsVisible = !!v;
  // Re-create textures or strip them on existing materials
  for (const mesh of iterateBoxObjects()) {
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
  for (const obj of iterateBoxObjects()) {
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
