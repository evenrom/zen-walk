// app.js
const GAS_URL = "https://script.google.com/macros/s/AKfycbzvzel3haBRBiJFQcxiwoL1rIIHdrLCb4mmWfkUcVSIB5xSFGDSYrgDaio7YV7spKV8CQ/exec";

// --- Game State & Data ---
const GAME_STATE = {
  START: 0,
  PLAYING: 1,
  PAUSED: 2
};

let currentState = GAME_STATE.START;

const TILE_SIZE = 96;
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
let activeTiles = {}; // "x,y" -> { type, biome, destructible, multiTileParent }
const OFF_SCREEN_BUFFER = 2; // Extra tiles rendered outside view

// Entities
let player = { x: 0, y: 0, dir: 'down', state: 'idle', frame: 1, moveQueue: [] };
let sidekick = { x: 0, y: 0, dir: 'down', state: 'idle', frame: 1, active: false, queue: [] };
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

// --- Asset Preloader ---
const images = {
  player_Male: new Image(),
  player_Female: new Image(),
  player_Nonbinary: new Image(), // Fallback
  pet_Dog: new Image(),
  pet_Cat: new Image(),
  tileset_environment: new Image(),
  tileset_obstacles: new Image()
};

let imagesLoaded = 0;
const totalImages = 6; // We expect 6 main ones, we'll map Nonbinary to Female for now

function initImages() {
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.textContent = "Loading Assets...";

  const onLoad = () => {
    imagesLoaded++;
    if (imagesLoaded >= totalImages) {
      startBtn.disabled = false;
      startBtn.textContent = "Start Walking";
    }
  };

  // Assign mock sources, in a real app these would be real paths
  images.player_Male.onload = onLoad; images.player_Male.src = 'player_male.png';
  images.player_Female.onload = onLoad; images.player_Female.src = 'player_female.png';
  images.player_Nonbinary = images.player_Female; // fallback
  images.pet_Dog.onload = onLoad; images.pet_Dog.src = 'pet_dog.png';
  images.pet_Cat.onload = onLoad; images.pet_Cat.src = 'pet_cat.png';
  images.tileset_environment.onload = onLoad; images.tileset_environment.src = 'tileset_environment.png';
  images.tileset_obstacles.onload = onLoad; images.tileset_obstacles.src = 'tileset_obstacles.png';

  // If images fail to load (because they don't exist yet), we still want to enable the button eventually for testing
  const onError = () => {
    imagesLoaded++;
    if (imagesLoaded >= totalImages) {
      startBtn.disabled = false;
      startBtn.textContent = "Start Walking (Missing Assets)";
    }
  };

  images.player_Male.onerror = onError;
  images.player_Female.onerror = onError;
  images.pet_Dog.onerror = onError;
  images.pet_Cat.onerror = onError;
  images.tileset_environment.onerror = onError;
  images.tileset_obstacles.onerror = onError;
}

// --- Mock TILE_MAP Dictionaries ---
const TILE_MAP = {
  // Environment (tileset_environment.png)
  forest_grass: { img: 'tileset_environment', sx: 0, sy: 0 },
  desert_sand: { img: 'tileset_environment', sx: 96, sy: 0 },
  city_pavement: { img: 'tileset_environment', sx: 192, sy: 0 },
  sea_water: { img: 'tileset_environment', sx: 288, sy: 0 },

  // Obstacles (tileset_obstacles.png)
  // Forest
  forest_small_tree: { img: 'tileset_obstacles', sx: 0, sy: 0, w: 1, h: 1 },
  forest_tall_tree: { img: 'tileset_obstacles', sx: 96, sy: 0, w: 1, h: 2 },
  forest_large_tree: { img: 'tileset_obstacles', sx: 192, sy: 0, w: 2, h: 2 },
  // Desert
  desert_rock: { img: 'tileset_obstacles', sx: 0, sy: 192, w: 1, h: 1 },
  desert_cactus: { img: 'tileset_obstacles', sx: 96, sy: 192, w: 1, h: 2 },
  desert_large_rock: { img: 'tileset_obstacles', sx: 192, sy: 192, w: 2, h: 2 },
  // City
  city_trashcan: { img: 'tileset_obstacles', sx: 0, sy: 384, w: 1, h: 1 },
  city_lamppost: { img: 'tileset_obstacles', sx: 96, sy: 384, w: 1, h: 2 },
  city_fountain: { img: 'tileset_obstacles', sx: 192, sy: 384, w: 2, h: 2 }
};


// --- Initialization ---
window.onload = () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  // Disable image smoothing for pixel art look
  ctx.imageSmoothingEnabled = false;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  initImages();
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
  ctx.imageSmoothingEnabled = false; // Need to re-apply after resize
}

function setupDOM() {
  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;

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
      sidekick.x = player.x;
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
    el.addEventListener('mousedown', (e) => { keys[keyName] = true; el.classList.add('active'); });
    el.addEventListener('mouseup', (e) => { keys[keyName] = false; el.classList.remove('active'); });
    el.addEventListener('mouseleave', (e) => { keys[keyName] = false; el.classList.remove('active'); });
  };

  mapControl('btnUp', 'up');
  mapControl('btnDown', 'down');
  mapControl('btnLeft', 'left');
  mapControl('btnRight', 'right');

  const btnA = document.getElementById('btnA');
  const triggerA = (e) => {
    if(e) e.preventDefault();
    btnA.classList.add('active');
    handleActionA();
  };
  btnA.addEventListener('touchstart', triggerA);
  btnA.addEventListener('mousedown', triggerA);

  const releaseA = (e) => {
    if(e) e.preventDefault();
    btnA.classList.remove('active');
  };
  btnA.addEventListener('touchend', releaseA);
  btnA.addEventListener('mouseup', releaseA);
  btnA.addEventListener('mouseleave', releaseA);

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
  if (!userProfile.username) return;

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
    mode: 'no-cors'
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
  if (navigator.vibrate) navigator.vibrate(50);
}

function soundThud() {
  playBeep(150, 0.1, 'sawtooth');
  if (navigator.vibrate) navigator.vibrate(20);
}

// --- Deterministic Biome Generation ---
function pseudoRandom(x, y) {
  // Simple deterministic hash based on coordinates
  let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return n - Math.floor(n);
}

function getBiome(x, y) {
  // Use a larger scale for contiguous biomes
  const scale = 0.1;
  const nx = Math.floor(x * scale);
  const ny = Math.floor(y * scale);

  // Hash the macro block
  const n = pseudoRandom(nx, ny);

  if (n < 0.3) return 'forest';
  if (n < 0.6) return 'desert';
  if (n < 0.9) return 'city';
  return 'sea';
}

function getTileKey(x, y) {
  return `${x},${y}`;
}

function generateTile(x, y) {
  const biome = getBiome(x, y);

  let tileData = { type: `${biome}_base`, biome: biome, destructible: false, solid: false, multiTileParent: null };

  if (biome === 'sea') {
    tileData.type = 'sea_water';
    tileData.solid = true;
    return tileData; // Sea has no obstacles
  }

  // Set base ground type based on biome
  if (biome === 'forest') tileData.type = 'forest_grass';
  if (biome === 'desert') tileData.type = 'desert_sand';
  if (biome === 'city') tileData.type = 'city_pavement';

  // Fine-grained noise for obstacle placement
  const localNoise = pseudoRandom(x + 1000, y + 1000);

  // Don't spawn obstacles too close to 0,0 so player isn't trapped immediately
  if (Math.abs(x) < 2 && Math.abs(y) < 2) return tileData;

  if (localNoise < 0.10) {
    // 2x2 Large Obstacle
    tileData.type = `${biome}_large_obstacle_anchor`;
    tileData.solid = true;
    tileData.destructible = false;

    // Project footprint
    activeTiles[getTileKey(x+1, y)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x+1, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };

  } else if (localNoise < 0.15) {
    // 1x2 Tall Obstacle
    tileData.type = `${biome}_tall_obstacle_anchor`;
    tileData.solid = true;
    tileData.destructible = false;

    // Project footprint (takes up current tile and one below it)
    activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };

  } else if (localNoise < 0.30) {
    // 1x1 Small Obstacle
    tileData.type = `${biome}_small_obstacle`;
    tileData.solid = true;
    tileData.destructible = true;
  }

  return tileData;
}

function updateWorld() {
  const viewRadiusX = Math.ceil(canvas.width / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;
  const viewRadiusY = Math.ceil(canvas.height / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;

  const minX = player.x - viewRadiusX;
  const maxX = player.x + viewRadiusX;
  const minY = player.y - viewRadiusY;
  const maxY = player.y + viewRadiusY;

  // 1. Cull off-screen tiles (Amnesia)
  for (let key in activeTiles) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minX - 2 || tx > maxX + 2 || ty < minY - 2 || ty > maxY + 2) {
       // Only aggressive cull if far enough out so multi-tiles don't pop
       delete activeTiles[key];
    }
  }

  // 2. Generate missing tiles
  // Must generate row by row, top-left to bottom-right to respect anchors
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
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
let animationTimer = 0;

// Returns true if tile is solid (blocks movement)
function isSolid(tile) {
  if (!tile) return false;
  return tile.solid;
}

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

      // Clear tile (turn to base ground)
      const baseGroundType = targetTile.biome === 'forest' ? 'forest_grass' :
                             targetTile.biome === 'desert' ? 'desert_sand' : 'city_pavement';
      activeTiles[key] = { type: baseGroundType, biome: targetTile.biome, destructible: false, solid: false, multiTileParent: null };

    } else if (targetTile.solid) {
      // Failure (hit water, 1x2, or 2x2)
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
    player.state = 'walking';
    // Update walk cycle (0, 1, 2, 1, 0...)
    animationTimer += dt;
    if (animationTimer > 150) {
        player.frame = player.frame === 0 ? 2 : 0; // Ping-pong legs, simplify for now
        if (sidekick.active) sidekick.frame = player.frame;
        animationTimer = 0;
    }

    const targetX = player.x + dx;
    const targetY = player.y + dy;
    const key = getTileKey(targetX, targetY);

    if (!activeTiles[key]) {
        activeTiles[key] = generateTile(targetX, targetY);
    }

    const tile = activeTiles[key];

    if (isSolid(tile)) {
      // Blocked
      player.state = 'idle';
      player.frame = 1; // Idle frame
      if (sidekick.active) sidekick.frame = 1;

      if (moveCooldown <= 0) {
         soundThud();
         moveCooldown = 200;
      }
    } else {
      // Move
      player.x = targetX;
      player.y = targetY;
      moveCooldown = 200; // Move speed
      lastIdleTime = performance.now();

      incrementStep();

      if (sidekick.active) {
        sidekick.queue.push({x: player.x, y: player.y, dir: player.dir});
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
    player.frame = 1; // Idle frame
    if (sidekick.active) sidekick.frame = 1;

    if (sidekick.active && performance.now() - lastIdleTime > 2000) {
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
    life: 1.0
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.life -= dt / 1000;
    p.y -= (dt / 1000) * 2;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// --- Rendering ---

function getDirRow(dir) {
  switch(dir) {
    case 'down': return 0;
    case 'left': return 1;
    case 'right': return 2;
    case 'up': return 3;
    default: return 0;
  }
}

// Map logical types to sprite assets
function getAssetMapping(type) {
  if (TILE_MAP[type]) return TILE_MAP[type];

  // Handle procedural obstacle anchors mapping
  if (type.includes('_small_obstacle')) {
     if (type.startsWith('forest')) return TILE_MAP.forest_small_tree;
     if (type.startsWith('desert')) return TILE_MAP.desert_rock;
     if (type.startsWith('city')) return TILE_MAP.city_trashcan;
  }
  if (type.includes('_tall_obstacle_anchor')) {
     if (type.startsWith('forest')) return TILE_MAP.forest_tall_tree;
     if (type.startsWith('desert')) return TILE_MAP.desert_cactus;
     if (type.startsWith('city')) return TILE_MAP.city_lamppost;
  }
  if (type.includes('_large_obstacle_anchor')) {
     if (type.startsWith('forest')) return TILE_MAP.forest_large_tree;
     if (type.startsWith('desert')) return TILE_MAP.desert_large_rock;
     if (type.startsWith('city')) return TILE_MAP.city_fountain;
  }

  // Fallback
  return null;
}

function drawEntity(screenX, screenY, type, state, dir, frame) {
  // If it's a character or pet
  if (['player', 'dog', 'cat'].includes(type)) {
    let img;
    if (type === 'player') {
      img = images[`player_${userProfile.gender}`] || images.player_Female;
    } else if (type === 'dog') {
      img = images.pet_Dog;
    } else if (type === 'cat') {
      img = images.pet_Cat;
    }

    if (img && img.complete && img.naturalWidth > 0) {
      const row = getDirRow(dir);
      const col = frame; // 0, 1, 2
      ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, screenX, screenY, TILE_SIZE, TILE_SIZE);
    } else {
      // Fallback rect if image failed to load
      ctx.fillStyle = type === 'player' ? 'blue' : 'orange';
      ctx.fillRect(screenX + 24, screenY + 24, 48, 48);
    }
    return;
  }

  // If it's an environment or obstacle tile
  const asset = getAssetMapping(type);
  if (asset) {
    const imgObj = images[asset.img];
    if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
      const w = (asset.w || 1) * TILE_SIZE;
      const h = (asset.h || 1) * TILE_SIZE;
      ctx.drawImage(imgObj, asset.sx, asset.sy, w, h, screenX, screenY, w, h);
    } else {
       // Fallback colors for missing assets
       if (type.includes('water')) ctx.fillStyle = 'blue';
       else if (type.includes('forest')) ctx.fillStyle = 'darkgreen';
       else if (type.includes('desert')) ctx.fillStyle = 'khaki';
       else if (type.includes('city')) ctx.fillStyle = 'gray';
       else ctx.fillStyle = 'purple';

       const w = (asset.w || 1) * TILE_SIZE;
       const h = (asset.h || 1) * TILE_SIZE;
       ctx.fillRect(screenX, screenY, w, h);
    }
  }
}

function render() {
  // Fill background black
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  cameraX = player.x * TILE_SIZE - canvas.width / 2 + TILE_SIZE / 2;
  cameraY = player.y * TILE_SIZE - canvas.height / 2 + TILE_SIZE / 2;

  // Draw World - Layer 1: Ground
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    const [tx, ty] = key.split(',').map(Number);
    const screenX = tx * TILE_SIZE - cameraX;
    const screenY = ty * TILE_SIZE - cameraY;

    // Draw base ground for the biome
    let baseType = tile.biome === 'forest' ? 'forest_grass' :
                   tile.biome === 'desert' ? 'desert_sand' :
                   tile.biome === 'city' ? 'city_pavement' : 'sea_water';

    drawEntity(screenX, screenY, baseType, 'idle', 'down', 0);
  }

  // Draw World - Layer 2: Obstacles (Anchors only, sorted by Y to support depth later)
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    if (tile.type !== 'multi_part' && !tile.type.includes('grass') && !tile.type.includes('sand') && !tile.type.includes('pavement') && !tile.type.includes('water')) {
      const [tx, ty] = key.split(',').map(Number);
      const screenX = tx * TILE_SIZE - cameraX;
      const screenY = ty * TILE_SIZE - cameraY;
      drawEntity(screenX, screenY, tile.type, 'idle', 'down', 0);
    }
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
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  for (let p of particles) {
    const screenX = p.x * TILE_SIZE - cameraX + TILE_SIZE/2;
    const screenY = p.y * TILE_SIZE - cameraY;

    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.lineWidth = 3;
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

  if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.PAUSED) {
     render();
  }

  requestAnimationFrame(gameLoop);
}
