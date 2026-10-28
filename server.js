"use strict";
const express = require("express");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { Server } = require("socket.io");
const { course, resetPlayer, flap, stepPlayer } = require("./game");
function createGameServer(options = {}) {
  const app = express(),
    server = http.createServer(app),
    io = new Server(server, {
      maxHttpBufferSize: 4096,
      transports: ["websocket", "polling"],
    }),
    rooms = new Map();
  const clock = options.clock || Date.now;
  const countdownMs = options.countdownMs ?? 3000;
  const graceMs = options.graceMs ?? 30000;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  app.get("/api/course", (_req, res) => res.json(course));
  app.use(express.static(__dirname + "/public"));
  const cleanName = (n) =>
    typeof n === "string"
      ? n
          .trim()
          .replace(/[<>\x00-\x1f]/g, "")
          .slice(0, 20) || "Pilot"
      : "Pilot";
  function snapshot(r) {
    return {
      code: r.code,
      phase: r.phase,
      startAt: r.startAt,
      serverNow: clock(),
      winner: r.winner,
      reason: r.reason,
      race: r.race,
      players: r.players.map(
        ({
          id,
          name,
          connected,
          ready,
          x,
          y,
          vy,
          checkpoint,
          crashes,
          respawnUntil,
          invulnerableUntil,
          finishTime,
          inputSeq,
        }) => ({
          id,
          name,
          connected,
          ready,
          x,
          y,
          vy,
          checkpoint,
          crashes,
          respawnUntil,
          invulnerableUntil,
          finishTime,
          inputSeq,
        }),
      ),
    };
  }
  function broadcast(r) {
    io.to(r.code).emit("state", snapshot(r));
  }
  function finish(r, p, reason) {
    r.phase = "results";
    r.winner = p?.id || null;
    r.reason = reason;
    r.updated = clock();
    broadcast(r);
  }
  function remove(r, p) {
    r.players = r.players.filter((q) => q !== p);
    if (r.phase === "countdown") {
      r.phase = "lobby";
      r.players.forEach((q) => (q.ready = false));
    }
    if (r.phase === "race")
      finish(
        r,
        r.players.find((q) => q.connected),
        "Opponent left",
      );
    broadcast(r);
    if (!r.players.length) rooms.delete(r.code);
  }
  io.on("connection", (socket) => {
    let room = null,
      player = null;
    let budget = 30,
      refill = clock();
    socket.use((_packet, next) => {
      const now = clock();
      budget = Math.min(30, budget + (now - refill) * 0.02);
      refill = now;
      if (budget < 1) return next(new Error("Too many requests"));
      budget--;
      next();
    });
    const ack = (fn, result) => {
      if (typeof fn === "function") fn(result);
    };
    socket.on("enter", (data = {}, cb) => {
      if (room) return ack(cb, { error: "You are already in a room." });
      if (!data || typeof data !== "object")
        return ack(cb, { error: "Invalid request." });
      const code =
        typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
      let r;
      if (data.create) {
        if (rooms.size >= 1000)
          return ack(cb, { error: "Server is full. Try again later." });
        let c;
        do {
          c = randomBytes(3).toString("hex").toUpperCase();
        } while (rooms.has(c));
        r = {
          code: c,
          players: [],
          phase: "lobby",
          startAt: 0,
          winner: null,
          reason: null,
          race: 0,
          updated: clock(),
        };
        rooms.set(c, r);
      } else {
        if (!/^[A-F0-9]{6}$/.test(code))
          return ack(cb, { error: "Enter a valid six-character room code." });
        r = rooms.get(code);
        if (!r)
          return ack(cb, {
            error: "Room not found or expired. Create a new room.",
          });
      }
      let p =
        typeof data.token === "string"
          ? r.players.find((q) => q.token === data.token)
          : null;
      if (p?.connected)
        return ack(cb, {
          error: "This pilot is already connected in another tab.",
        });
      if (!p) {
        if (r.players.length >= 2)
          return ack(cb, { error: "This room is full (two pilots maximum)." });
        if (r.phase !== "lobby")
          return ack(cb, { error: "This race has already started." });
        p = {
          id: randomBytes(8).toString("hex"),
          token: randomBytes(24).toString("hex"),
          name: cleanName(data.name),
          connected: true,
          ready: false,
        };
        resetPlayer(p);
        r.players.push(p);
      }
      p.connected = true;
      p.disconnectedAt = null;
      p.socket = socket.id;
      room = r;
      player = p;
      socket.join(r.code);
      r.updated = clock();
      ack(cb, {
        id: p.id,
        token: p.token,
        code: r.code,
        course,
        state: snapshot(r),
      });
      broadcast(r);
    });
    socket.on("ready", (_, cb) => {
      if (!room || !player) return;
      const r = room;
      if (r.phase !== "lobby" && r.phase !== "results") return;
      player.ready = !player.ready;
      if (
        r.players.length === 2 &&
        r.players.every((p) => p.connected && p.ready)
      ) {
        r.race++;
        r.phase = "countdown";
        r.startAt = clock() + countdownMs;
        r.winner = null;
        r.reason = null;
        r.players.forEach((p) => {
          resetPlayer(p);
          p.ready = false;
        });
      }
      broadcast(r);
      ack(cb, { ok: true });
    });
    socket.on("flap", (data) => {
      if (room?.phase === "race" && player?.connected)
        flap(player, clock(), data?.seq);
    });
    socket.on("rename", (name) => {
      if (player && room?.phase === "lobby") {
        player.name = cleanName(name);
        broadcast(room);
      }
    });
    socket.on("leave", (_, cb) => {
      if (room && player) {
        const r = room,
          p = player;
        socket.leave(r.code);
        room = null;
        player = null;
        remove(r, p);
      }
      ack(cb, { ok: true });
    });
    socket.on("pingClock", (_, cb) => ack(cb, { now: clock() }));
    socket.on("disconnect", () => {
      if (!player || !room) return;
      player.connected = false;
      player.ready = false;
      player.disconnectedAt = clock();
      if (room.phase === "countdown") {
        room.phase = "lobby";
        room.players.forEach((p) => (p.ready = false));
      }
      broadcast(room);
    });
  });
  let previous = clock(),
    accumulator = 0,
    ticks = 0;
  function tick() {
    const now = clock();
    accumulator += Math.min(250, Math.max(0, now - previous));
    previous = now;
    for (const r of rooms.values()) {
      for (const p of [...r.players])
        if (!p.connected && now - p.disconnectedAt >= graceMs) remove(r, p);
      if (!rooms.has(r.code)) continue;
      if (r.phase === "countdown" && now >= r.startAt) r.phase = "race";
      if (r.phase === "race" && now - r.startAt > 300000)
        finish(r, null, "Five-minute race limit reached");
      if (now - r.updated > 1800000 && r.phase !== "race") {
        io.to(r.code).emit("expired");
        io.in(r.code).disconnectSockets(true);
        rooms.delete(r.code);
      }
    }
    while (accumulator >= 1000 / 60) {
      accumulator -= 1000 / 60;
      for (const r of rooms.values())
        if (r.phase === "race") {
          const finishers = [];
          for (const p of r.players) {
            if (!p.connected) continue;
            const event = stepPlayer(p, 1 / 60, now);
            if (event === "finish") {
              p.finishTime =
                (now - r.startAt) / 1000 - (p.x - course.finish) / course.speed;
              finishers.push(p);
            }
          }
          if (finishers.length) {
            finishers.sort((a, b) => b.x - a.x);
            const tied =
              finishers.length > 1 &&
              Math.abs(finishers[0].x - finishers[1].x) < 0.001;
            finish(
              r,
              tied ? null : finishers[0],
              tied ? "Photo finish — dead heat" : "Finish line crossed",
            );
          }
        }
    }
    if (++ticks % 3 === 0) for (const r of rooms.values()) broadcast(r);
  }
  const interval = options.manual ? null : setInterval(tick, 1000 / 60);
  return {
    app,
    server,
    io,
    rooms,
    tick,
    close: () =>
      new Promise((resolve) => {
        clearInterval(interval);
        io.close(() => server.close(() => resolve()));
      }),
  };
}
if (require.main === module) {
  const game = createGameServer();
  game.server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
    console.log(`Flappy Maze Race listening on ${process.env.PORT || 3000}`),
  );
}
module.exports = { createGameServer };
