// state.js
export const GAME_STATE = {
  START: 0,
  PLAYING: 1,
  PAUSED: 2
};

export let currentState = GAME_STATE.START;
export function setCurrentState(state) { currentState = state; }

export let userProfile = {
  playerID: "",
  username: "",
  pin: "",
  gender: "",
  petType: "None"
};

export let gameStats = {
  totalSteps: 0,
  forestTreasures: 0,
  urbanArtifacts: 0,
  desertRelics: 0,
  hiddenCatBonus: 0
};

export let stepsSinceSync = 0;
export const SYNC_THRESHOLD = 100;
export function setStepsSinceSync(val) { stepsSinceSync = val; }
export function incrementStepsSinceSync() { stepsSinceSync++; }

export function loadLocalData() {
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

export function saveLocalData() {
  localStorage.setItem('zenWalkData', JSON.stringify(gameStats));
}
