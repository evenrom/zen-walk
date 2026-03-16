// renderer.js
import { TILE_SIZE, activeTiles, getBiome, pseudoRandom, TILE_MAP } from './world.js';
import { player, sidekick, particles } from './entities.js';
import { userProfile, gameStats } from './state.js';
import { GAME_STATE, currentState } from './state.js';

export let canvas;
export let ctx;
export let cameraX = 0, cameraY = 0;

export const images = {
  player_Male: new Image(),
  player_Female: new Image(),
  player_Nonbinary: new Image(),
  pet_Dog: new Image(),
  pet_Cat: new Image(),
  tileset_environment: new Image(),
  tileset_obstacles: new Image()
};

export let imagesLoaded = 0;
export const totalImages = 6;

export function initImages() {
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
  images.player_Nonbinary = images.player_Female;
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

export function resizeCanvas() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}

export function updateDayNightCycle() {
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


let minimapCanvas;
let minimapCtx;
let offscreenMinimap;
let offscreenMinimapCtx;
let lastMinimapUpdate = 0;

export function initMinimap() {
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

export function updateMinimap(timestamp) {
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


export function getDirRow(dir) {
  switch(dir) {
    case 'down': return 0;
    case 'left': return 1;
    case 'right': return 2;
    case 'up': return 3;
    default: return 0;
  }
}

export function getAssetMapping(type, edgeType = 'center', isSecondary = false, tx = 0, ty = 0) {
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

export function drawEntity(screenX, screenY, type, state, dir, frame, edgeType = 'center', isSecondary = false, tx = 0, ty = 0) {
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

export function render() {
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


export function spawnParticle(x, y, text, color) {
  particles.push({ x: x, y: y, text: text, color: color, life: 1.0 });
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.life -= dt / 1000;
    p.y -= (dt / 1000) * 2;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
