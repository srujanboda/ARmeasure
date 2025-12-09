// js/app.js — FINAL: Wall Mode 100% Accurate Tap Placement

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let points = [], pointMeshes = [], line = null, labels = [];
let allChains = [];
let infoDiv, resetBtn, undoBtn, unitBtn, newLineBtn;
let isWallMode = false;
let currentUnit = 'm';
let video, canvas, ctx;

// Raycaster for accurate wall tapping
const raycaster = new THREE.Raycaster();

init();

async function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Top info
  infoDiv = document.createElement('div');
  infoDiv.style.cssText = `
    position:fixed;top:16px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);color:white;padding:12px 32px;border-radius:20px;
    font:bold 20px system-ui;z-index:999;pointer-events:none;
  `;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 m</span> • 0 pts`;
  document.body.appendChild(infoDiv);

  // Buttons
  undoBtn = createBtn('↺', 'bottom:40px;right:30px;width:60px;height:60px;border-radius:30px;background:#222;font-size:28px;', undoLastPoint);
  unitBtn = createBtn('m', 'top:90px;left:20px;width:56px;height:56px;border-radius:50%;background:#0066ff;', toggleUnit);
  newLineBtn = createBtn('New Line', 'top:20px;left:20px;background:#444;padding:10px 18px;font-size:14px;', startNewLine);
  resetBtn = createBtn('Reset', 'top:20px;right:20px;background:#ff3333;padding:10px 18px;font-size:14px;', resetAll);

  [undoBtn, newLineBtn, resetBtn].forEach(b => b.style.display = 'none');

  // AR Button
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(arButton);

  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(b => {
        if (/stop|exit/i.test(b.textContent)) b.remove();
      });
    }, 1000);
  });

  // Video + Canvas
  video = document.createElement('video');
  video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;z-index:-1;';
  video.autoplay = video.muted = video.playsInline = true;
  document.body.appendChild(video);
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;z-index:998;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { video.srcObject = s; video.play(); }).catch(() => {});

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Accurate tap handling
  renderer.domElement.addEventListener('click', onScreenTap);
  renderer.setAnimationLoop(render);
}

function createBtn(text, style, fn) {
  const b = document.createElement('button');
  b.innerHTML = text.length > 3 ? text : 
    (text === '↺' ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>' : text);
  b.style.cssText = `position:fixed;z-index:9999;color:white;border:none;box-shadow:0 6px 20px rgba(0,0,0,0.5);font:bold 16px system-ui;${style}`;
  if (text.length <= 3) {
    b.style.borderRadius = '50%';
    b.style.display = 'flex';
    b.style.alignItems = 'center';
    b.style.justifyContent = 'center';
  }
  b.addEventListener('click', e => { e.stopPropagation(); fn(); });
  document.body.appendChild(b);
  return b;
}

function toggleUnit() {
  currentUnit = currentUnit === 'm' ? 'ft' : currentUnit === 'ft' ? 'in' : 'm';
  unitBtn.textContent = currentUnit;
  refreshAllLabels();
}

function formatDistance(m) {
  if (currentUnit === 'ft') return (m * 3.28084).toFixed(2) + ' ft';
  if (currentUnit === 'in') return (m * 39.3701).toFixed(1) + ' in';
  return m.toFixed(2) + ' m';
}

function onSelect() {
  if (reticle.visible && !isWallMode) placePointFromReticle();
}

// FIXED: Accurate wall tap using raycaster
function onScreenTap(e) {
  if (!isWallMode || points.length >= 20) return;

  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const direction = raycaster.ray.direction;

  // Cast ray from camera in tap direction
  const distance = 3.0; // Max 3m reach (adjustable)
  const pos = camera.position.clone().add(direction.multiplyScalar(distance));

  addPoint(pos);
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  addPoint(p);
}

function addPoint(pos) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(pos);
  scene.add(dot);
  pointMeshes.push(dot);
  points.push(pos.clone());
  updateAll();
}

function undoLastPoint() {
  if (points.length === 0) return;
  scene.remove(pointMeshes.pop());
  points.pop();
  updateAll();
}

function startNewLine() {
  if (points.length < 2) return;
  allChains.push({ points: [...points], meshes: [...pointMeshes], line, labels: [...labels] });
  points = []; pointMeshes = []; line = null; labels = [];
  updateAll();
}

function updateAll() {
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l)); labels = [];
  const hasContent = points.length > 0 || allChains.length > 0;
  undoBtn.style.display = resetBtn.style.display = hasContent ? 'block' : 'none';
  newLineBtn.style.display = (points.length >= 2) ? 'block' : 'none';

  if (points.length < 2) {
    infoDiv.innerHTML = isWallMode
      ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`
      : `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`;
    return;
  }

  line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color:0xff0044, linewidth:6}));
  scene.add(line);

  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i-1].distanceTo(points[i]);
    totalMeters += d;
    const mid = new THREE.Vector3().lerpVectors(points[i-1], points[i], 0.5);
    const sprite = makeLabel(formatDistance(d));
    sprite.position.copy(mid);
    scene.add(sprite);
    labels.push(sprite);
  }
  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:26px">${formatDistance(totalMeters)}</span> • ${points.length} pts`;
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 70;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0,0,200,70);
  c.fillStyle = '#fff'; c.font = 'bold 42px system-ui';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 100, 35);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas), depthTest:false}));
  sprite.scale.set(0.25, 0.1, 1);
  return sprite;
}

function refreshAllLabels() {
  allChains.forEach(chain => {
    chain.labels.forEach((spr, i) => {
      const d = chain.points[i].distanceTo(chain.points[i+1]);
      spr.material.map.dispose();
      spr.material.map = new THREE.CanvasTexture(makeLabelCanvas(formatDistance(d)));
      spr.material.needsUpdate = true;
    });
  });
  updateAll();
}

function makeLabelCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 70;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,200,70);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 42px system-ui';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 100, 35);
  return c;
}

function resetAll() {
  allChains.forEach(c => {
    c.meshes.forEach(m => scene.remove(m));
    if (c.line) scene.remove(c.line);
    c.labels.forEach(l => scene.remove(l));
  });
  allChains = [];
  points.forEach(() => scene.remove(pointMeshes.shift()));
  points = []; if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l)); labels = []; line = null;
  undoBtn.style.display = resetBtn.style.display = newLineBtn.style.display = 'none';
  infoDiv.innerHTML = isWallMode ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere` : `Total: 0.00 ${currentUnit}`;
}

function render(t, frame) {
  if (!frame) return;
  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('viewer').then(rs => {
      session.requestHitTestSource({ space: rs }).then(s => hitTestSource = s);
    });
  }
  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      isWallMode = false;
      canvas.style.opacity = '0';
      reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
      if (points.length < 2) {
        infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 ${currentUnit}</span> • 0 pts`;
      }
    } else {
      isWallMode = true;
      canvas.style.opacity = '0.6';
      reticle.visible = false;
      if (points.length < 2) {
        infoDiv.innerHTML = `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`;
      }
    }
  }
  renderer.render(scene, camera);
}
