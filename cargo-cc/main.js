// Harbor Line CC — a small cargo-deck FPS built from primitive Three.js shapes.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- Rules & constants ------------------------------------------------------
const DECK_W = 24, DECK_L = 120;
const LIMIT_X = DECK_W / 2 - 0.6, LIMIT_Z = DECK_L / 2 - 0.6;
const WIN_KILLS = 5, MATCH_TIME = 90, RESPAWN = 2, MAG = 12, RADIUS = 0.4;
const TEAM = {
  dock: { name: 'Dock', color: 0x2f7de1, tracer: 0x9fd0ff, dir: 1, spawnZ: -56 }, // bow
  raid: { name: 'Raiders', color: 0xd9482b, tracer: 0xffa080, dir: -1, spawnZ: 56 }, // stern
};

// ---- Renderer, scene, camera --------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc4dd);
scene.fog = new THREE.Fog(0x9fc4dd, 90, 480);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1200);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x3a4a55, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 60, -20);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- World ------------------------------------------------------------------------
function box(w, h, d, color, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x1f5a7a }));
water.rotation.x = -Math.PI / 2;
water.position.y = -6;
scene.add(water);

box(DECK_W + 2, 7, DECK_L + 2, 0x3b3f46, 0, -3.6, 0);         // hull
box(DECK_W + 2.1, 1, DECK_L + 2.1, 0x8a2b22, 0, -5.6, 0);     // waterline stripe
box(DECK_W, 0.2, DECK_L, 0x6d747c, 0, -0.1, 0);               // deck plate
const bow = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 7, 3), new THREE.MeshLambertMaterial({ color: 0x3b3f46 }));
bow.rotation.y = Math.PI;
bow.scale.x = 1.155;
bow.position.set(0, -3.6, -DECK_L / 2 - 1 - 6.5);
scene.add(bow);
box(DECK_W - 4, 4, 5, 0xe6e2d6, 0, 2, DECK_L / 2 + 3.5);      // stern deckhouse (out of bounds)

// Deck markings: spawn pads and lane stripes.
box(DECK_W - 1, 0.02, 6, TEAM.dock.color, 0, 0.01, TEAM.dock.spawnZ);
box(DECK_W - 1, 0.02, 6, TEAM.raid.color, 0, 0.01, TEAM.raid.spawnZ);
for (const x of [-4.5, 4.5]) box(0.25, 0.02, DECK_L - 16, 0xe8c547, x, 0.01, 0);

// Low rails around the deck edge.
const RAIL = 0xe0dccf;
for (const s of [-1, 1]) {
  const x = s * (DECK_W / 2 - 0.1);
  box(0.12, 0.12, DECK_L, RAIL, x, 1.0, 0);
  box(0.08, 0.08, DECK_L, RAIL, x, 0.55, 0);
  for (let z = -DECK_L / 2; z <= DECK_L / 2; z += 4) box(0.1, 1, 0.1, RAIL, x, 0.5, z);
  box(DECK_W, 0.12, 0.12, RAIL, 0, 1.0, s * (DECK_L / 2 - 0.1));
}

// Solid obstacles: `boxes` for collision (footprint + height), `solids` for raycasts.
const boxes = [], solids = [];
const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1d22 });
function obstacle(x, z, w, d, levels, levelH, colors) {
  boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: levels * levelH });
  for (let i = 0; i < levels; i++) {
    const m = box(w, levelH, d, colors[i % colors.length], x, levelH * (i + 0.5), z);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat));
    solids.push(m);
  }
}

const CONTAINER = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7d3c98, 0x16a085, 0xb9770e, 0x5d6d7e];
const CRATE = [0x8b6b3d], STEEL = [0x555b62];
// One half of the deck (bow side); the stern half is the same layout rotated 180°.
const HALF = [
  [-7, -12, 2.4, 6, 1, 2.6, 'c'],
  [6.5, -19, 6, 2.4, 1, 2.6, 'c'],
  [-3, -27, 2.4, 6, 2, 2.6, 'c'],
  [8, -33, 2.4, 6, 2, 2.6, 'c'],
  [-8.8, -40, 6, 2.4, 1, 2.6, 'c'],
  [2.5, -44, 2.4, 2.4, 1, 1.2, 'crate'],
  [-4, -51, 4, 1, 1, 1.3, 'steel'],
  [5, -51, 4, 1, 1, 1.3, 'steel'],
];
HALF.forEach(([x, z, w, d, lv, lh, kind], i) => {
  for (const s of [1, -1]) {
    const k = i * 2 + (s < 0 ? 1 : 0);
    const colors = kind === 'c' ? [CONTAINER[k % 8], CONTAINER[(k + 3) % 8]] : kind === 'crate' ? CRATE : STEEL;
    obstacle(s * x, s * z, w, d, lv, lh, colors);
  }
});
obstacle(0, 0, 1, 28, 1, 3.2, [0x8a8f96]);       // midship wall splitting the deck into lanes
obstacle(-7, 2, 2.4, 2.4, 1, 1.2, CRATE);
obstacle(7, -2, 2.4, 2.4, 1, 1.2, CRATE);

// Navigation points for bots: a grid of open deck spots.
const inBox = (x, z, m) => boxes.some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);
const nav = [];
for (let x = -10.5; x <= 10.5; x += 3) for (let z = -56; z <= 56; z += 4) if (!inBox(x, z, 1)) nav.push(new V3(x, 0, z));

// ---- Physics helpers -------------------------------------------------------------
function collide(p, feetY) {
  for (const b of boxes) {
    if (feetY >= b.h - 0.05) continue; // standing above it
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1);
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (RADIUS - d);
      p.z += (dz / d) * (RADIUS - d);
    } else { // centre inside the box: push out along the shortest axis
      const out = [[p.x - b.x0, 'x', b.x0 - RADIUS], [b.x1 - p.x, 'x', b.x1 + RADIUS],
                   [p.z - b.z0, 'z', b.z0 - RADIUS], [b.z1 - p.z, 'z', b.z1 + RADIUS]].sort((a, c) => a[0] - c[0])[0];
      p[out[1]] = out[2];
    }
  }
  p.x = clamp(p.x, -LIMIT_X, LIMIT_X);
  p.z = clamp(p.z, -LIMIT_Z, LIMIT_Z);
}

function groundAt(p, prevY) {
  let g = 0;
  for (const b of boxes) {
    const dx = p.x - clamp(p.x, b.x0, b.x1), dz = p.z - clamp(p.z, b.z0, b.z1);
    if (dx * dx + dz * dz < RADIUS * RADIUS && b.h <= prevY + 0.05) g = Math.max(g, b.h);
  }
  return g;
}

const ray = new THREE.Raycaster();
const tmpDir = new V3();
function clearLine(a, b) {
  tmpDir.subVectors(b, a);
  const d = tmpDir.length();
  if (d < 1e-3) return true;
  ray.set(a, tmpDir.divideScalar(d));
  ray.far = d;
  return ray.intersectObjects(solids, false).length === 0;
}

// ---- Effects --------------------------------------------------------------------------
const tracers = [];
function tracer(a, b, color) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color }));
  scene.add(line);
  tracers.push({ line, t: 0.07 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    if ((tracers[i].t -= dt) > 0) continue;
    const { line } = tracers[i];
    scene.remove(line);
    line.geometry.dispose();
    line.material.dispose();
    tracers.splice(i, 1);
  }
}
function feed(text, team) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.color = team === 'dock' ? '#9fd0ff' : '#ffb39e';
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 4000);
}
function pulse(id, cls, ms) {
  const el = $(id);
  el.classList.add(cls);
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove(cls), ms);
}

// ---- Fighters -----------------------------------------------------------------------
const fighters = [];
const eye = (f) => new V3(f.pos.x, f.pos.y + (f.bot ? 1.55 : 1.6), f.pos.z);

function makeBot(team, name) {
  const g = new THREE.Group();
  const body = box(0.7, 1.1, 0.45, TEAM[team].color, 0, 0.95, 0, g);
  const legs = box(0.6, 0.45, 0.35, 0x2b2f36, 0, 0.22, 0, g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8c39e }));
  head.position.y = 1.72;
  g.add(head);
  box(0.36, 0.1, 0.12, 0x111111, 0, 1.75, 0.2, g);   // visor shows facing
  box(0.1, 0.1, 0.7, 0x222222, 0.3, 1.15, 0.4, g);   // rifle
  scene.add(g);
  const f = { team, name, bot: true, mesh: g, pos: g.position, parts: [body, legs, head], hp: 100, alive: false, respawnAt: 0 };
  for (const p of f.parts) p.userData.f = f;
  head.userData.head = true;
  fighters.push(f);
  return f;
}

const player = { team: 'dock', name: 'You', bot: false, pos: new V3(), vy: 0, hp: 100, alive: false, ground: true,
                 ammo: MAG, reloading: false, reloadEnd: 0, nextShot: 0, respawnAt: 0 };
fighters.push(player);
makeBot('dock', 'Mate 1'); makeBot('dock', 'Mate 2');
makeBot('raid', 'Raider 1'); makeBot('raid', 'Raider 2'); makeBot('raid', 'Raider 3');

// First-person rifle attached to the camera.
const gun = box(0.08, 0.1, 0.5, 0x2a2d33, 0.22, -0.2, -0.45, camera);
box(0.06, 0.16, 0.08, 0x2a2d33, 0, -0.1, 0.12, gun);

let yaw = 0, pitch = 0;
function spawn(f) {
  const t = TEAM[f.team];
  f.pos.set(rand(-9, 9), 0, t.spawnZ + rand(-1.5, 1.5));
  f.hp = 100;
  f.alive = true;
  if (f.bot) {
    f.mesh.rotation.set(0, t.dir > 0 ? 0 : Math.PI, 0);
    Object.assign(f, { wp: null, target: null, cool: rand(0.5, 1), think: 0, stuck: 0, strafe: 1, strafeT: 0 });
  } else {
    Object.assign(f, { vy: 0, ammo: MAG, reloading: false, nextShot: 0 });
    yaw = t.dir > 0 ? Math.PI : 0;
    pitch = 0;
    $('msg').textContent = '';
  }
}

// ---- Match state --------------------------------------------------------------------
let state = 'title', locked = false, now = 0, timeLeft = MATCH_TIME, wantFire = false;
const score = { dock: 0, raid: 0 };
const keys = {};

function hurt(v, amount, by) {
  if (!v.alive || state !== 'playing') return;
  v.hp -= amount;
  if (!v.bot) { $('hurt').style.opacity = 1; setTimeout(() => ($('hurt').style.opacity = 0), 80); }
  if (v.hp > 0) return;
  v.hp = 0;
  v.alive = false;
  v.respawnAt = now + RESPAWN;
  if (v.bot) { v.mesh.rotation.x = -Math.PI / 2; v.pos.y = 0.3; }
  else $('msg').textContent = `Eliminated by ${by.name} — respawning…`;
  score[by.team]++;
  feed(`${by.name} ✕ ${v.name}`, by.team);
  if (score[by.team] >= WIN_KILLS) endMatch();
}

function resetMatch() {
  score.dock = score.raid = 0;
  now = 0;
  timeLeft = MATCH_TIME;
  $('feed').textContent = '';
  fighters.forEach(spawn);
  updateHud();
}

function endMatch() {
  state = 'over';
  const d = score.dock, r = score.raid;
  $('endText').textContent = d > r ? 'DOCK WINS' : r > d ? 'RAIDERS WIN' : 'DRAW';
  $('endScore').textContent = `Dock ${d} — ${r} Raiders`;
  $('end').hidden = false;
  $('pause').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
}

function begin(overlay) {
  $(overlay).hidden = true;
  resetMatch();
  state = 'playing';
  lock();
}

// ---- Input ----------------------------------------------------------------------------
function lock() {
  const p = canvas.requestPointerLock && canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('pause').hidden = locked || state !== 'playing';
});
$('pause').addEventListener('click', lock);
$('start').addEventListener('click', () => begin('title'));
$('restart').addEventListener('click', () => begin('end'));

document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch = clamp(pitch - e.movementY * 0.0022, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => { if (locked && e.button === 0) wantFire = true; });
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!locked) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (player.alive && player.ground) player.vy = 7;
  }
  if (e.code === 'KeyR') reload();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---- Player ---------------------------------------------------------------------------
function reload() {
  if (!player.alive || player.reloading || player.ammo === MAG) return;
  player.reloading = true;
  player.reloadEnd = now + 1.4;
}

function playerFire() {
  if (!player.alive || player.reloading || now < player.nextShot) return;
  if (player.ammo <= 0) return reload();
  player.ammo--;
  player.nextShot = now + 0.16;
  gun.position.z = -0.38; // recoil kick

  camera.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  ray.far = 300;
  const enemies = fighters.filter((f) => f.bot && f.alive && f.team !== player.team).flatMap((f) => f.parts);
  const hit = ray.intersectObjects(solids.concat(enemies), false)[0];
  const end = hit ? hit.point : ray.ray.at(300, new V3());
  tracer(gun.getWorldPosition(new V3()), end, 0xfff2a0);
  if (hit && hit.object.userData.f) {
    hurt(hit.object.userData.f, hit.object.userData.head ? 100 : 34, player);
    pulse('cross', 'hit', 120);
  }
  if (player.ammo === 0) reload();
}

function updatePlayer(dt) {
  if (!player.alive) {
    camera.position.set(player.pos.x, player.pos.y + 0.5, player.pos.z);
    return;
  }
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const move = new V3(-Math.sin(yaw) * fwd + Math.cos(yaw) * side, 0, -Math.cos(yaw) * fwd - Math.sin(yaw) * side);
  if (move.lengthSq() > 0) player.pos.addScaledVector(move.normalize(), 6 * dt);
  collide(player.pos, player.pos.y);

  const prevY = player.pos.y;
  player.vy -= 20 * dt;
  player.pos.y += player.vy * dt;
  const g = groundAt(player.pos, prevY);
  player.ground = player.pos.y <= g;
  if (player.ground) { player.pos.y = g; player.vy = 0; }

  if (player.reloading && now >= player.reloadEnd) { player.reloading = false; player.ammo = MAG; }
  gun.position.z += (-0.45 - gun.position.z) * Math.min(1, dt * 12);
  camera.position.set(player.pos.x, player.pos.y + 1.6, player.pos.z);
  camera.rotation.set(pitch, yaw, 0);
}

// ---- Bots -------------------------------------------------------------------------------
function pickWaypoint(b) {
  const dir = TEAM[b.team].dir, from = new V3(b.pos.x, 0.6, b.pos.z);
  const push = b.hp < 40 ? -0.6 : 0.6; // hurt bots fall back toward their own end
  let best = null, bestScore = -Infinity;
  for (const w of nav) {
    const d = w.distanceTo(b.pos);
    if (d < 3 || d > 16) continue;
    const s = (w.z - b.pos.z) * dir * push + Math.random() * 8;
    if (s > bestScore && clearLine(from, new V3(w.x, 0.6, w.z))) { bestScore = s; best = w; }
  }
  b.wp = best || nav[(Math.random() * nav.length) | 0];
  b.stuck = 0;
}

function botThink(b) {
  const from = eye(b);
  let target = null, bestD = 45;
  for (const e of fighters) {
    if (!e.alive || e.team === b.team) continue;
    const d = b.pos.distanceTo(e.pos);
    if (d < bestD && clearLine(from, eye(e))) { bestD = d; target = e; }
  }
  if (target && !b.target) b.cool = Math.max(b.cool, rand(0.35, 0.6)); // reaction time
  b.target = target;
  if (!b.wp || b.pos.distanceTo(b.wp) < 1 || b.stuck > 1.2) pickWaypoint(b);
}

function botShoot(b, t) {
  const a = eye(b), e = eye(t);
  if (!clearLine(a, e)) return; // never shoot without clear line of sight
  const d = a.distanceTo(e);
  const hit = Math.random() < clamp(0.8 - d / 60, 0.2, 0.7) * (t.bot ? 1 : 0.85);
  const end = hit ? e.clone().setY(e.y - 0.4) : e.clone().add(new V3(rand(-1, 1), rand(-0.6, 0.8), rand(-1, 1)));
  tracer(a, end, TEAM[b.team].tracer);
  if (hit) hurt(t, 10 + ((Math.random() * 7) | 0), b);
}

function updateBot(b, dt) {
  if ((b.think -= dt) <= 0) { b.think = 0.25; botThink(b); }
  const t = b.target && b.target.alive ? b.target : null;
  const move = new V3();
  if (t) {
    const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
    b.mesh.rotation.y = Math.atan2(dx, dz);
    if ((b.strafeT -= dt) <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.6, 1.5); }
    move.set(dz, 0, -dx).normalize().multiplyScalar(1.6 * b.strafe);
    if ((b.cool -= dt) <= 0) { b.cool = rand(0.55, 1.0); botShoot(b, t); }
  } else if (b.wp) {
    move.subVectors(b.wp, b.pos).setY(0);
    if (move.lengthSq() > 1e-4) {
      move.setLength(3.4);
      b.mesh.rotation.y = Math.atan2(move.x, move.z);
    }
  }
  const before = b.pos.clone();
  b.pos.addScaledVector(move, dt);
  collide(b.pos, 0);
  if (!t) b.stuck = b.pos.distanceTo(before) < 1.5 * dt ? b.stuck + dt : 0;
}

// ---- HUD & loop -----------------------------------------------------------------------
function updateHud() {
  $('sDock').textContent = score.dock;
  $('sRaid').textContent = score.raid;
  const s = Math.ceil(timeLeft);
  $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('hull').textContent = Math.max(0, Math.round(player.hp));
  $('ammo').textContent = player.reloading ? 'RELOADING' : player.ammo;
}

function step(dt) {
  now += dt;
  timeLeft = Math.max(0, timeLeft - dt);
  for (const f of fighters) if (!f.alive && now >= f.respawnAt) spawn(f);
  updatePlayer(dt);
  if (wantFire) playerFire();
  for (const f of fighters) if (f.bot && f.alive && state === 'playing') updateBot(f, dt);
  if (state === 'playing' && timeLeft <= 0) endMatch();
  updateHud();
}

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  wantFire = wantFire && state === 'playing' && locked;
  if (state === 'playing' && locked) step(dt);
  wantFire = false;
  if (state === 'title') { // slow fly-by behind the title card
    const a = t * 0.00005;
    camera.position.set(Math.sin(a) * 40, 22, Math.cos(a) * 75);
    camera.lookAt(0, 0, 0);
  }
  updateTracers(dt);
  renderer.render(scene, camera);
}

resetMatch();
requestAnimationFrame(frame);
