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
  playerID: "",
  username: "",
  pin: "",
  gender: "",
  petType: "None"
};

let gameStats = {
  totalSteps: 0,
  forestTreasures: 0,
  urbanArtifacts: 0,
  desertRelics: 0,
  hiddenCatBonus: 0
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
  queue: [], // Holds {x, y, dir} of player's previous grid positions
  fsmState: 'follow', // follow, seek, idle
  seekTarget: null,
  idleTimer: 0
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
  forest: {
    primary: { img: 'tileset_environment', sx: 96, sy: 96 },
    secondary: { img: 'tileset_environment', sx: 192, sy: 96 },
    edges: {
      tl: { img: 'tileset_environment', sx: 0, sy: 0 },
      t:  { img: 'tileset_environment', sx: 96, sy: 0 },
      tr: { img: 'tileset_environment', sx: 288, sy: 0 },
      r:  { img: 'tileset_environment', sx: 288, sy: 96 },
      br: { img: 'tileset_environment', sx: 288, sy: 192 },
      b:  { img: 'tileset_environment', sx: 96, sy: 192 },
      bl: { img: 'tileset_environment', sx: 0, sy: 192 },
      l:  { img: 'tileset_environment', sx: 0, sy: 96 }
    }
  },
  desert: {
    primary: { img: 'tileset_environment', sx: 480, sy: 96 },
    secondary: { img: 'tileset_environment', sx: 576, sy: 96 },
    edges: {
      tl: { img: 'tileset_environment', sx: 384, sy: 0 },
      t:  { img: 'tileset_environment', sx: 480, sy: 0 },
      tr: { img: 'tileset_environment', sx: 672, sy: 0 },
      r:  { img: 'tileset_environment', sx: 672, sy: 96 },
      br: { img: 'tileset_environment', sx: 672, sy: 192 },
      b:  { img: 'tileset_environment', sx: 480, sy: 192 },
      bl: { img: 'tileset_environment', sx: 384, sy: 192 },
      l:  { img: 'tileset_environment', sx: 384, sy: 96 }
    }
  },
  city: {
    primary: { img: 'tileset_environment', sx: 864, sy: 96 },
    secondary: { img: 'tileset_environment', sx: 960, sy: 96 },
    edges: {
      tl: { img: 'tileset_environment', sx: 768, sy: 0 },
      t:  { img: 'tileset_environment', sx: 864, sy: 0 },
      tr: { img: 'tileset_environment', sx: 1056, sy: 0 },
      r:  { img: 'tileset_environment', sx: 1056, sy: 96 },
      br: { img: 'tileset_environment', sx: 1056, sy: 192 },
      b:  { img: 'tileset_environment', sx: 864, sy: 192 },
      bl: { img: 'tileset_environment', sx: 768, sy: 192 },
      l:  { img: 'tileset_environment', sx: 768, sy: 96 }
    }
  },
  sea: {
    primary: { img: 'tileset_environment', sx: 1152, sy: 0 },
    secondary: { img: 'tileset_environment', sx: 1152, sy: 96 }
  },

  // === OBSTACLES ===
  // Forest
  forest_small_obstacle: [
    { img: 'tileset_obstacles', sx: 0, sy: 0, w: 1, h: 1 },    // Potted plant
    { img: 'tileset_obstacles', sx: 0, sy: 96, w: 1, h: 1 },   // Round cactus
    { img: 'tileset_obstacles', sx: 0, sy: 192, w: 1, h: 1 },  // Prickly pear
    { img: 'tileset_obstacles', sx: 0, sy: 288, w: 1, h: 1 }   // Small rock
  ],
  forest_tall_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 96, sy: 0, w: 1, h: 2 },   // Pine tree
    { img: 'tileset_obstacles', sx: 192, sy: 0, w: 1, h: 2 }   // Oak tree
  ],
  forest_large_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 96, sy: 192, w: 2, h: 2 }  // Giant Saguaro
  ],
  
  // Desert
  desert_small_obstacle: [
    { img: 'tileset_obstacles', sx: 288, sy: 0, w: 1, h: 1 },  // Rock stack
    { img: 'tileset_obstacles', sx: 288, sy: 96, w: 1, h: 1 }, // Water bowl
    { img: 'tileset_obstacles', sx: 288, sy: 192, w: 1, h: 1 },// Sign
    { img: 'tileset_obstacles', sx: 288, sy: 288, w: 1, h: 1 } // Red rock
  ],
  desert_tall_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 384, sy: 0, w: 1, h: 2 },  // Totem
    { img: 'tileset_obstacles', sx: 480, sy: 0, w: 1, h: 2 }   // Watchtower
  ],
  desert_large_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 384, sy: 192, w: 2, h: 2 } // Mesa entrance
  ],
  
  // City
  city_small_obstacle: [
    { img: 'tileset_obstacles', sx: 576, sy: 0, w: 1, h: 1 },  // Hydrant
    { img: 'tileset_obstacles', sx: 576, sy: 96, w: 1, h: 1 }, // Mailbox
    { img: 'tileset_obstacles', sx: 576, sy: 192, w: 1, h: 1 },// Signpost
    { img: 'tileset_obstacles', sx: 576, sy: 288, w: 1, h: 1 } // Planter
  ],
  city_tall_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 672, sy: 0, w: 1, h: 2 },  // Clock
    { img: 'tileset_obstacles', sx: 768, sy: 0, w: 1, h: 2 }   // Power pole
  ],
  city_large_obstacle_anchor: [
    { img: 'tileset_obstacles', sx: 672, sy: 192, w: 2, h: 2 } // Storefront
  ]
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
  initMinimap();
  
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
  startBtn.addEventListener('click', async () => {
    if (startBtn.disabled) return;
    
    const usernameInput = document.getElementById('username').value.trim();
    const pinInput = document.getElementById('pin').value.trim();

    if (!usernameInput || !pinInput || pinInput.length !== 4) {
      alert("Please enter a username and a 4-digit PIN.");
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Loading Data...";

    userProfile.username = usernameInput;
    userProfile.pin = pinInput;
    userProfile.playerID = usernameInput.toLowerCase() + "_" + pinInput;
    userProfile.gender = document.getElementById('gender').value;
    userProfile.petType = document.getElementById('petType').value;

    await loadServerData(userProfile.playerID);
    
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

  const statsMapping = [
    { label: "Forest Treasures", value: gameStats.forestTreasures },
    { label: "Urban Artifacts", value: gameStats.urbanArtifacts },
    { label: "Desert Relics", value: gameStats.desertRelics }
  ];

  for (const stat of statsMapping) {
    if (stat.value > 0) {
      const p = document.createElement('p');
      p.textContent = `${stat.label}: ${stat.value}`;
      list.appendChild(p);
    }
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
      if (parsed.totalSteps !== undefined) gameStats.totalSteps = parsed.totalSteps;
      if (parsed.forestTreasures !== undefined) gameStats.forestTreasures = parsed.forestTreasures;
      if (parsed.urbanArtifacts !== undefined) gameStats.urbanArtifacts = parsed.urbanArtifacts;
      if (parsed.desertRelics !== undefined) gameStats.desertRelics = parsed.desertRelics;
      if (parsed.hiddenCatBonus !== undefined) gameStats.hiddenCatBonus = parsed.hiddenCatBonus;
    } catch(e) { console.error("Error parsing local data", e); }
  }
}

function saveLocalData() {
  localStorage.setItem('zenWalkData', JSON.stringify(gameStats));
}

async function loadServerData(playerID) {
  try {
    const payload = { action: "load", playerID: playerID };
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.status === "success" && result.data) {
      userProfile.gender = result.data.gender || userProfile.gender;
      userProfile.petType = result.data.petType || userProfile.petType;
      gameStats.totalSteps = result.data.totalSteps || 0;
      gameStats.forestTreasures = result.data.forestTreasures || 0;
      gameStats.urbanArtifacts = result.data.urbanArtifacts || 0;
      gameStats.desertRelics = result.data.desertRelics || 0;
      gameStats.hiddenCatBonus = result.data.hiddenCatBonus || 0;
      saveLocalData();
    }
  } catch (e) {
    console.error("Error loading server data:", e);
    // Fallback to local data
    loadLocalData();
  }
}

function syncData() {
  if (!userProfile.playerID) return;
  
  const payload = {
    action: "save",
    playerID: userProfile.playerID,
    gender: userProfile.gender,
    petType: userProfile.petType,
    totalSteps: gameStats.totalSteps,
    forestTreasures: gameStats.forestTreasures,
    urbanArtifacts: gameStats.urbanArtifacts,
    desertRelics: gameStats.desertRelics,
    hiddenCatBonus: gameStats.hiddenCatBonus
  };
  
  fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  }).then(res => res.json())
  .then((result) => {
    if(result.status === "success"){
       stepsSinceSync = 0;
    }
  }).catch(e => {
    console.error("Sync failed, will retry later.", e);
  });
}

setInterval(() => {
  if (currentState === GAME_STATE.PLAYING && stepsSinceSync > 0) {
     syncData();
  }
}, 5 * 60 * 1000);

window.addEventListener('beforeunload', () => {
   if (stepsSinceSync > 0 && userProfile.playerID) {
      const payload = {
        action: "save",
        playerID: userProfile.playerID,
        gender: userProfile.gender,
        petType: userProfile.petType,
        totalSteps: gameStats.totalSteps,
        forestTreasures: gameStats.forestTreasures,
        urbanArtifacts: gameStats.urbanArtifacts,
        desertRelics: gameStats.desertRelics,
        hiddenCatBonus: gameStats.hiddenCatBonus
      };
      navigator.sendBeacon(GAS_URL, JSON.stringify(payload));
   }
});

function incrementStep() {
  gameStats.totalSteps++;
  stepsSinceSync++;
  saveLocalData();
  
  if (gameStats.totalSteps % 1000 === 0) {
    spawnParticle(player.x, player.y, `${gameStats.totalSteps / 1000}K!`, '#FFD700');
  }

  updateDayNightCycle();
  
  if (stepsSinceSync >= SYNC_THRESHOLD) {
    syncData();
  }
}

function updateDayNightCycle() {
  const overlay = document.getElementById('dayNightOverlay');
  if (!overlay) return;
  
  // מחזור של 1000 צעדים: 0-700 זה יום, 701-999 זה לילה.
  const cyclePos = gameStats.totalSteps % 1000;
  
  if (cyclePos > 700) {
    overlay.classList.add('night');
  } else {
    overlay.classList.remove('night');
  }
}

function collectItem(type) {
  let category = '';
  if (type.startsWith('forest')) {
    gameStats.forestTreasures++;
    category = 'forestTreasures';
  } else if (type.startsWith('city')) {
    gameStats.urbanArtifacts++;
    category = 'urbanArtifacts';
  } else if (type.startsWith('desert')) {
    gameStats.desertRelics++;
    category = 'desertRelics';
  }

  if (category && gameStats[category] % 100 === 0 && gameStats[category] > 0) {
      spawnParticle(player.x, player.y - 1, "+100", '#0F0');
  }
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

function getRawBiome(x, y) {
  const scale = 0.02; // Much larger continuous biomes
  const nx = Math.floor(x * scale);
  const ny = Math.floor(y * scale);
  
  const n = pseudoRandom(nx, ny);
  
  if (n < 0.3) return 'forest';
  if (n < 0.6) return 'desert';
  if (n < 0.9) return 'city';
  return 'sea';
}

function getBiome(x, y) {
  // הסרנו את אילוץ החוף לבקשת ה-Product. כל ביומה יכולה לגעת בים חופשי.
  return getRawBiome(x, y);
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
  
  // מניעת יצירת מכשולים על השחקן בתחילת המשחק
  if (Math.abs(x) < 3 && Math.abs(y) < 3) return tileData;
  
  // הסתברות של 2% בלבד לאובייקט - יוצר מרחק של כ-10-20 משבצות בין מכשולים
  if (localNoise < 0.02) {
    const typeNoise = pseudoRandom(x + 2000, y + 2000); // הגרלה נפרדת לסוג המכשול
    
    if (typeNoise < 0.20) {
      // 20% Large (2x2)
      tileData.type = `${biome}_large_obstacle_anchor`;
      tileData.solid = true;
      tileData.destructible = false;
      
      activeTiles[getTileKey(x+1, y)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
      activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
      activeTiles[getTileKey(x+1, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
      
    } else if (typeNoise < 0.50) {
      // 30% Tall (1x2)
      tileData.type = `${biome}_tall_obstacle_anchor`;
      tileData.solid = true;
      tileData.destructible = false;
      
      activeTiles[getTileKey(x, y+1)] = { type: 'multi_part', biome: biome, destructible: false, solid: true, multiTileParent: getTileKey(x,y) };
      
    } else {
      // 50% Small (1x1)
      tileData.type = `${biome}_small_obstacle`;
      tileData.solid = true;
      tileData.destructible = true;
    }
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
  
  const cullBuffer = 3; 
  for (let key in activeTiles) {
    const [tx, ty] = key.split(',').map(Number);
    if (tx < minX - cullBuffer || tx > maxX + cullBuffer || ty < minY - cullBuffer || ty > maxY + cullBuffer) {
        delete activeTiles[key];
    }
  }
  
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
      collectItem(targetTile.type);
      
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
    entity.pixelX = entity.targetX * TILE_SIZE;
    entity.pixelY = entity.targetY * TILE_SIZE;
    entity.x = entity.targetX;
    entity.y = entity.targetY;
    entity.isMoving = false;
    entity.moveTimer = 0;
    entity.frame = 1;
    return true; 
  } else {
    entity.pixelX = lerp(entity.startX * TILE_SIZE, entity.targetX * TILE_SIZE, t);
    entity.pixelY = lerp(entity.startY * TILE_SIZE, entity.targetY * TILE_SIZE, t);
    entity.frame = entity.legToggle ? 2 : 0;
    return false;
  }
}

// הוסף את פונקציות הרעש הדטרמיניסטיות והזיגזג מעל פונקציית tryStartPlayerMove

// 1. deterministicNoise: פונקציית רעש דטרמיניסטית קוהרנטית (כמו Perlin פשוטה)
function deterministicNoise(x, y, seed) {
    let n = pseudoRandom(x + seed, y + seed);
    let s = Math.sin(x * 0.5 + seed);
    let c = Math.cos(y * 0.5 + seed);
    return (n + s + c) / 3; // מנורמל בערך לטווח [-1, 1]
}

// 2. applyZigzag: פונקציית ההיסט המזגזגת
function applyZigzag(x, y) {
    // משתמשים ב deterministicNoise כדי לייצר היסט (Offset) בטווח [-3, 3] משבצות.
    // אנו משתמשים בסידים שונים כדי שהזיגזג של x ו-y לא יהיה זהה
    let xOffset = deterministicNoise(x, y, 1234.5) * 3;
    let yOffset = deterministicNoise(x, y, 6789.0) * 3;
    
    return {
        perturbedX: x + xOffset,
        perturbedY: y + yOffset
    };
}

// 3. getRawBiome המעודכנת
function getRawBiome(x, y) {
  // FIX: קרא ל-applyZigzag כדי לקבל קואורדינטות ה"מוסטות" ( perturbed) במקום המקוריות
  const { perturbedX, perturbedY } = applyZigzag(x, y);
  
  const scale = 0.02; // אזורי ביומות גדולים ורציפים
  const nx = Math.floor(perturbedX * scale);
  const ny = Math.floor(perturbedY * scale);
  
  const n = pseudoRandom(nx, ny);
  
  if (n < 0.3) return 'forest';
  if (n < 0.6) return 'desert';
  if (n < 0.9) return 'city';
  return 'sea';
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
      player.state = 'idle';
      player.frame = 1;
      soundThud();
      player.isMoving = true;
      player.targetX = player.x;
      player.targetY = player.y;
      player.startX = player.x;
      player.startY = player.y;
      player.moveTimer = MOVE_DURATION / 2; 
    } else {
      player.isMoving = true;
      player.state = 'walking';
      player.targetX = targetX;
      player.targetY = targetY;
      player.startX = player.x;
      player.startY = player.y;
      player.moveTimer = 0;
      player.legToggle = !player.legToggle;
      
      if (sidekick.active) {
        sidekick.queue.push({x: player.x, y: player.y, dir: player.dir});
      }
    }
  } else {
    player.state = 'idle';
    player.frame = 1;
  }
}

function updateSidekickDog(dt) {
  // 1. Anti-Stuck Teleport Protocol
  const distToPlayer = Math.abs(player.x - sidekick.x) + Math.abs(player.y - sidekick.y);
  if (distToPlayer > 12) {
     sidekick.x = player.x; sidekick.y = player.y;
     sidekick.pixelX = player.x * TILE_SIZE; sidekick.pixelY = player.y * TILE_SIZE;
     sidekick.fsmState = 'follow'; sidekick.seekTarget = null;
     sidekick.queue = []; sidekick.isMoving = false;
     return;
  }

  // 2. Dynamic Speed (Catch-up mechanic)
  const modifiedDt = sidekick.queue.length > 3 ? dt * 1.5 : dt;

  if (sidekick.isMoving) {
    if(moveEntity(sidekick, modifiedDt)) {
      if (sidekick.fsmState === 'seek' && sidekick.seekTarget) {
        const dist = Math.abs(sidekick.x - sidekick.seekTarget.x) + Math.abs(sidekick.y - sidekick.seekTarget.y);
        if (dist <= 1) {
          sidekick.fsmState = 'sit'; sidekick.state = 'idle'; sidekick.frame = 1;
          if (sidekick.x < sidekick.seekTarget.x) sidekick.dir = 'right';
          else if (sidekick.x > sidekick.seekTarget.x) sidekick.dir = 'left';
          else if (sidekick.y < sidekick.seekTarget.y) sidekick.dir = 'down';
          else if (sidekick.y > sidekick.seekTarget.y) sidekick.dir = 'up';
        }
      }
    }
  } else {
    if (sidekick.fsmState === 'sit') {
       const key = getTileKey(sidekick.seekTarget.x, sidekick.seekTarget.y);
       const targetTile = activeTiles[key];
       if (!targetTile || !targetTile.destructible || distToPlayer > 8) {
         sidekick.fsmState = 'follow'; sidekick.seekTarget = null; sidekick.queue = [];
       } else { return; }
    }

    if (sidekick.fsmState === 'follow' && !player.isMoving && Math.random() < 0.05) {
       let found = null; let minDist = 100;
       for (let x = player.x - 10; x <= player.x + 10; x++) {
         for (let y = player.y - 10; y <= player.y + 10; y++) {
            const tile = activeTiles[getTileKey(x, y)];
            if (tile && tile.destructible) {
               const dist = Math.abs(sidekick.x - x) + Math.abs(sidekick.y - y);
               if (dist < minDist) { minDist = dist; found = {x, y}; }
            }
         }
       }
       if (found) { sidekick.fsmState = 'seek'; sidekick.seekTarget = found; sidekick.queue = []; }
    }

    if (sidekick.fsmState === 'seek' && sidekick.seekTarget) {
       let dx = 0; let dy = 0;
       if (sidekick.x < sidekick.seekTarget.x) dx = 1; else if (sidekick.x > sidekick.seekTarget.x) dx = -1;
       else if (sidekick.y < sidekick.seekTarget.y) dy = 1; else if (sidekick.y > sidekick.seekTarget.y) dy = -1;

       const nextX = sidekick.x + dx; const nextY = sidekick.y + dy;
       if (Math.abs(nextX - sidekick.seekTarget.x) + Math.abs(nextY - sidekick.seekTarget.y) === 0) {
          sidekick.fsmState = 'sit'; return;
       }

       const tile = activeTiles[getTileKey(nextX, nextY)];
       if (!tile || !tile.solid) {
         sidekick.isMoving = true; sidekick.state = 'walking';
         sidekick.targetX = nextX; sidekick.targetY = nextY;
         sidekick.startX = sidekick.x; sidekick.startY = sidekick.y;
         sidekick.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
         sidekick.moveTimer = 0; sidekick.legToggle = !sidekick.legToggle;
       } else { sidekick.fsmState = 'sit'; }
       return;
    }

    // FIX: Keep 1 tile behind by checking queue.length > 1
    if (sidekick.fsmState === 'follow' && sidekick.queue.length > 1) {
        const nextPos = sidekick.queue.shift();
        sidekick.isMoving = true; sidekick.state = 'walking';
        sidekick.targetX = nextPos.x; sidekick.targetY = nextPos.y;
        sidekick.startX = sidekick.x; sidekick.startY = sidekick.y;
        sidekick.dir = nextPos.dir; sidekick.moveTimer = 0;
        sidekick.legToggle = !sidekick.legToggle;
    } else if (sidekick.fsmState === 'follow' && !player.isMoving && performance.now() - lastIdleTime > 2000) {
        if (sidekick.x < player.x) sidekick.dir = 'right'; else if (sidekick.x > player.x) sidekick.dir = 'left';
        else if (sidekick.y < player.y) sidekick.dir = 'down'; else if (sidekick.y > player.y) sidekick.dir = 'up';
    }
  }
}

function updateSidekickCat(dt) {
  // 1. Anti-Stuck Teleport Protocol
  const distToPlayer = Math.abs(player.x - sidekick.x) + Math.abs(player.y - sidekick.y);
  if (distToPlayer > 12) {
     sidekick.x = player.x; sidekick.y = player.y;
     sidekick.pixelX = player.x * TILE_SIZE; sidekick.pixelY = player.y * TILE_SIZE;
     sidekick.fsmState = 'follow'; sidekick.idleTimer = 0;
     sidekick.queue = []; sidekick.isMoving = false;
     return;
  }

  // 2. Dynamic Speed (Catch-up mechanic)
  const modifiedDt = sidekick.queue.length > 3 ? dt * 1.5 : dt;

  if (sidekick.isMoving) {
    moveEntity(sidekick, modifiedDt);
  } else {
    if (sidekick.fsmState === 'idle') {
       sidekick.idleTimer -= dt; sidekick.state = 'idle';
       if (distToPlayer <= 1) {
          gameStats.hiddenCatBonus++;
          spawnParticle(sidekick.x, sidekick.y - 1, "♥️", '#FF69B4');
          soundCut(); saveLocalData();
          sidekick.fsmState = 'follow'; sidekick.idleTimer = 0;
       } else if (sidekick.idleTimer <= 0) { sidekick.fsmState = 'follow'; }
       return;
    }

    if (sidekick.fsmState === 'follow') {
       if (Math.random() < 0.005) {
          sidekick.fsmState = 'idle';
          sidekick.idleTimer = 5000 + Math.random() * 5000;
          sidekick.queue = []; return;
       }

       // FIX: Keep 1 tile behind by checking queue.length > 1
       if (sidekick.queue.length > 1) {
          const nextPos = sidekick.queue.shift();
          sidekick.isMoving = true; sidekick.state = 'walking';
          sidekick.targetX = nextPos.x; sidekick.targetY = nextPos.y;
          sidekick.startX = sidekick.x; sidekick.startY = sidekick.y;
          sidekick.dir = nextPos.dir; sidekick.moveTimer = 0;
          sidekick.legToggle = !sidekick.legToggle;
       } else if (!player.isMoving && performance.now() - lastIdleTime > 2000) {
          if (sidekick.x < player.x) sidekick.dir = 'right'; else if (sidekick.x > player.x) sidekick.dir = 'left';
          else if (sidekick.y < player.y) sidekick.dir = 'down'; else if (sidekick.y > player.y) sidekick.dir = 'up';
       }
    }
  }
}

function updatePlayerAndSidekick(dt) {
  if (player.isMoving) {
    if (moveEntity(player, dt)) {
      incrementStep();
      lastIdleTime = performance.now();

      if (sidekick.active && sidekick.fsmState === 'follow' && userProfile.petType === 'None') {
          // If none pet, don't do anything
      } else if (sidekick.active && sidekick.fsmState === 'follow') {
        sidekick.queue.push({x: player.x, y: player.y, dir: player.dir});
      }
    }
  } else {
    tryStartPlayerMove();
  }

  if (sidekick.active) {
    if (userProfile.petType === 'Dog') {
      updateSidekickDog(dt);
    } else if (userProfile.petType === 'Cat') {
      updateSidekickCat(dt);
    }
  }
}

function spawnParticle(x, y, text, color) {
  particles.push({ x: x, y: y, text: text, color: color, life: 1.0 });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.life -= dt / 1000;
    p.y -= (dt / 1000) * 2;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// --- Minimap ---
let minimapCanvas;
let minimapCtx;
let offscreenMinimap;
let offscreenMinimapCtx;
let lastMinimapUpdate = 0;

function initMinimap() {
  minimapCanvas = document.getElementById('minimap');
  minimapCtx = minimapCanvas.getContext('2d', { alpha: false });

  minimapCanvas.width = 100;
  minimapCanvas.height = 100;

  if (window.OffscreenCanvas) {
    offscreenMinimap = new OffscreenCanvas(100, 100);
  } else {
    offscreenMinimap = document.createElement('canvas');
    offscreenMinimap.width = 100;
    offscreenMinimap.height = 100;
  }
  offscreenMinimapCtx = offscreenMinimap.getContext('2d', { alpha: false });
}

function updateMinimap(timestamp) {
  if (timestamp - lastMinimapUpdate < 1000) return; // 1Hz throttle
  lastMinimapUpdate = timestamp;

  const radius = 30; // 30 tile radius
  const step = 3; // Downsample: check 1 out of 3 tiles
  const pixelSize = 100 / ((radius * 2) / step); // Size of each block on the 100x100 canvas

  offscreenMinimapCtx.fillStyle = '#000';
  offscreenMinimapCtx.fillRect(0, 0, 100, 100);

  let drawX = 0;
  for (let x = player.x - radius; x <= player.x + radius; x += step) {
    let drawY = 0;
    for (let y = player.y - radius; y <= player.y + radius; y += step) {
      const biome = getBiome(x, y);

      switch (biome) {
        case 'forest': offscreenMinimapCtx.fillStyle = '#2d5a27'; break; // Green
        case 'desert': offscreenMinimapCtx.fillStyle = '#d2b48c'; break; // Tan/Sand
        case 'city': offscreenMinimapCtx.fillStyle = '#808080'; break; // Gray
        case 'sea': offscreenMinimapCtx.fillStyle = '#4682b4'; break; // Blue
        default: offscreenMinimapCtx.fillStyle = '#000';
      }

      // Draw player indicator
      if (Math.abs(x - player.x) <= step && Math.abs(y - player.y) <= step) {
         offscreenMinimapCtx.fillStyle = '#FFF'; // White square for player
      }

      offscreenMinimapCtx.fillRect(drawX * pixelSize, drawY * pixelSize, pixelSize, pixelSize);
      drawY++;
    }
    drawX++;
  }

  minimapCtx.drawImage(offscreenMinimap, 0, 0);
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

function getAssetMapping(type, edgeType = 'center', isSecondary = false, tx = 0, ty = 0) {
  if (type.endsWith('_base') || type.includes('water')) {
    const biome = type.split('_')[0];
    if (TILE_MAP[biome]) {
       if (edgeType !== 'center' && TILE_MAP[biome].edges && TILE_MAP[biome].edges[edgeType]) {
           return TILE_MAP[biome].edges[edgeType];
       }
       return TILE_MAP[biome][isSecondary ? 'secondary' : 'primary'];
    }
  }
  
  let assetGroup = null;
  if (TILE_MAP[type]) {
      assetGroup = TILE_MAP[type];
  } else if (type.includes('_small_obstacle')) {
     if (type.startsWith('forest')) assetGroup = TILE_MAP.forest_small_obstacle;
     else if (type.startsWith('desert')) assetGroup = TILE_MAP.desert_small_obstacle;
     else if (type.startsWith('city')) assetGroup = TILE_MAP.city_small_obstacle;
  } else if (type.includes('_tall_obstacle_anchor')) {
     if (type.startsWith('forest')) assetGroup = TILE_MAP.forest_tall_obstacle_anchor;
     else if (type.startsWith('desert')) assetGroup = TILE_MAP.desert_tall_obstacle_anchor;
     else if (type.startsWith('city')) assetGroup = TILE_MAP.city_tall_obstacle_anchor;
  } else if (type.includes('_large_obstacle_anchor')) {
     if (type.startsWith('forest')) assetGroup = TILE_MAP.forest_large_obstacle_anchor;
     else if (type.startsWith('desert')) assetGroup = TILE_MAP.desert_large_obstacle_anchor;
     else if (type.startsWith('city')) assetGroup = TILE_MAP.city_large_obstacle_anchor;
  }
  
  // שולף תמונה רנדומלית-קבועה מתוך המערך בהתבסס על הקואורדינטות
  if (Array.isArray(assetGroup)) {
      const hash = pseudoRandom(tx * 3.14, ty * 2.71); 
      const index = Math.floor(hash * assetGroup.length);
      return assetGroup[index];
  }
  
  return assetGroup || null;
}

function drawEntity(screenX, screenY, type, state, dir, frame, edgeType = 'center', isSecondary = false, tx = 0, ty = 0) {
  if (['player', 'dog', 'cat'].includes(type)) {
    let img;
    if (type === 'player') img = images[`player_${userProfile.gender}`] || images.player_Female;
    else if (type === 'dog') img = images.pet_Dog;
    else if (type === 'cat') img = images.pet_Cat;
    
    if (img && img.complete && img.naturalWidth > 0) {
      const row = getDirRow(dir);
      ctx.drawImage(img, frame * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, screenX, screenY, TILE_SIZE, TILE_SIZE);
    }
    return;
  }
  
  const asset = getAssetMapping(type, edgeType, isSecondary, tx, ty);
  if (asset) {
    const imgObj = images[asset.img];
    if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
      const w = (asset.w || 1) * TILE_SIZE;
      const h = (asset.h || 1) * TILE_SIZE;
      ctx.drawImage(imgObj, asset.sx, asset.sy, w, h, screenX, screenY, w, h);
    }
  }
}

function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  cameraX = player.pixelX - canvas.width / 2 + TILE_SIZE / 2;
  cameraY = player.pixelY - canvas.height / 2 + TILE_SIZE / 2;
  
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    const [tx, ty] = key.split(',').map(Number);
    const screenX = tx * TILE_SIZE - cameraX;
    const screenY = ty * TILE_SIZE - cameraY;
    
    const myBiome = tile.biome;
    let edgeType = 'center';
    let isSecondary = false;
    
    if (myBiome === 'sea') {
      isSecondary = pseudoRandom(tx * 0.45, ty * 0.45) > 0.75;
    } else {
      const topBiome = getBiome(tx, ty - 1);
      const bottomBiome = getBiome(tx, ty + 1);
      const leftBiome = getBiome(tx - 1, ty);
      const rightBiome = getBiome(tx + 1, ty);
      
      const top = (topBiome !== myBiome);
      const bottom = (bottomBiome !== myBiome);
      const left = (leftBiome !== myBiome);
      const right = (rightBiome !== myBiome);
      
      if (top && left) edgeType = 'tl';
      else if (top && right) edgeType = 'tr';
      else if (bottom && left) edgeType = 'bl';
      else if (bottom && right) edgeType = 'br';
      else if (top) edgeType = 't';
      else if (bottom) edgeType = 'b';
      else if (left) edgeType = 'l';
      else if (right) edgeType = 'r';
      else {
        isSecondary = pseudoRandom(tx * 0.45, ty * 0.45) > 0.75;
      }
    }
    
    let baseType = `${myBiome}_base`;
    drawEntity(screenX, screenY, baseType, 'idle', 'down', 0, edgeType, isSecondary, tx, ty);
  }
  
  for (let key in activeTiles) {
    const tile = activeTiles[key];
    if (tile.type !== 'multi_part' && !tile.type.endsWith('_base') && !tile.type.includes('water')) {
      const [tx, ty] = key.split(',').map(Number);
      const screenX = tx * TILE_SIZE - cameraX;
      const screenY = ty * TILE_SIZE - cameraY;
      drawEntity(screenX, screenY, tile.type, 'idle', 'down', 0, 'center', false, tx, ty);
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
    updateMinimap(timestamp);
  }
  
  if (currentState === GAME_STATE.PLAYING || currentState === GAME_STATE.PAUSED) {
     render();
  }
  
  requestAnimationFrame(gameLoop);
}
