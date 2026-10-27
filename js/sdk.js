// CrazyGames SDK v3 wrapper. Every call is guarded so the game also runs without the SDK (local testing).
let SDK = null;
const call = fn => { try { if (SDK) fn(SDK); } catch (e) {} };

export const DEVADS = /[?&]devads/.test(location.search);          // local testing: simulate ads
export const sdk = {
  touch: false,
  mute: /[?&]muteAudio=true/.test(location.search),               // platform mute (wins over in-game toggles)
  adMuted: false,
  adsOff: false,
  adBusy: false,
  onMute: null,       // set by the game: () => void
  onAdUI: null,       // set by the game: () => void
  onAuth: null,       // set by the game: () => void (progress follows the CrazyGames account)
};
try { sdk.touch = matchMedia('(pointer:coarse)').matches && !matchMedia('(pointer:fine)').matches; } catch (e) {}

export async function initSDK() {
  try {
    if (window.CrazyGames && window.CrazyGames.SDK) {
      await Promise.race([window.CrazyGames.SDK.init(), new Promise((_, rej) => setTimeout(() => rej('timeout'), 5000))]);
      SDK = window.CrazyGames.SDK;
      if (SDK.environment === 'disabled') { SDK = null; return; }
      const st = s => { if (s && typeof s.muteAudio === 'boolean') { sdk.mute = s.muteAudio; sdk.onMute && sdk.onMute(); } };
      try { st(SDK.game.settings); SDK.game.addSettingsChangeListener(st); } catch (e) {}
      try { const d = SDK.user.systemInfo.device.type; sdk.touch = sdk.touch || d === 'mobile' || d === 'tablet'; } catch (e) {}
      try {
        if (SDK.user && SDK.user.isUserAccountAvailable !== false) SDK.user.addAuthListener(() => sdk.onAuth && sdk.onAuth());
      } catch (e) {}
    }
  } catch (e) { SDK = null; }
}

export const loadingStart = () => call(s => s.game.loadingStart());
export const loadingStop = () => call(s => s.game.loadingStop());
export const happytime = () => call(s => s.game.happytime());

// gameplayStart/Stop, never sent twice in a row
let playing = false;
export function gameplay(on) {
  if (on === playing) return;
  playing = on;
  call(s => on ? s.game.gameplayStart() : s.game.gameplayStop());
}

// saves: CrazyGames data module when available (follows the account), localStorage otherwise
export function loadData(key) {
  try { if (SDK && SDK.data) return SDK.data.getItem(key); } catch (e) {}
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
export function saveData(key, val) {
  try { if (SDK && SDK.data) { SDK.data.setItem(key, val); return; } } catch (e) {}
  try { localStorage.setItem(key, val); } catch (e) {}
}
export function clearData(key) {
  try { if (SDK && SDK.data) { SDK.data.removeItem(key); return; } } catch (e) {}
  try { localStorage.removeItem(key); } catch (e) {}
}

export const adsOK = () => (!!SDK || DEVADS) && !sdk.adsOff;

function requestAd(type) {
  return new Promise(res => {
    if (!SDK) { if (DEVADS) setTimeout(() => res(true), 400); else res(false); return; }
    let done = false;
    const fin = ok => { if (done) return; done = true; sdk.adMuted = false; sdk.onMute && sdk.onMute(); res(ok); };
    try {
      SDK.ad.requestAd(type, {
        adStarted: () => { sdk.adMuted = true; sdk.onMute && sdk.onMute(); },   // mute only once an ad really starts
        adFinished: () => fin(true),
        adError: err => {                                                       // unfilled / blocked: continue, never reward
          const c = err && err.code;
          if (c === 'adsDisabled' || c === 'adblock') sdk.adsOff = true;
          fin(false);
        },
      });
    } catch (e) { fin(false); }
  });
}

// blocks the UI (spinner) from request until adFinished / adError; never chains two ads
export async function runAd(type) {
  if (sdk.adBusy) return false;
  sdk.adBusy = true; sdk.onAdUI && sdk.onAdUI();
  gameplay(false);
  try { return await requestAd(type); }
  finally { sdk.adBusy = false; sdk.onAdUI && sdk.onAdUI(); }
}
