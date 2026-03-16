// world.js
import { player } from './entities.js';
import { canvas } from './renderer.js';

export const TILE_SIZE = 96;
export let activeTiles = {}; // "x,y" -> { type, biome, destructible, multiTileParent }
export const OFF_SCREEN_BUFFER = 5; // Extra tiles rendered outside view

export const TILE_MAP = {
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

export function pseudoRandom(x, y) {
  let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return n - Math.floor(n);
}

export function getBiome(x, y) {
  // הסרנו את אילוץ החוף לבקשת ה-Product. כל ביומה יכולה לגעת בים חופשי.
  return getRawBiome(x, y);
}

export function getTileKey(x, y) {
  return `${x},${y}`;
}

export function generateTile(x, y) {
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

// 1. deterministicNoise: פונקציית רעש דטרמיניסטית קוהרנטית (כמו Perlin פשוטה)
export function deterministicNoise(x, y, seed) {
    let n = pseudoRandom(x + seed, y + seed);
    let s = Math.sin(x * 0.5 + seed);
    let c = Math.cos(y * 0.5 + seed);
    return (n + s + c) / 3; // מנורמל בערך לטווח [-1, 1]
}

// 2. applyZigzag: פונקציית ההיסט המזגזגת
export function applyZigzag(x, y) {
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
export function getRawBiome(x, y) {
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

export function updateWorld() {
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
