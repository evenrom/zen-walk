import { userProfile, gameStats, saveLocalData, loadLocalData, setStepsSinceSync, stepsSinceSync, GAME_STATE, currentState } from './state.js';

export const GAS_URL = "https://script.google.com/macros/s/AKfycbzvzel3haBRBiJFQcxiwoL1rIIHdrLCb4mmWfkUcVSIB5xSFGDSYrgDaio7YV7spKV8CQ/exec";

export async function loadServerData(playerID) {
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
    loadLocalData();
  }
}

export function syncData() {
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
       setStepsSinceSync(0);
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
