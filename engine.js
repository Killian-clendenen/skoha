// Light Stockfish (stockfish.js 19 lite, single-threaded WASM, GPL-3.0) in a Web Worker.
const LEVELS = { easy: { skill: 0, time: 120, depth: 4 }, medium: { skill: 8, time: 350, depth: 10 }, hard: { skill: 20, time: 900, depth: 18 } };
export class Engine {
  constructor(url = 'vendor/stockfish/stockfish-19-lite-single.js') { this.url = url; this.w = null; this.ready = null; this.wait = null; }
  start() {
    if (this.ready) return this.ready;
    this.w = new Worker(this.url);
    this.w.onmessage = e => { const l = String(e.data); if (l === 'uciok' || l === 'readyok') this._ok?.(); if (l.startsWith('bestmove')) { const r = this.wait; this.wait = null; r?.(l.split(' ')[1]); } };
    this.ready = new Promise(res => { this._ok = () => { this._ok = null; res(); }; this.w.postMessage('uci'); });
    return this.ready;
  }
  async best(fen, level = 'easy') {
    await this.start(); const L = LEVELS[level] || LEVELS.easy;
    if (this.wait) { this.w.postMessage('stop'); await new Promise(r => setTimeout(r, 30)); }
    return new Promise(res => { this.wait = res;
      this.w.postMessage('setoption name Skill Level value ' + L.skill); this.w.postMessage('ucinewgame'); this.w.postMessage('position fen ' + fen);
      this.w.postMessage(`go movetime ${L.time} depth ${L.depth}`); });
  }
  stop() { if (this.w) { this.w.postMessage('stop'); } }
}
