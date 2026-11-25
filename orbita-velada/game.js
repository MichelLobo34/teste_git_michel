"use strict";

const byId = (id) => document.getElementById(id);
const canvas = byId("field");
const ctx = canvas.getContext("2d");
const { width, height } = canvas;
const keyboard = new Set();
const pointers = new Map();
const stars = Array.from({ length: 90 }, (_, i) => ({
  x: (i * 137.519) % width,
  y: (i * i * 13.73) % height,
  speed: 12 + (i % 7) * 9,
  size: i % 9 === 0 ? 2 : 1,
}));
const colors = ["#f6a375", "#edcc83", "#82dfb9"];
const player = { x: width / 2, y: height - 43, shield: 0 };
let state = "ready";
let score = 0;
let wave = 0;
let lives = 3;
let elapsed = 0;
let diveTimer = 0;
let shotTimer = 0;
let nextWave = 0;
let enemies = [];
let shots = [];
let bolts = [];
let bursts = [];

function hud() {
  byId("score").textContent = String(score).padStart(6, "0");
  byId("wave").textContent = String(wave || 1).padStart(2, "0");
  byId("lives").textContent = lives;
}

function spawnWave() {
  wave++;
  elapsed = 0;
  diveTimer = 2;
  nextWave = 1.4;
  bolts = [];
  shots = [];
  enemies = Array.from({ length: 24 }, (_, i) => {
    const row = Math.floor(i / 8);
    const homeX = 91 + (i % 8) * 34;
    return {
      row, homeX, homeY: 91 + row * 34,
      x: homeX, y: -30, entry: i * 0.045,
      hp: row === 0 ? 2 : 1, dive: null, flash: 0,
    };
  });
  hud();
}

function overlay(next, title, detail, action) {
  state = next;
  keyboard.clear();
  pointers.clear();
  byId("title").textContent = title;
  byId("brief").textContent = detail;
  byId("start").textContent = action;
  byId("overlay").hidden = false;
}

function pause() {
  if (state === "playing") overlay("paused", "PAUSA", "Sua nave está em espera.", "Continuar");
}

function start() {
  if (state === "playing") return;
  if (state !== "paused") {
    score = wave = shotTimer = 0;
    lives = 3;
    player.x = width / 2;
    player.shield = 0;
    bursts = [];
    spawnWave();
  }
  state = "playing";
  byId("overlay").hidden = true;
}

function pressed(code) {
  return keyboard.has(code) || [...pointers.values()].includes(code);
}

function burst(x, y, color) {
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    const speed = 24 + 17 * (i % 4);
    bursts.push({ x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: 0.4, color });
  }
}

function hitPlayer() {
  if (player.shield > 0 || state !== "playing") return;
  lives--;
  player.shield = 2;
  burst(player.x, player.y, "#aaffcf");
  hud();
  if (lives === 0) overlay("lost", "FIM DE JOGO", `Você marcou ${score} pontos e chegou à onda ${wave}.`, "Jogar de novo");
}

function moveEnemies(dt) {
  const sway = Math.sin(elapsed * (1.6 + Math.min(wave, 9) * 0.1)) * 38;
  diveTimer -= dt;
  if (diveTimer <= 0 && elapsed > 1.8) {
    const active = enemies.filter((enemy) => enemy.dive === null);
    if (active.length) {
      const enemy = active[Math.floor(Math.random() * active.length)];
      enemy.dive = { time: 0, x: enemy.x, y: enemy.y, steer: player.x, fired: false };
      diveTimer = Math.max(0.48, 1.65 - wave * 0.13);
    }
  }
  for (const enemy of enemies) {
    enemy.flash -= dt;
    const targetX = enemy.homeX + sway;
    const targetY = enemy.homeY + Math.sin(elapsed * 2 + enemy.row * 0.7) * 5;
    if (enemy.dive) {
      const dive = enemy.dive;
      dive.time += dt * (0.46 + Math.min(0.26, wave * 0.026));
      const t = dive.time;
      if (t >= 1) enemy.dive = null;
      else {
        const swing = Math.sin(Math.PI * t);
        enemy.x = dive.x * (1 - t) + targetX * t + (dive.steer - dive.x) * swing * 0.85
          + Math.sin(t * Math.PI * 2) * 24;
        enemy.y = dive.y * (1 - t) + targetY * t + (height - 62 - dive.y) * swing;
        if (!dive.fired && t >= 0.26) {
          dive.fired = true;
          const flight = Math.max(0.15, (player.y - enemy.y) / 195);
          bolts.push({ x: enemy.x, y: enemy.y, dx: Math.max(-135, Math.min(135, (player.x - enemy.x) / flight)) });
        }
      }
    } else {
      const t = Math.max(0, Math.min(1, (elapsed - enemy.entry) / 0.65));
      enemy.x = targetX + (1 - t) * (enemy.homeX < width / 2 ? -65 : 65);
      enemy.y = -30 + (targetY + 30) * (1 - (1 - t) ** 2);
    }
    if (Math.abs(enemy.x - player.x) < 20 && Math.abs(enemy.y - player.y) < 17) hitPlayer();
  }
}

function update(dt) {
  elapsed += dt;
  player.shield -= dt;
  shotTimer -= dt;
  const right = pressed("ArrowRight") || pressed("KeyD");
  const left = pressed("ArrowLeft") || pressed("KeyA");
  player.x = Math.max(18, Math.min(width - 18, player.x + (Number(right) - Number(left)) * 272 * dt));
  if (pressed("Space") && shotTimer <= 0) {
    shotTimer = 0.19;
    shots.push({ x: player.x, y: player.y - 16 });
  }

  moveEnemies(dt);
  shots = shots.filter((shot) => {
    shot.y -= 475 * dt;
    const enemy = enemies.find((item) => item.hp > 0 && Math.abs(item.x - shot.x) < 14
      && Math.abs(item.y - shot.y) < 13);
    if (!enemy) return shot.y > -12;
    enemy.hp--;
    enemy.flash = 0.13;
    if (enemy.hp === 0) {
      score += (enemy.dive ? 200 : 80) + (2 - enemy.row) * 30;
      burst(enemy.x, enemy.y, colors[enemy.row]);
      hud();
    }
    return false;
  });
  enemies = enemies.filter((enemy) => enemy.hp > 0);
  bolts = bolts.filter((bolt) => {
    bolt.x += bolt.dx * dt;
    bolt.y += 195 * dt;
    if (Math.abs(bolt.x - player.x) < 13 && Math.abs(bolt.y - player.y) < 12) {
      hitPlayer();
      return false;
    }
    return bolt.y < height + 10 && bolt.x > -10 && bolt.x < width + 10;
  });
  for (const spark of bursts) {
    spark.x += spark.dx * dt;
    spark.y += spark.dy * dt;
    spark.life -= dt;
  }
  bursts = bursts.filter((spark) => spark.life > 0);
  if (state === "playing" && enemies.length === 0 && (nextWave -= dt) <= 0) spawnWave();
}

function polygon(color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function draw(time) {
  ctx.fillStyle = "#091218";
  ctx.fillRect(0, 0, width, height);
  for (const star of stars) {
    ctx.fillStyle = star.size === 2 ? "#99b6ad" : "#496260";
    ctx.fillRect(star.x, (star.y + time * star.speed / 1000) % height, star.size, star.size);
  }
  ctx.strokeStyle = "#29443e";
  ctx.beginPath();
  ctx.ellipse(width / 2, height + 106, 360, 151, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const color = enemy.flash > 0 ? "#fff5dc" : colors[enemy.row];
    polygon(color, [[-15, -5], [-8, -9], [0, -4], [8, -9], [15, -5], [11, 7], [0, 13], [-11, 7]]);
    polygon("#26353a", [[-8, -3], [0, 1], [8, -3], [5, 5], [0, 8], [-5, 5]]);
    if (enemy.hp > 1) {
      ctx.fillStyle = "#fff2cf";
      ctx.fillRect(-2, -3, 4, 4);
    }
    ctx.restore();
  }
  ctx.fillStyle = "#a8ffcb";
  for (const shot of shots) ctx.fillRect(shot.x - 2, shot.y - 8, 4, 13);
  ctx.fillStyle = "#ff9775";
  for (const bolt of bolts) ctx.fillRect(bolt.x - 2, bolt.y - 5, 4, 10);
  for (const spark of bursts) {
    ctx.globalAlpha = spark.life / 0.4;
    ctx.fillStyle = spark.color;
    ctx.fillRect(spark.x, spark.y, 3, 3);
  }
  ctx.globalAlpha = 1;
  if (lives && (player.shield <= 0 || Math.floor(time / 80) % 2 === 0)) {
    ctx.save();
    ctx.translate(player.x, player.y);
    polygon("#70d5ae", [[0, -18], [7, -5], [19, 9], [9, 8], [0, 13], [-9, 8], [-19, 9], [-7, -5]]);
    polygon("#d9f9df", [[0, -10], [5, 2], [0, 6], [-5, 2]]);
    ctx.fillStyle = "#f2bc72";
    ctx.fillRect(-2, 13, 4, 5 + Math.floor(time / 65) % 4);
    ctx.restore();
  }
  if (state === "playing" && enemies.length === 0) {
    ctx.fillStyle = "#e9dfb6";
    ctx.font = "bold 19px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FORMAÇÃO DESTRUÍDA", width / 2, height / 2);
  }
}

byId("start").addEventListener("click", start);
byId("pause").addEventListener("click", pause);
window.addEventListener("blur", pause);
window.addEventListener("keydown", (event) => {
  if (state === "paused" && event.code === "KeyP" && !event.repeat) {
    start();
    return;
  }
  if (state !== "playing") return;
  if (event.code === "KeyP" || event.code === "Escape") {
    if (!event.repeat) pause();
    return;
  }
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space"].includes(event.code)) {
    event.preventDefault();
    keyboard.add(event.code);
  }
});
window.addEventListener("keyup", (event) => keyboard.delete(event.code));
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", (event) => {
    if (state !== "playing" || event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.key);
    if (button.dataset.key === "Space" && shotTimer <= 0) {
      shotTimer = 0.19;
      shots.push({ x: player.x, y: player.y - 16 });
    }
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, (event) => pointers.delete(event.pointerId));
  }
}

let previous = performance.now();
function frame(time) {
  if (state === "playing") update(Math.min(0.033, (time - previous) / 1000));
  draw(time);
  previous = time;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
