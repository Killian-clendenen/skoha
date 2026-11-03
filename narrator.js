// Free, offline-capable narrator using the browser's Web Speech API (speechSynthesis).
import { sanToWords, speechText, pickVoice } from './core.js?v=20261103c';
const ss = () => window.speechSynthesis;
let unlocked = false, settings = () => ({});
export const Narrator = {
  log: [],
  supported: () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance),
  init(getSettings) {
    settings = getSettings;
    // iOS/Safari only allow speech after a user gesture: speak a silent utterance on the first tap
    const unlock = () => { if (unlocked || !this.supported()) return; unlocked = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; ss().speak(u); } catch {} };
    addEventListener('pointerdown', unlock, { once: true, capture: true }); addEventListener('keydown', unlock, { once: true, capture: true });
  },
  voices() { return this.supported() ? ss().getVoices() : []; },
  voice() { const v = this.voices(), n = settings().voice; return v.find(x => x.voiceURI === n || x.name === n) || pickVoice(v, navigator.language || 'en-US'); },
  cancel() { if (this.supported()) ss().cancel(); clearTimeout(this._t); },
  // say(san, text): cancel anything pending, wait for the move sound, then speak "Knight to f3. <explanation>"
  say(san, text, delay = 260) {
    const S = settings(); if (!S.narrator || !this.supported()) return;
    this.cancel();
    const words = [san ? sanToWords(san) : '', speechText(text)].filter(Boolean).join('. ');
    if (!words) return;
    this._t = setTimeout(() => {
      const u = new SpeechSynthesisUtterance(words), v = this.voice();
      if (v) { u.voice = v; u.lang = v.lang; } u.rate = +S.voiceRate || 1; u.pitch = +S.voicePitch || 1;
      this.log.push(words); ss().speak(u);
    }, delay);
  },
};
