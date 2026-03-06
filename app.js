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
const OFF_SCREEN_BUFFER = 5; // Extra tiles rendered outside view

// Movement Constants
const MOVE_DURATION = 200; // ms

// Entities
let player = { 
  x: 0, y: 0, 
  pixelX: 0, pixelY: 0,
  targetX: 0, targetY: 0,
  startX: 0, startY: 0,
  dir: 'down', state: 'idle', frame: 1, 
  isMoving: false, moveTimer: 0, legToggle: false
};

let sidekick = { 
  x: 0, y: 0, 
  pixelX: 0, pixelY: 0,
  targetX: 0, targetY: 0,
  startX: 0, startY: 0,
  dir: 'down', state: 'idle', frame: 1, 
  active: false, isMoving: false, moveTimer: 0,
  queue: [] // Holds {x, y, dir} of player's previous grid positions
};

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
const totalImages = 6; 

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

  images.player_Male.onload = onLoad; images.player_Male.src = 'player_male.png';
  images.player_Female.onload = onLoad; images.player_Female.src = 'player_female.png';
  images.player_Nonbinary = images.player_Female; // fallback
  images.pet_Dog.onload = onLoad; images.pet_Dog.src = 'pet_dog.png';
  images.pet_Cat.onload = onLoad; images.pet_Cat.src = 'pet_cat.png';
  images.tileset_environment.onload = onLoad; images.tileset_environment.src = 'tileset_environment.png';
  images.tileset_obstacles.onload = onLoad; images.tileset_obstacles.src = 'tileset_obstacles.png';
  
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

// --- Advanced TILE_MAP Dictionary (96x96 Grid) ---
const TILE_MAP = {
  // === BASE ENVIRONMENTS ===
  forest_grass: [
    { img: 'tileset_environment', sx: 0, sy: 0 },   // Col 0, Row 0
    { img: 'tileset_environment', sx: 96, sy: 0 },  // Col 1, Row 0
    { img: 'tileset_environment', sx: 192, sy: 0 }  // Col 2, Row 0
  ],
  desert_sand: [
    { img: 'tileset_environment', sx: 0, sy: 96 },   // Col 0, Row 1
    { img: 'tileset_environment', sx: 96, sy: 96 },  // Col 1, Row 1
    { img: 'tileset_environment', sx: 192, sy: 96 }  // Col 2, Row 1
  ],
  city_pavement: [
    { img: 'tileset_environment', sx: 0, sy: 192 },   // Col 0, Row 2
    { img: 'tileset_environment', sx: 96, sy: 192 },  // Col 1, Row 2
    { img: 'tileset_environment', sx: 192, sy: 192 }  // Col 2, Row 2
  ],
  sea_water: [
    { img: 'tileset_environment', sx: 288, sy: 0 },   // Col 3, Row 0
    { img: 'tileset_environment', sx: 288, sy: 96 },  // Col 3, Row 1
    { img: 'tileset_environment', sx: 288, sy: 192 }  // Col 3, Row 2
  ],

  // === TRANSITIONS (AUTO-TILING) ===
  // City to Desert
  trans_city_desert_top_right:    { img: 'tileset_environment', sx: 0, sy: 384 },   // Col 0, Row 4
  trans_city_desert_top:          { img: 'tileset_environment', sx: 0, sy: 480 },   // Col 0, Row 5
  trans_city_desert_top_left:     { img: 'tileset_environment', sx: 0, sy: 576 },   // Col 0, Row 6
  trans_city_desert_left:         { img: 'tileset_environment', sx: 96, sy: 576 },  // Col 1, Row 6
  trans_city_desert_bottom_left:  { img: 'tileset_environment', sx: 192, sy: 576 }, // Col 2, Row 6
  trans_city_desert_bottom:       { img: 'tileset_environment', sx: 192, sy: 480 }, // Col 2, Row 5
  trans_city_desert_bottom_right: { img: 'tileset_environment', sx: 192, sy: 384 }, // Col 2, Row 4
  trans_city_desert_right:        { img: 'tileset_environment', sx: 96, sy: 384 },  // Col 1, Row 4

  // City to Forest
  trans_city_forest_top_right:    { img: 'tileset_environment', sx: 0, sy: 672 },   // Col 0, Row 7
  trans_city_forest_top:          { img: 'tileset_environment', sx: 0, sy: 768 },   // Col 0, Row 8
  trans_city_forest_top_left:     { img: 'tileset_environment', sx: 0, sy: 864 },   // Col 0, Row 9
  trans_city_forest_left:         { img: 'tileset_environment', sx: 96, sy: 864 },  // Col 1, Row 9
  trans_city_forest_bottom_left:  { img: 'tileset_environment', sx: 192, sy: 864 }, // Col 2, Row 9
  trans_city_forest_bottom:       { img: 'tileset_environment', sx: 192, sy: 768 }, // Col 2, Row 8
  trans_city_forest_bottom_right: { img: 'tileset_environment', sx: 192, sy: 672 }, // Col 2, Row 7
  trans_city_forest_right:        { img: 'tileset_environment', sx: 96, sy: 672 },  // Col 1, Row 7

  // Forest to Desert
  trans_forest_desert_top_right:    { img: 'tileset_environment', sx: 0, sy: 960 },   // Col 0, Row 10
  trans_forest_desert_top:          { img: 'tileset_environment', sx: 0, sy: 1056 },  // Col 0, Row 11
  trans_forest_desert_top_left:     { img: 'tileset_environment', sx: 0, sy: 1152 },  // Col 0, Row 12
  trans_forest_desert_left:         { img: 'tileset_environment', sx: 96, sy: 1152 }, // Col 1, Row 12
  trans_forest_desert_bottom_left:  { img: 'tileset_environment', sx: 192, sy: 1152 },// Col 2, Row 12
  trans_forest_desert_bottom:       { img: 'tileset_environment', sx: 192, sy: 1056 },// Col 2, Row 11
  trans_forest_desert_bottom_right: { img: 'tileset_environment', sx: 192, sy: 960 }, // Col 2, Row 10
  trans_forest_desert_right:        { img: 'tileset_environment', sx: 96, sy: 960 },  // Col 1, Row 10

  // Forest to Sea
  trans_forest_sea_top_right:    { img: 'tileset_environment', sx: 0, sy: 1248 },  // Col 0, Row 13
  trans_forest_sea_top:          { img: 'tileset_environment', sx: 0, sy: 1344 },  // Col 0, Row 14
  trans_forest_sea_top_left:     { img: 'tileset_environment', sx: 0, sy: 1440 },  // Col 0, Row 15
  trans_forest_sea_left:         { img: 'tileset_environment', sx: 96, sy: 1440 }, // Col 1, Row 15
  trans_forest_sea_bottom_left:  { img: 'tileset_environment', sx: 192, sy: 1440 },// Col 2, Row 15
  trans_forest_sea_bottom:       { img: 'tileset_environment', sx: 192, sy: 1344 },// Col 2, Row 14
  trans_forest_sea_bottom_right: { img: 'tileset_environment', sx: 192, sy: 1248 },// Col 2, Row 13
  trans_forest_sea_right:        { img: 'tileset_environment', sx: 96, sy: 1248 }, // Col 1, Row 13

  // === TEMPORARY OBSTACLE PLACEHOLDERS ===
  forest_small_obstacle: [{ img: 'tileset_obstacles', sx: 384, sy: 0, w: 1, h: 1 }],
  forest_tall_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 0, sy: 384, w: 1, h: 2 }],
  forest_large_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 0, sy: 192, w: 2, h: 2 }],
  desert_small_obstacle: [{ img: 'tileset_obstacles', sx: 480, sy: 96, w: 1, h: 1 }],
  desert_tall_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 96, sy: 384, w: 1, h: 2 }],
  desert_large_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 384, sy: 192, w: 2, h: 2 }],
  city_small_obstacle: [{ img: 'tileset_obstacles', sx: 480, sy: 0, w: 1, h: 1 }],
  city_tall_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 192, sy: 384, w: 1, h: 2 }],
  city_large_obstacle_anchor: [{ img: 'tileset_obstacles', sx: 576, sy: 384, w: 2, h: 2 }]
};


// --- Initialization ---
window.onload = () => {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  
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
  ctx.imageSmoothingEnabled = false;
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
    
    player.pixelX = player.x * TILE_SIZE;
    player.pixelY = player.y * TILE_SIZE;
    
    if (userProfile.petType !== "None") {
      sidekick.active = true;
      sidekick.x = player.x;
      sidekick.y = player.y;
      sidekick.pixelX = sidekick.x * TILE_SIZE;
      sidekick.pixelY = sidekick.y * TILE_SIZE;
    }
    
    initAudio();
    currentState = GAME_STATE.PLAYING;
  });

  const btnB = document.getElementById('btnB');
  btnB.addEventListener('touchstart', (e) => {
    e.preventDefault();
    togglePause();
  });
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
  let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return n - Math.floor(n);
}

function getBiome(x, y) {
  const scale = 0.02; // Much larger continuous biomes
  const nx = Math.floor(x * scale);
  const ny = Math.floor(y * scale);
  
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
    return tileData;
  }
  
  if (biome === 'forest') tileData.type = 'forest_grass';
  if (biome === 'desert') tileData.type = 'desert_sand';
  if (biome === 'city') tileData.type = 'city_pavement';
  
  const localNoise = pseudoRandom(x + 1000, y + 1000);
  
  if (Math.abs(x) < 2 && Math.abs(y) < 2) return tileData;
  
  if (localNoise < 0.10) {
    tileData.type = `${biome}_large_obstacle_anchor`;
    tileData.solid = true;
    tileData.destructible = false;
    
    activeTiles[getTileKey(x+1, y)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    activeTiles[getTileKey(x+1, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    
  } else if (localNoise < 0.15) {
    tileData.type = `${biome}_tall_obstacle_anchor`;
    tileData.solid = true;
    tileData.destructible = false;
    
    activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
    
  } else if (localNoise < 0.30) {
    tileData.type = `${biome}_small_obstacle`;
    tileData.solid = true;
    tileData.destructible = true;
  }
  
  return tileData;
}

function updateWorld() {
  // Use a slightly larger radius for generating to prevent pop-in
  const viewRadiusX = Math.ceil(canvas.width / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;
  const viewRadiusY = Math.ceil(canvas.height / 2 / TILE_SIZE) + OFF_SCREEN_BUFFER;
  
  // Use current logical x, y to calculate center of generation
  const minX = player.x - viewRadiusX;
  const maxX = player.x + viewRadiusX;
  const minY = player.y - viewRadiusY;
  const maxY = player.y + viewRadiusY;
  
  // 1. Cull off-screen tiles (Amnesia)
  // Ensure we don't cull tiles we just generated or are about to generate
  const cullBuffer = 3; 
  for (let key in activeTiles) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minX - cullBuffer || tx > maxX + cullBuffer || ty < minY - cullBuffer || ty > maxY + cullBuffer) {
       delete activeTiles[key];
    }
  }
  
  // 2. Generate missing tiles
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
let lastIdleTime = 0;

function isSolid(tile) {
  if (!tile) return false;
  return tile.solid;
}

function handleActionA() {
  if (currentState !== GAME_STATE.PLAYING || player.isMoving) return;
  
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
      soundCut();
      spawnParticle(targetX, targetY, "+1", '#FFF');
      incrementDestroyed(targetTile.type);
      
      const baseGroundType = targetTile.biome === 'forest' ? 'forest_grass' : 
                             targetTile.biome === 'desert' ? 'desert_sand' : 'city_pavement';
      activeTiles[key] = { type: baseGroundType, biome: targetTile.biome, destructible: false, solid: false, multiTileParent: null };
      
    } else if (targetTile.solid) {
      soundThud();
    }
  }
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function moveEntity(entity, dt) {
  entity.moveTimer += dt;
  let t = entity.moveTimer / MOVE_DURATION;
  
  if (t >= 1.0) {
    // Finish movement
    entity.pixelX = entity.targetX * TILE_SIZE;
    entity.pixelY = entity.targetY * TILE_SIZE;
    entity.x = entity.targetX;
    entity.y = entity.targetY;
    entity.isMoving = false;
    entity.moveTimer = 0;
    
    // Snap to idle frame if not immediately starting another move later
    entity.frame = 1;
    
    return true; // Finished
  } else {
    // Interpolate
    entity.pixelX = lerp(entity.startX * TILE_SIZE, entity.targetX * TILE_SIZE, t);
    entity.pixelY = lerp(entity.startY * TILE_SIZE, entity.targetY * TILE_SIZE, t);
    
    // Lock animation frame while moving
    entity.frame = entity.legToggle ? 2 : 0;
    return false;
  }
}

function tryStartPlayerMove() {
  let dx = 0; let dy = 0;
  let newDir = player.dir;
  
  if (keys.up) { dy = -1; newDir = 'up'; }
  else if (keys.down) { dy = 1; newDir = 'down'; }
  else if (keys.left) { dx = -1; newDir = 'left'; }
  else if (keys.right) { dx = 1; newDir = 'right'; }
  
  if (dx !== 0 || dy !== 0) {
    player.dir = newDir;
    const targetX = player.x + dx;
    const targetY = player.y + dy;
    const key = getTileKey(targetX, targetY);
    
    if (!activeTiles[key]) {
        activeTiles[key] = generateTile(targetX, targetY);
    }
    
    const tile = activeTiles[key];
    
    if (isSolid(tile)) {
      // Bumping into wall
      player.state = 'idle';
      player.frame = 1;
      soundThud();
      // Add a small cooldown even if we failed so we don't spam thud
      player.isMoving = true;
      player.targetX = player.x;
      player.targetY = player.y;
      player.startX = player.x;
      player.startY = player.y;
      player.moveTimer = MOVE_DURATION / 2; // Shorter lock for a bump
    } else {
      // Start moving
      player.isMoving = true;
      player.state = 'walking';
      player.targetX = targetX;
      player.targetY = targetY;
      player.startX = player.x;
      player.startY = player.y;
      player.moveTimer = 0;
      player.legToggle = !player.legToggle;
      
      // Queue sidekick move immediately when player commits to a step
      if (sidekick.active) {
        sidekick.queue.push({x: player.x, y: player.y, dir: player.dir});
      }
    }
  } else {
    // Not pressing movement keys
    player.state = 'idle';
    player.frame = 1;
  }
}

function updatePlayerAndSidekick(dt) {
  if (player.isMoving) {
    if (moveEntity(player, dt)) {
      // Movement finished this frame
      incrementStep();
      lastIdleTime = performance.now();
      
      // Start sidekick movement if it has something queued and isn't already moving
      if (sidekick.active && !sidekick.isMoving && sidekick.queue.length > 0) {
         const nextPos = sidekick.queue.shift();
         sidekick.isMoving = true;
         sidekick.state = 'walking';
         sidekick.targetX = nextPos.x;
         sidekick.targetY = nextPos.y;
         sidekick.startX = sidekick.x;
         sidekick.startY = sidekick.y;
         sidekick.dir = nextPos.dir;
         sidekick.moveTimer = 0;
         sidekick.legToggle = player.legToggle; // Match player leg for sync
      }
    }
  } else {
    tryStartPlayerMove();
  }
  
  if (sidekick.active) {
    if (sidekick.isMoving) {
      if(moveEntity(sidekick, dt)) {
         // Sidekick finished moving
         // If there's MORE in the queue (e.g. player moved fast), start next immediately
         if (sidekick.queue.length > 0 && !player.isMoving) {
             const nextPos = sidekick.queue.shift();
             sidekick.isMoving = true;
             sidekick.targetX = nextPos.x;
             sidekick.targetY = nextPos.y;
             sidekick.startX = sidekick.x;
             sidekick.startY = sidekick.y;
             sidekick.dir = nextPos.dir;
             sidekick.moveTimer = 0;
             sidekick.legToggle = !sidekick.legToggle;
         }
      }
    } else {
      // Sidekick idle logic
      if (!player.isMoving && performance.now() - lastIdleTime > 2000) {
         if (sidekick.x < player.x) sidekick.dir = 'right';
         else if (sidekick.x > player.x) sidekick.dir = 'left';
         else if (sidekick.y < player.y) sidekick.dir = 'down';
         else if (sidekick.y > player.y) sidekick.dir = 'up';
      }
      
      // Check if player moved ahead and sidekick needs to catch up
      if (sidekick.queue.length > 0) {
          const nextPos = sidekick.queue.shift();
          sidekick.isMoving = true;
          sidekick.state = 'walking';
          sidekick.targetX = nextPos.x;
          sidekick.targetY = nextPos.y;
          sidekick.startX = sidekick.x;
          sidekick.startY = sidekick.y;
          sidekick.dir = nextPos.dir;
          sidekick.moveTimer = 0;
          sidekick.legToggle = !sidekick.legToggle;
      }
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
    p.y -= (dt / 1000) * 2; // Moves up logically in grid space slowly
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

function getAssetMapping(type) {
  if (TILE_MAP[type]) return TILE_MAP[type];
  
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
  
  return null;
}

function drawEntity(screenX, screenY, type, state, dir, frame) {
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
      const col = frame;
      ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, screenX, screenY, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.fillStyle = type === 'player' ? 'blue' : 'orange';
      ctx.fillRect(screenX + 24, screenY + 24, 48, 48);
    }
    return;
  }
  
  const asset = getAssetMapping(type);
  if (asset) {
    const imgObj = images[asset.img];
    if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
      const w = (asset.w || 1) * TILE_SIZE;
      const h = (asset.h || 1) * TILE_SIZE;
      ctx.drawImage(imgObj, asset.sx, asset.sy, w, h, screenX, screenY, w, h);
    } else {
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
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Camera now follows player's pixel coordinates smoothly
  cameraX = player.pixelX - canvas.width / 2 + TILE_SIZE / 2;
  cameraY = player.pixelY - canvas.height / 2 + TILE_SIZE / 2;
  
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    const [tx, ty] = key.split(',').map(Number);
    const screenX = tx * TILE_SIZE - cameraX;
    const screenY = ty * TILE_SIZE - cameraY;
    
    let baseType = tile.biome === 'forest' ? 'forest_grass' : 
                   tile.biome === 'desert' ? 'desert_sand' : 
                   tile.biome === 'city' ? 'city_pavement' : 'sea_water';
                   
    drawEntity(screenX, screenY, baseType, 'idle', 'down', 0);
  }
  
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    if (tile.type !== 'multi_part' && !tile.type.includes('grass') && !tile.type.includes('sand') && !tile.type.includes('pavement') && !tile.type.includes('water')) {
      const [tx, ty] = key.split(',').map(Number);
      const screenX = tx * TILE_SIZE - cameraX;
      const screenY = ty * TILE_SIZE - cameraY;
      drawEntity(screenX, screenY, tile.type, 'idle', 'down', 0);
    }
  }
  
  if (sidekick.active) {
    const sx = sidekick.pixelX - cameraX;
    const sy = sidekick.pixelY - cameraY;
    drawEntity(sx, sy, userProfile.petType.toLowerCase(), sidekick.state, sidekick.dir, sidekick.frame);
  }
  
  const px = player.pixelX - cameraX;
  const py = player.pixelY - cameraY;
  drawEntity(px, py, 'player', player.state, player.dir, player.frame);
  
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
    updatePlayerAndSidekick(dt);
    updateWorld();
    updateParticles(dt);
  }
  
  if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.PAUSED) {
     render();
  }
  
  requestAnimationFrame(gameLoop);
}
