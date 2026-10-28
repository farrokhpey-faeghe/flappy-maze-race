"use strict";
const HEIGHT = 540,
  SPEED = 145,
  GRAVITY = 900,
  FLAP = -310,
  RADIUS = 13;
const FINISH = 9800;
const centers = [
  280, 220, 310, 240, 330, 260, 190, 280, 350, 270, 210, 300, 230, 320, 250,
  180, 270, 340, 250, 210, 300, 240, 320, 250,
];
const obstacles = centers.map((center, i) => ({
  x: 650 + i * 370,
  w: i % 4 === 3 ? 150 : 64,
  top: center - (i < 6 ? 112 : 98),
  bottom: center + (i < 6 ? 112 : 98),
  type: i % 4 === 3 ? "tunnel" : "gate",
}));
const checkpoints = [100, 2070, 4290, 6510, 8730];
const course = {
  height: HEIGHT,
  speed: SPEED,
  gravity: GRAVITY,
  flap: FLAP,
  radius: RADIUS,
  finish: FINISH,
  obstacles,
  checkpoints,
};
function resetPlayer(p) {
  Object.assign(p, {
    x: 100,
    y: 270,
    vy: 0,
    checkpoint: 0,
    crashes: 0,
    respawnUntil: 0,
    invulnerableUntil: 0,
    finishTime: null,
    lastFlap: -Infinity,
    inputSeq: 0,
  });
}
function flap(p, now, seq) {
  if (
    !Number.isSafeInteger(seq) ||
    seq <= p.inputSeq ||
    now - p.lastFlap < 110 ||
    now < p.respawnUntil ||
    p.finishTime !== null
  )
    return false;
  p.inputSeq = seq;
  p.lastFlap = now;
  p.vy = FLAP;
  return true;
}
function stepPlayer(p, dt, now) {
  if (p.finishTime !== null || now < p.respawnUntil) return null;
  p.x += SPEED * dt;
  p.vy = Math.min(480, p.vy + GRAVITY * dt);
  p.y += p.vy * dt;
  const boundary = p.y - RADIUS < 0 || p.y + RADIUS > HEIGHT;
  const wall = obstacles.some(
    (o) =>
      p.x + RADIUS > o.x &&
      p.x - RADIUS < o.x + o.w &&
      (p.y - RADIUS < o.top || p.y + RADIUS > o.bottom),
  );
  if (boundary || (wall && now >= p.invulnerableUntil)) {
    p.crashes++;
    p.x = checkpoints[p.checkpoint];
    p.y = 270;
    p.vy = 0;
    p.respawnUntil = now + 750;
    p.invulnerableUntil = now + 1500;
    return "crash";
  }
  for (let i = p.checkpoint + 1; i < checkpoints.length; i++)
    if (p.x >= checkpoints[i]) p.checkpoint = i;
  return p.x >= FINISH ? "finish" : null;
}
module.exports = { course, resetPlayer, flap, stepPlayer };
