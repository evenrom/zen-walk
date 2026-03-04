// app.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbzvzel3haBRBiJFQcxiwoL1rIIHdrLCb4mmWfkUcVSIB5xSFGDSYrgDaio7YV7spKV8CQ/exec";

// --- Game State & Data ---
const GAME_STATE = {
  START: 0,
  PLAYING: 1,
  PAUSED: 2
};

let currentState = GAME_STATE.START;

const TILE_SIZE = 32;
let canvas, ctx;
let lastTime = 0;
let cameraX = 0, cameraY = 0;

// User Data
let userProfile = {
  username: "",
  gender: "",
  petType: "None"
};

let gameStats = {
  totalSteps: 0,
  destroyedElements: {}
};

// Sync Logic
let stepsSinceSync = 0;
const SYNC_THRESHOLD = 100;

// World Data (Amnesia Map)
let activeTiles = {}; // "x,y" -> { type, destructible, multiTileParent }
const OFF_SCREEN_BUFFER = 2; // Extra tiles rendered outside view

// Entities
let player = { x: 0, y: 0, dir: 'down', state: 'idle', frame: 0, moveQueue: [] };
let sidekick = { x: 0, y: 0, dir: 'down', state: 'idle', frame: 0, active: false, queue: [] };
let particles = [];

// Input
let keys = { up: false, down: false, left: false, right: false, a: false, b: false };

// Audio Context
let audioCtx;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// --- Initialization ---
window.onload = () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setupDOM();
  setupControls();

  loadLocalData();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      syncData();
    }
  });

  requestAnimationFrame(gameLoop);
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function setupDOM() {
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', () => {
    const usernameInput = document.getElementById('username').value.trim();
    if (!usernameInput) {
      alert("Please enter a username.");
      return;
    }
    userProfile.username = usernameInput;
    userProfile.gender = document.getElementById('gender').value;
    userProfile.petType = document.getElementById('petType').value;

    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gamepad').classList.remove('hidden');

    if (userProfile.petType !== "None") {
      sidekick.active = true;
      sidekick.x = player.x; // Start on top of player
      sidekick.y = player.y;
    }

    initAudio();
    currentState = GAME_STATE.PLAYING;
  });

  const btnB = document.getElementById('btnB');
  btnB.addEventListener('touchstart', (e) => {
    e.preventDefault();
    togglePause();
  });
  // Also bind mousedown for desktop testing/verification
  btnB.addEventListener('mousedown', (e) => {
    e.preventDefault();
    togglePause();
  });

  const closeStatsBtn = document.getElementById('closeStatsBtn');
  closeStatsBtn.addEventListener('click', () => {
    togglePause();
  });
}

function togglePause() {
  if (currentState === GAME_STATE.PLAYING) {
    currentState = GAME_STATE.PAUSED;
    document.getElementById('statsOverlay').classList.remove('hidden');
    updateStatsUI();
  } else if (currentState === GAME_STATE.PAUSED) {
    currentState = GAME_STATE.PLAYING;
    document.getElementById('statsOverlay').classList.add('hidden');
  }
}

function updateStatsUI() {
  document.getElementById('totalSteps').textContent = gameStats.totalSteps;
  const list = document.getElementById('destroyedElementsList');
  list.innerHTML = "";
  for (const [key, value] of Object.entries(gameStats.destroyedElements)) {
    const p = document.createElement('p');
    p.textContent = `${key}: ${value}`;
    list.appendChild(p);
  }
}

function setupControls() {
  const mapControl = (id, keyName) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[keyName] = true; el.classList.add('active'); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); keys[keyName] = false; el.classList.remove('active'); });
    // Also bind mousedown/up for desktop testing
    el.addEventListener('mousedown', (e) => { keys[keyName] = true; el.classList.add('active'); });
    el.addEventListener('mouseup', (e) => { keys[keyName] = false; el.classList.remove('active'); });
    el.addEventListener('mouseleave', (e) => { keys[keyName] = false; el.classList.remove('active'); });
  };

  mapControl('btnUp', 'up');
  mapControl('btnDown', 'down');
  mapControl('btnLeft', 'left');
  mapControl('btnRight', 'right');

  const btnA = document.getElementById('btnA');
  btnA.addEventListener('touchstart', (e) => {
    e.preventDefault();
    btnA.classList.add('active');
    handleActionA();
  });
  btnA.addEventListener('touchend', (e) => {
    e.preventDefault();
    btnA.classList.remove('active');
  });

  // Keyboard fallback
  window.addEventListener('keydown', (e) => {
    switch(e.key) {
      case 'ArrowUp': case 'w': keys.up = true; break;
      case 'ArrowDown': case 's': keys.down = true; break;
      case 'ArrowLeft': case 'a': keys.left = true; break;
      case 'ArrowRight': case 'd': keys.right = true; break;
      case 'x': case 'Enter': handleActionA(); break;
      case 'z': case 'Escape': togglePause(); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    switch(e.key) {
      case 'ArrowUp': case 'w': keys.up = false; break;
      case 'ArrowDown': case 's': keys.down = false; break;
      case 'ArrowLeft': case 'a': keys.left = false; break;
      case 'ArrowRight': case 'd': keys.right = false; break;
    }
  });
}

// --- Data & Sync ---
function loadLocalData() {
  const data = localStorage.getItem('zenWalkData');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.totalSteps) gameStats.totalSteps = parsed.totalSteps;
      if (parsed.destroyedElements) gameStats.destroyedElements = parsed.destroyedElements;
    } catch(e) { console.error("Error parsing local data", e); }
  }
}

function saveLocalData() {
  localStorage.setItem('zenWalkData', JSON.stringify(gameStats));
}

function syncData() {
  if (!userProfile.username) return; // Don't sync if not started

  const payload = {
    username: userProfile.username,
    gender: userProfile.gender,
    petType: userProfile.petType,
    statsData: {
      totalSteps: gameStats.totalSteps,
      destroyedElements: gameStats.destroyedElements
    }
  };

  fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    mode: 'no-cors' // We don't need to read the response, just fire and forget silently
  }).then(() => {
    stepsSinceSync = 0;
  }).catch(e => {
    console.error("Sync failed, will retry later.", e);
  });
}

function incrementStep() {
  gameStats.totalSteps++;
  stepsSinceSync++;
  saveLocalData();

  if (gameStats.totalSteps % 1000 === 0) {
    spawnParticle(player.x, player.y, `${gameStats.totalSteps / 1000}K!`, '#FFD700');
  }

  if (stepsSinceSync >= SYNC_THRESHOLD) {
    syncData();
  }
}

function incrementDestroyed(type) {
  if (!gameStats.destroyedElements[type]) {
    gameStats.destroyedElements[type] = 0;
  }
  gameStats.destroyedElements[type]++;
  saveLocalData();
}

// --- Audio & Haptics ---
function playBeep(frequency, duration, type = 'sine') {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function soundCut() {
  playBeep(800, 0.1, 'square');
  if (navigator.vibrate) navigator.vibrate(50); // Strong haptic
}

function soundThud() {
  playBeep(150, 0.1, 'sawtooth');
  if (navigator.vibrate) navigator.vibrate(20); // Light haptic
}

// --- World Generation ---
function getTileKey(x, y) {
  return `${x},${y}`;
}

function generateTile(x, y) {
  const r = Math.random();

  // Weights: 70% grass, 10% water, 15% 1x1 tree/rock, 5% 2x2 tree
  let tileData = { type: 'grass', destructible: false, multiTileParent: null };

  if (r < 0.70) {
    tileData.type = 'grass'; // Empty
  } else if (r < 0.80) {
    tileData.type = 'water';
  } else if (r < 0.95) {
    // 1x1 obstacle
    tileData.type = Math.random() > 0.5 ? 'small_tree' : 'rock';
    tileData.destructible = true;
  } else {
    // 2x2 obstacle (Large Tree) - only generate if anchor
    tileData.type = 'large_tree_anchor';
    tileData.destructible = false;

    // Project footprint
    activeTiles[getTileKey(x+1, y)] = { type: 'large_tree_part', destructible: false, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x, y+1)] = { type: 'large_tree_part', destructible: false, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x+1, y+1)] = { type: 'large_tree_part', destructible: false, multiTileParent: getTileKey(x,y) };
  }

  return tileData;
}

function updateWorld() {
  // Determine viewport bounds in grid coordinates
  const viewRadiusX = Math.ceil(canvas.width / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;
  const viewRadiusY = Math.ceil(canvas.height / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;

  const minX = player.x - viewRadiusX;
  const maxX = player.x + viewRadiusX;
  const minY = player.y - viewRadiusY;
  const maxY = player.y + viewRadiusY;

  // 1. Cull off-screen tiles (Amnesia)
  for (let key in activeTiles) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minX || tx > maxX || ty < minY || ty > maxY) {
       // Only delete if it's not part of a multi-tile that might still be partially visible
       // For MVP simplicity, we aggressively cull
       delete activeTiles[key];
    }
  }

  // 2. Generate missing tiles
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const key = getTileKey(x, y);
      if (!activeTiles[key]) {
        activeTiles[key] = generateTile(x, y);
      }
    }
  }
}

// --- Core Logic ---
let moveCooldown = 0;
let lastIdleTime = 0;

function handleActionA() {
  if (currentState !== GAME_STATE.PLAYING) return;

  let targetX = player.x;
  let targetY = player.y;

  if (player.dir === 'up') targetY--;
  if (player.dir === 'down') targetY++;
  if (player.dir === 'left') targetX--;
  if (player.dir === 'right') targetX++;

  const key = getTileKey(targetX, targetY);
  const targetTile = activeTiles[key];

  if (targetTile) {
    if (targetTile.destructible) {
      // Success
      soundCut();
      spawnParticle(targetX, targetY, "+1", '#FFF');
      incrementDestroyed(targetTile.type);

      // Clear tile (turn to grass)
      activeTiles[key] = { type: 'grass', destructible: false, multiTileParent: null };

    } else if (targetTile.type !== 'grass') {
      // Failure (hit water or large tree)
      soundThud();
    }
  }
}

function updatePlayer(dt) {
  if (moveCooldown > 0) {
    moveCooldown -= dt;
    return;
  }

  let dx = 0; let dy = 0;
  let moved = false;

  if (keys.up) { dy = -1; player.dir = 'up'; moved = true; }
  else if (keys.down) { dy = 1; player.dir = 'down'; moved = true; }
  else if (keys.left) { dx = -1; player.dir = 'left'; moved = true; }
  else if (keys.right) { dx = 1; player.dir = 'right'; moved = true; }

  if (moved) {
    // Check Collision
    const targetX = player.x + dx;
    const targetY = player.y + dy;
    const key = getTileKey(targetX, targetY);

    // Make sure tile exists (should exist due to buffer)
    if (!activeTiles[key]) {
        activeTiles[key] = generateTile(targetX, targetY);
    }

    const tile = activeTiles[key];
    const isSolid = tile.type !== 'grass' && tile.type !== 'bush'; // Assuming bush is walkable for now, let's say only grass is walkable. Actually PRD says interactable obstacles. Let's make all non-grass block movement.

    if (tile.type !== 'grass') {
      // Blocked
      player.state = 'idle';
      // Play thud if bumping into something
      if (moveCooldown <= 0) {
         soundThud();
         moveCooldown = 200; // Small cooldown to prevent rapid thudding
      }
    } else {
      // Move
      player.x = targetX;
      player.y = targetY;
      player.state = 'walking';
      moveCooldown = 150; // Move speed (ms per tile)
      lastIdleTime = performance.now();

      incrementStep();

      // Update Sidekick Queue
      if (sidekick.active) {
        sidekick.queue.push({x: player.x, y: player.y, dir: player.dir});
        // Keep queue length 1 to lag behind by exactly 1 tile.
        // Actually, if player moves, pet moves to where player WAS.
        if (sidekick.queue.length > 1) {
          const nextPos = sidekick.queue.shift();
          sidekick.x = nextPos.x;
          sidekick.y = nextPos.y;
          sidekick.dir = nextPos.dir;
        }
      }
    }
  } else {
    player.state = 'idle';
    if (sidekick.active && performance.now() - lastIdleTime > 2000) {
       // Face player
       if (sidekick.x < player.x) sidekick.dir = 'right';
       else if (sidekick.x > player.x) sidekick.dir = 'left';
       else if (sidekick.y < player.y) sidekick.dir = 'down';
       else if (sidekick.y > player.y) sidekick.dir = 'up';
    }
  }
}

function spawnParticle(x, y, text, color) {
  particles.push({
    x: x, y: y,
    text: text,
    color: color,
    life: 1.0 // 1 second
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.life -= dt / 1000;
    p.y -= (dt / 1000) * 2; // Move up
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// --- Rendering ---
// Wrapper for future sprite sheet support
function drawEntity(screenX, screenY, type, state, dir, frame) {
  ctx.save();
  ctx.translate(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2);

  // MVP: Emojis
  ctx.font = `${TILE_SIZE * 0.8}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let emoji = '❓';
  switch(type) {
    case 'player':
      emoji = '🚶‍♂️';
      // Simple flip for direction MVP
      if (dir === 'left') ctx.scale(-1, 1);
      break;
    case 'dog': emoji = '🐕'; if (dir === 'left') ctx.scale(-1, 1); break;
    case 'cat': emoji = '🐈'; if (dir === 'left') ctx.scale(-1, 1); break;
    case 'grass': emoji = '🟩'; break;
    case 'water': emoji = '🌊'; break;
    case 'small_tree': emoji = '🌲'; break;
    case 'rock': emoji = '🪨'; break;
    case 'large_tree_anchor': emoji = '🌳'; ctx.font = `${TILE_SIZE * 1.6}px sans-serif`; ctx.translate(TILE_SIZE/2, TILE_SIZE/2); break; // Draw larger
    case 'large_tree_part': return; // Don't draw parts, let anchor handle it
  }

  // Background for grass to prevent black gaps
  if (type === 'grass') {
      ctx.fillStyle = '#2d5a27'; // Dark green background
      ctx.fillRect(-TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
  }

  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Camera centers on player
  cameraX = player.x * TILE_SIZE - canvas.width / 2 + TILE_SIZE / 2;
  cameraY = player.y * TILE_SIZE - canvas.height / 2 + TILE_SIZE / 2;

  // Draw World
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    const [tx, ty] = key.split(',').map(Number);
    const screenX = tx * TILE_SIZE - cameraX;
    const screenY = ty * TILE_SIZE - cameraY;

    // Draw base grass under everything
    if (tile.type !== 'grass') {
       drawEntity(screenX, screenY, 'grass', 'idle', 'down', 0);
    }
    drawEntity(screenX, screenY, tile.type, 'idle', 'down', 0);
  }

  // Draw Sidekick
  if (sidekick.active) {
    const sx = sidekick.x * TILE_SIZE - cameraX;
    const sy = sidekick.y * TILE_SIZE - cameraY;
    drawEntity(sx, sy, userProfile.petType.toLowerCase(), sidekick.state, sidekick.dir, sidekick.frame);
  }

  // Draw Player
  const px = player.x * TILE_SIZE - cameraX;
  const py = player.y * TILE_SIZE - cameraY;
  drawEntity(px, py, 'player', player.state, player.dir, player.frame);

  // Draw Particles
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  for (let p of particles) {
    const screenX = p.x * TILE_SIZE - cameraX + TILE_SIZE/2;
    const screenY = p.y * TILE_SIZE - cameraY; // Starts at head

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    // Add stroke for visibility
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeText(p.text, screenX, screenY);
    ctx.fillText(p.text, screenX, screenY);
    ctx.globalAlpha = 1.0;
  }
}

// --- Main Loop ---
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  if (currentState === GAME_STATE.PLAYING) {
    updatePlayer(dt);
    updateWorld();
    updateParticles(dt);
  }

  // Always render to keep screen populated even when paused
  if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.PAUSED) {
     render();
  }

  requestAnimationFrame(gameLoop);
}
