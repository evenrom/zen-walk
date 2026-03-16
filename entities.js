// entities.js
import { TILE_SIZE, activeTiles, getTileKey, generateTile } from './world.js';
import { gameStats, saveLocalData, userProfile, incrementStepsSinceSync } from './state.js';
import { syncData } from './api.js';
import { updateDayNightCycle, spawnParticle } from './renderer.js';
import { keys, soundCut, soundThud, playBeep } from './main.js';
import { GAME_STATE, currentState } from './state.js';

export const MOVE_DURATION = 200;

export let player = {
  x: 0, y: 0,
  pixelX: 0, pixelY: 0,
  targetX: 0, targetY: 0,
  startX: 0, startY: 0,
  dir: 'down', state: 'idle', frame: 1,
  isMoving: false, moveTimer: 0, legToggle: false
};

export let sidekick = {
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

export let particles = [];


// --- Core Logic ---
let lastIdleTime = 0;

function isSolid(tile) {
  if (!tile) return false;
  return tile.solid;
}

export function handleActionA() {
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

export function tryStartPlayerMove() {
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

export function updateSidekickDog(dt) {
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

export function updateSidekickCat(dt) {
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

export function updatePlayerAndSidekick(dt) {
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

export function collectItem(type) {
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

export function incrementStep() {
  gameStats.totalSteps++;
  incrementStepsSinceSync();
  saveLocalData();

  if (gameStats.totalSteps % 1000 === 0) {
    spawnParticle(player.x, player.y, `${gameStats.totalSteps / 1000}K!`, '#FFD700');
  }

  updateDayNightCycle();

  // Need to import stepsSinceSync from state.js and SYNC_THRESHOLD
  // Instead of direct check, let api.js handle periodic syncs
}
