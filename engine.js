// Light Stockfish (stockfish.js 19 lite, single-threaded WASM, GPL-3.0) in a Web Worker.
const LEVELS = { easy: { skill: 0, time: 120, depth: 4 }, medium: { skill: 8, time: 350, depth: 10 }, hard: { skill: 20, time: 900, depth: 18 } };
export class Engine {
  constructor(url = 'vendor/stockfish/stockfish-19-lite-single.js') { this.url = url; this.w = null; this.ready = null; this._job = null; }
  start() {
    if (this.ready) return this.ready;
    this.w = new Worker(this.url);
    this.w.onmessage = e => {
      const l = String(e.data);
      if (l === 'uciok' || l === 'readyok') this._ok?.();
      const job = this._job; if (!job) return;
      if (l.startsWith('info ')) job.info?.(l);
      if (l.startsWith('bestmove')) { this._job = null; job.done(l.split(' ')[1]); }
    };
    this.ready = new Promise(res => { this._ok = () => { this._ok = null; res(); }; this.w.postMessage('uci'); });
    return this.ready;
  }
  async _run(fen, { skill, time, depth, multipv, onInfo }) {
    await this.start();
    if (this._job) { this.w.postMessage('stop'); await new Promise(r => setTimeout(r, 40)); this._job = null; }
    this.w.postMessage('setoption name Skill Level value ' + skill);
    this.w.postMessage('setoption name MultiPV value ' + (multipv || 1));
    this.w.postMessage('ucinewgame');
    this.w.postMessage('position fen ' + fen);
    return new Promise(res => { this._job = { info: onInfo, done: res }; this.w.postMessage(`go movetime ${time} depth ${depth}`); });
  }
  async best(fen, level = 'easy') {
    const L = LEVELS[level] || LEVELS.easy;
    return this._run(fen, { skill: L.skill, time: L.time, depth: L.depth, multipv: 1 });
  }
  // Full-strength MultiPV search for Explore: top lines with eval. Time/depth capped for phones.
  async analyse(fen, { time = 700, depth = 12, multipv = 3 } = {}) {
    const parsed = new Map();
    const onInfo = l => {
      const pvStr = l.split(' pv ')[1]; if (!pvStr) return;
      const pv = pvStr.split(/\s+/).filter(Boolean);
      if (!pv[0] || pv[0] === '(none)') return;
      const mp = +(l.match(/\bmultipv (\d+)/)?.[1] || 1);
      const d = +(l.match(/\bdepth (\d+)/)?.[1] || 0);
      const mate = l.match(/\bscore mate (-?\d+)/);
      const cp = l.match(/\bscore cp (-?\d+)/);
      const prev = parsed.get(mp);
      if (prev && d < prev.depth) return;
      parsed.set(mp, { move: pv[0], pv, depth: d, cp: cp ? +cp[1] : null, mate: mate ? +mate[1] : null });
    };
    const best = await this._run(fen, { skill: 20, time, depth, multipv, onInfo });
    const lines = [...parsed.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    if (best && best !== '(none)' && !lines.some(x => x.move === best)) lines.unshift({ move: best, pv: [best], depth: 0, cp: null, mate: null });
    return { best, lines };
  }
  stop() { if (this.w) this.w.postMessage('stop'); this._job = null; }
}
