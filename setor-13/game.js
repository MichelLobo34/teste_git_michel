"use strict";

const byId = (id) => document.getElementById(id);
const canvas = byId("view");
const ctx = canvas.getContext("2d");
const { width, height } = canvas;
const horizon = height / 2;
const focal = width * 0.75;
const depth = new Float32Array(width);
const map = [
  "1111111111111111",
  "1000000000000031",
  "1022201110111001",
  "1000101000000001",
  "1110101022220101",
  "1000000000000101",
  "1011101110100001",
  "1000100010111101",
  "1020101000000001",
  "1000001002220101",
  "1011100000000001",
  "1111111111111111",
];
const keys = new Set();
let player, drones, supplies, state, cooldown, flash, hurt, notice, audio;

function tile(x, y) {
  return Number(map[Math.floor(y)]?.[Math.floor(x)] ?? 1);
}

function reset() {
  player = { x: 1.5, y: 1.5, angle: 0, health: 100, ammo: 12 };
  drones = [[6.5, 1.5], [4.5, 5.5], [10.5, 8.5], [13.5, 3.5]].map(([x, y]) => (
    { x, y, health: 2, wait: 0, hit: 0, kind: "drone" }
  ));
  supplies = [
    { x: 8.5, y: 5.5, kind: "ammo" },
    { x: 3.5, y: 9.5, kind: "med" },
    { x: 12.5, y: 8.5, kind: "ammo" },
    { x: 14.5, y: 9.5, kind: "med" },
  ];
  cooldown = flash = hurt = notice = 0;
  byId("message").textContent = "";
  updateHud();
}

function updateHud() {
  byId("health").textContent = player.health;
  byId("ammo").textContent = player.ammo;
  byId("remaining").textContent = drones.length;
}

function message(text) {
  byId("message").textContent = text;
  notice = 3;
}

function sound(frequency, end, duration, volume) {
  if (!audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(now + duration);
}

function ray(x, y, dx, dy) {
  let cellX = Math.floor(x);
  let cellY = Math.floor(y);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  const deltaX = Math.abs(1 / dx);
  const deltaY = Math.abs(1 / dy);
  let sideX = dx === 0 ? Infinity : (dx < 0 ? x - cellX : cellX + 1 - x) * deltaX;
  let sideY = dy === 0 ? Infinity : (dy < 0 ? y - cellY : cellY + 1 - y) * deltaY;
  let distance, side, wall;
  do {
    side = sideX < sideY ? 0 : 1;
    if (side === 0) {
      cellX += stepX;
      distance = sideX;
      sideX += deltaX;
    } else {
      cellY += stepY;
      distance = sideY;
      sideY += deltaY;
    }
    wall = tile(cellX, cellY);
  } while (!wall);
  const impact = side === 0 ? y + dy * distance : x + dx * distance;
  return { distance, side, wall, u: impact - Math.floor(impact) };
}

function move(actor, dx, dy, radius) {
  const clear = (x, y) => !tile(x - radius, y - radius) && !tile(x + radius, y - radius)
    && !tile(x - radius, y + radius) && !tile(x + radius, y + radius);
  if (clear(actor.x + dx, actor.y)) actor.x += dx;
  if (clear(actor.x, actor.y + dy)) actor.y += dy;
}

function shoot() {
  if (cooldown > 0) return;
  cooldown = 0.24;
  if (!player.ammo) {
    message("Sem carga. Procure uma bateria.");
    sound(110, 65, 0.08, 0.12);
    return;
  }
  player.ammo--;
  flash = 0.10;
  sound(210, 53, 0.16, 0.19);
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  let nearest = ray(player.x, player.y, dx, dy).distance;
  let target;
  for (const drone of drones) {
    const x = drone.x - player.x;
    const y = drone.y - player.y;
    const forward = x * dx + y * dy;
    const offset = Math.abs(y * dx - x * dy);
    if (forward > 0 && forward < nearest && offset < 0.30) {
      nearest = forward;
      target = drone;
    }
  }
  if (target) {
    target.hit = 0.14;
    target.health--;
    drones = drones.filter((drone) => drone.health > 0);
    if (drones.length === 0) message("Saída verde liberada.");
  }
  updateHud();
}

function show(next, title, brief, button) {
  state = next;
  keys.clear();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  byId("title").textContent = title;
  byId("brief").textContent = brief;
  byId("start").textContent = button;
  byId("overlay").hidden = false;
}

function update(dt) {
  cooldown -= dt;
  flash -= dt;
  hurt -= dt;
  if (notice > 0 && (notice -= dt) <= 0) byId("message").textContent = "";
  player.angle += (Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"))) * dt * 2.4;
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  const forward = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const strafe = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  const speed = 2.65 * dt / (Math.hypot(forward, strafe) || 1);
  move(player, (forward * dx - strafe * dy) * speed, (forward * dy + strafe * dx) * speed, 0.18);
  if (keys.has("Space")) shoot();

  for (const drone of drones) {
    drone.hit -= dt;
    drone.wait -= dt;
    const x = player.x - drone.x;
    const y = player.y - drone.y;
    const distance = Math.hypot(x, y);
    if (distance > 6 || distance < 0.001 || ray(drone.x, drone.y, x, y).distance < 1) continue;
    if (distance > 0.72) {
      move(drone, x / distance * dt * 1.18, y / distance * dt * 1.18, 0.20);
    } else if (drone.wait <= 0) {
      drone.wait = 0.85;
      player.health = Math.max(0, player.health - 14);
      hurt = 0.25;
      sound(95, 36, 0.18, 0.18);
      updateHud();
    }
  }
  if (!player.health) {
    show("lost", "SINAL PERDIDO", "Os drones tomaram o setor.", "Tentar de novo");
    return;
  }
  supplies = supplies.filter((item) => {
    if (Math.hypot(item.x - player.x, item.y - player.y) > 0.48) return true;
    if (item.kind === "med" && player.health === 100) return true;
    if (item.kind === "med") player.health = Math.min(100, player.health + 35);
    else player.ammo += 8;
    message(item.kind === "med" ? "Vida restaurada." : "Bateria coletada. +8 de carga.");
    sound(300, 620, 0.18, 0.12);
    updateHud();
    return false;
  });
  if (Math.hypot(player.x - 14.5, player.y - 1.5) < 1.05) {
    if (drones.length === 0) show("won", "MISSÃO CUMPRIDA", "Você desativou os drones e evacuou o Setor 13.", "Jogar de novo");
    else if (notice <= 0) message("Desative todos os drones para liberar a saída.");
  }
}

function sprite(paint) {
  const asset = document.createElement("canvas");
  asset.width = asset.height = 32;
  const brush = asset.getContext("2d");
  paint((color, ...rect) => {
    brush.fillStyle = color;
    brush.fillRect(...rect);
  });
  return asset;
}

const droneSprite = (hit) => sprite((box) => {
  box("#131d24", 2, 11, 28, 14);
  box("#18252e", 9, 6, 14, 22);
  box(hit ? "#ffa66d" : "#557884", 6, 9, 20, 12);
  box("#24424b", 7, 18, 18, 6);
  box("#9fb8bc", 11, 8, 10, 2);
  box("#ff613d", 11, 13, 10, 4);
  box("#fff7bc", 14, 14, 4, 2);
  box("#68ead6", 3, 21, 4, 4);
  box("#68ead6", 25, 21, 4, 4);
});
const sprites = {
  drone: droneSprite(false),
  hit: droneSprite(true),
  ammo: sprite((box) => {
    box("#14242e", 4, 9, 24, 18);
    box("#bc7933", 6, 11, 20, 14);
    box("#ffd67c", 9, 13, 4, 10);
    box("#ffd67c", 16, 13, 4, 10);
  }),
  med: sprite((box) => {
    box("#173735", 4, 9, 24, 18);
    box("#5bc2a8", 6, 11, 20, 14);
    box("#ecfff5", 14, 13, 4, 10);
    box("#ecfff5", 11, 16, 10, 4);
  }),
};

function render(time) {
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#0b141e";
  ctx.fillRect(0, 0, width, horizon);
  const floor = ctx.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, "#111c20");
  floor.addColorStop(1, "#324048");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, width, horizon);
  ctx.fillStyle = "#10191e";
  for (let row = 1; row <= 12; row++) ctx.fillRect(0, horizon + focal / (row * 3), width, 1);

  for (let col = 0; col < width; col++) {
    const plane = (col + 0.5 - width / 2) / focal;
    const hit = ray(player.x, player.y, dx - dy * plane, dy + dx * plane);
    const distance = Math.max(0.02, hit.distance);
    depth[col] = distance;
    const size = focal / distance;
    const top = horizon - size / 2;
    const exit = hit.wall === 3;
    const seam = hit.u < 0.035 || hit.u > 0.965;
    const light = Math.max(12, 46 / (1 + distance * 0.12) - hit.side * 8 - (seam ? 13 : 0));
    ctx.fillStyle = `hsl(${exit ? 157 : hit.wall === 2 ? 28 : 200}, ${exit ? 64 : 24}%, ${light}%)`;
    ctx.fillRect(col, top, 1, size);
    ctx.fillStyle = "#06131955";
    for (const stripe of [0.10, 0.48, 0.89]) ctx.fillRect(col, top + size * stripe, 1, Math.max(1, size * 0.024));
    if (exit && hit.u > 0.2 && hit.u < 0.8) {
      ctx.fillStyle = drones.length ? "#ec8a4b" : "#7affb1";
      ctx.fillRect(col, top + size * 0.18, 1, size * 0.05);
    }
  }

  const objects = [...drones, ...supplies].map((item) => {
    const x = item.x - player.x;
    const y = item.y - player.y;
    return { item, z: x * dx + y * dy, side: y * dx - x * dy };
  }).filter(({ z }) => z > 0.12).sort((a, b) => b.z - a.z);
  for (const { item, z, side } of objects) {
    const drone = item.kind === "drone";
    const size = focal / z * (drone ? 0.85 : 0.44);
    const left = width / 2 + focal * side / z - size / 2;
    const top = drone ? horizon - size * 0.52 + Math.sin(time * 0.006 + item.x) * size * 0.045
      : horizon + focal / z * 0.21;
    const asset = sprites[item.hit > 0 ? "hit" : item.kind];
    for (let col = Math.max(0, Math.ceil(left)); col < Math.min(width, left + size); col++) {
      if (z >= depth[col]) continue;
      const source = Math.floor((col - left) / size * 32);
      ctx.drawImage(asset, source, 0, 1, 32, col, top, 1, size);
    }
  }

  const bob = Math.sin(time * 0.015) * (["KeyW", "KeyA", "KeyS", "KeyD"].some((key) => keys.has(key)) ? 3 : 0);
  ctx.save();
  ctx.translate(width / 2, height + bob + (flash > 0 ? 7 : 0));
  ctx.fillStyle = "#19252d";
  ctx.fillRect(-38, -37, 76, 48);
  ctx.fillStyle = "#344953";
  ctx.fillRect(-22, -58, 44, 62);
  ctx.fillStyle = "#617e88";
  ctx.fillRect(-17, -61, 34, 12);
  ctx.fillStyle = "#74eacf";
  ctx.fillRect(-13, -29, 26 * Math.min(1, player.ammo / 12), 4);
  if (flash > 0) {
    ctx.fillStyle = "#ffdc80";
    ctx.fillRect(-9, -85, 18, 24);
    ctx.fillStyle = "#fff8d2";
    ctx.fillRect(-4, -78, 8, 17);
  }
  ctx.restore();
  ctx.fillStyle = "#dcffed";
  ctx.fillRect(width / 2 - 4, horizon, 9, 1);
  ctx.fillRect(width / 2, horizon - 4, 1, 9);
  if (hurt > 0) {
    ctx.fillStyle = `rgba(218, 44, 32, ${hurt * 1.4})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function pause() {
  if (state === "playing") show("paused", "PAUSA", "A missão está pausada.", "Continuar");
}

byId("start").addEventListener("click", () => {
  if (state !== "paused") reset();
  byId("overlay").hidden = true;
  state = "playing";
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio) {
    audio ??= new Audio();
    audio.resume().catch(() => {});
  }
  const lock = canvas.requestPointerLock?.();
  lock?.catch?.(() => {});
});
canvas.addEventListener("mousedown", (event) => {
  if (state !== "playing" || event.button !== 0) return;
  const lock = document.pointerLockElement !== canvas ? canvas.requestPointerLock?.() : undefined;
  lock?.catch?.(() => {});
  shoot();
});
document.addEventListener("mousemove", (event) => {
  if (state === "playing" && document.pointerLockElement === canvas) player.angle += event.movementX * 0.003;
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas) pause();
});
window.addEventListener("blur", pause);
window.addEventListener("keydown", (event) => {
  if (state !== "playing") return;
  if (["Space", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if ((event.code === "KeyP" || event.code === "Escape") && !event.repeat) pause();
  else keys.add(event.code);
});
window.addEventListener("keyup", (event) => keys.delete(event.code));

state = "ready";
reset();
let previous = performance.now();
function frame(now) {
  if (state === "playing") update(Math.min(0.05, (now - previous) / 1000));
  render(now);
  previous = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
