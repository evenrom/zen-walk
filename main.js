// main.js
import { GAME_STATE, currentState, setCurrentState, userProfile, gameStats, loadLocalData } from './state.js';
import { loadServerData, syncData } from './api.js';
import { player, sidekick, handleActionA, updatePlayerAndSidekick } from './entities.js';
import { canvas, ctx, initImages, initMinimap, updateMinimap, render, resizeCanvas, spawnParticle, updateParticles } from './renderer.js';
import { updateWorld, TILE_SIZE } from './world.js';

export let lastTime = 0;
export let keys = { up: false, down: false, left: false, right: false, a: false, b: false };
export let audioCtx;

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

export function playBeep(frequency, duration, type = 'sine') {
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

export function soundCut() {
  playBeep(800, 0.1, 'square');
  if (navigator.vibrate) navigator.vibrate(50);
}

export function soundThud() {
  playBeep(150, 0.1, 'sawtooth');
  if (navigator.vibrate) navigator.vibrate(20);
}


window.onload = () => {
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
    setCurrentState(GAME_STATE.PLAYING);
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
    setCurrentState(GAME_STATE.PAUSED);
    document.getElementById('statsOverlay').classList.remove('hidden');
    updateStatsUI();
  } else if (currentState === GAME_STATE.PAUSED) {
    setCurrentState(GAME_STATE.PLAYING);
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
