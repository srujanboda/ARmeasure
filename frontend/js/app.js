// js/app.js — FIXED: No extra dots on button clicks + Total always shown when measuring

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.159/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.159/examples/jsm/webxr/ARButton.js';

let camera, scene, renderer, reticle, controller;
let hitTestSource = null;
let points = [], pointMeshes = [], line = null, labels = [];
let infoDiv, resetBtn, undoBtn, unitBtn;
let isWallMode = false;
let currentUnit = 'm'; // 'm', 'ft', 'in'
let video, canvas, ctx;

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
    position:fixed; top:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.85); color:white; padding:12px 32px;
    border-radius:20px; font:bold 20px system-ui; z-index:999; pointer-events:none;
  `;
  infoDiv.innerHTML = `Total: <span style="color:#ff4444">0.00 m</span> • 0 pts`;
  document.body.appendChild(infoDiv);

  // UNDO BUTTON (top-left)
  undoBtn = document.createElement('button');
  undoBtn.innerHTML = '↺';
  undoBtn.style.cssText = `
    position:fixed; top:20px; left:20px; z-index:999;
    width:56px; height:56px; border-radius:50%;
    background:#333; color:white; border:none;
    font-size:28px; box-shadow:0 6px 20px rgba(0,0,0,0.6);
    display:none;
  `;
  undoBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent triggering tap
    undoLastPoint();
  };
  document.body.appendChild(undoBtn);

  // UNIT TOGGLE – TOP-LEFT, BELOW UNDO
  unitBtn = document.createElement('button');
  unitBtn.textContent = 'm';
  unitBtn.style.cssText = `
    position:fixed; top:90px; left:20px; z-index:9999;
    width:56px; height:56px; border-radius:50%;
    background:#0066ff; color:white; border:none;
    font:bold 20px system-ui; box-shadow:0 8px 25px rgba(0,102,255,0.5);
    display:flex; align-items:center; justify-content:center;
  `;
  unitBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent triggering tap
    if (currentUnit === 'm') { currentUnit = 'ft'; unitBtn.textContent = 'ft'; }
    else if (currentUnit === 'ft') { currentUnit = 'in'; unitBtn.textContent = 'in'; }
    else { currentUnit = 'm'; unitBtn.textContent = 'm'; }
    updateAll();
  };
  document.body.appendChild(unitBtn);

  // Reset Button (top-right)
  resetBtn = document.createElement('button');
  resetBtn.textContent = "Reset";
  resetBtn.style.cssText = `
    position:fixed; top:20px; right:20px; z-index:999;
    padding:12px 24px; font:bold 16px system-ui; background:#ff3333; color:white;
    border:none; border-radius:14px; box-shadow:0 6px 20px rgba(0,0,0,0.5); display:none;
  `;
  resetBtn.onclick = (e) => {
    e.stopPropagation(); // Prevent triggering tap
    resetAll();
  };
  document.body.appendChild(resetBtn);

  // START AR + rest unchanged...
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
  });
  arButton.classList.add('custom-ar-button');
  document.body.appendChild(arButton);

  arButton.addEventListener('click', () => {
    setTimeout(() => {
      document.querySelectorAll('button').forEach(b => {
        if (b.textContent.toUpperCase().includes('EXIT') || b.textContent.toUpperCase().includes('STOP')) b.remove();
      });
    }, 800);
  });

  // Video + Canvas setup (same)
  video = document.createElement('video');
  video.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;z-index:-1;';
  video.autoplay = video.playsInline = video.muted = true;
  document.body.appendChild(video);

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0;z-index:998;';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { video.srcObject = s; video.play(); }).catch(() => {});

  if (typeof cv !== 'undefined') onOpenCVReady();
  window.onOpenCVReady = () => { if (video.videoWidth) startWallDetection(); };

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3));

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
  renderer.domElement.addEventListener('click', onScreenTap);
  renderer.setAnimationLoop(render);
}

function formatDistance(meters) {
  if (currentUnit === 'ft') return (meters * 3.28084).toFixed(2) + ' ft';
  if (currentUnit === 'in') return (meters * 39.3701).toFixed(1) + ' in';
  return meters.toFixed(2) + ' m';
}

function onSelect() { if (reticle.visible && !isWallMode) placePointFromReticle(); }

function onScreenTap(e) {
  if (isWallMode && points.length < 20) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    const pos = camera.position.clone().add(dir.multiplyScalar(2.5));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
    dot.position.copy(pos); scene.add(dot);
    pointMeshes.push(dot); points.push(pos.clone());
    updateAll();
  }
}

function placePointFromReticle() {
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016), new THREE.MeshBasicMaterial({color:0x00ffaa}));
  dot.position.copy(p); scene.add(dot);
  pointMeshes.push(dot); points.push(p.clone());
  updateAll();
}

function undoLastPoint() {
  if (points.length === 0) return;
  scene.remove(pointMeshes.pop());
  points.pop();
  updateAll();
}

function updateAll() {
  if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l)); labels = [];

  undoBtn.style.display = resetBtn.style.display = points.length > 0 ? 'block' : 'none';

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
    const cnv = document.createElement('canvas');
    const c = cnv.getContext('2d');
    cnv.width = 200; cnv.height = 70;
    c.fillStyle = 'rgba(0,0,0,0.9)'; c.fillRect(0,0,200,70);
    c.fillStyle = '#fff'; c.font = 'bold 42px system-ui';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(formatDistance(d), 100, 35);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cnv), depthTest:false}));
    sprite.position.copy(mid); sprite.scale.set(0.25, 0.1, 1);
    scene.add(sprite); labels.push(sprite);
  }

  infoDiv.innerHTML = `Total: <span style="color:#ff4444;font-size:26px">${formatDistance(totalMeters)}</span> • ${points.length} pts`;
}

function resetAll() {
  points.forEach(() => scene.remove(pointMeshes.shift()));
  points = []; if (line) scene.remove(line);
  labels.forEach(l => scene.remove(l)); labels = []; line = null;
  undoBtn.style.display = resetBtn.style.display = 'none';
  infoDiv.innerHTML = isWallMode ? `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere` : `Total: 0.00 ${currentUnit}`;
}

function startWallDetection() {
  let running = false;
  const process = () => {
    if (running || !isWallMode || video.videoWidth === 0) { requestAnimationFrame(process); return; }
    running = true;
    const frame = cv.imread(video);
    const gray = new cv.Mat();
    cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
    const corners = new cv.KeyPointVector();
    cv.FAST(gray, corners, 30, true);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i = 0; i < corners.size(); i++) {
      const pt = corners.get(i).pt;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI*2);
      ctx.fillStyle = '#00ffff'; ctx.fill();
    }
    frame.delete(); gray.delete(); corners.delete();
    running = false;
    if (isWallMode) requestAnimationFrame(process);
  };
  process();
}

function render(t, frame) {
  if (!frame) return;
  const session = renderer.xr.getSession();
  if (session && !hitTestSource) {
    session.requestReferenceSpace('viewer').then(rs => {
      session.requestHitTestSource({space: rs}).then(s => hitTestSource = s);
    });
  }
  if (hitTestSource && frame) {
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length > 0) {
      isWallMode = false; canvas.style.opacity = '0'; reticle.visible = true;
      reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    } else {
      isWallMode = true; canvas.style.opacity = '0.6'; reticle.visible = false;
      infoDiv.innerHTML = points.length >= 2 ? infoDiv.innerHTML : `<span style="color:#00ffff">WALL MODE</span> – Tap anywhere`; // FIXED: Show total if measuring
    }
  }
  renderer.render(scene, camera);
}
