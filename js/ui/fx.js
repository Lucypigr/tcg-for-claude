// 對戰特效：在固定的覆蓋層上依寶可夢位置播放動畫
import { cardHTML } from './cardview.js';
import { TYPE_NAMES } from '../engine/cards.js';

const TYPE_COLOR = { G: '#5fd35a', R: '#ff6a2b', W: '#3fa6ff', L: '#ffd92e', P: '#c46bff', F: '#e08a45', D: '#7a5cff', M: '#b8c6d6', N: '#e6b83a', C: '#f2efe6' };
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class FX {
  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'fx-layer';
    document.body.appendChild(this.layer);
  }
  destroy() { this.layer.remove(); }

  el(cls, html = '', style = {}) {
    const d = document.createElement('div');
    d.className = cls;
    if (html) d.innerHTML = html;
    Object.assign(d.style, style);
    this.layer.appendChild(d);
    return d;
  }
  center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  later(ms, fn) { setTimeout(fn, ms); }
  anim(node, frames, opts) {
    const a = node.animate(frames, { fill: 'forwards', ...opts });
    a.onfinish = () => node.remove();
    return a;
  }

  // 衝擊波 + 粒子
  burst(r, color, { size = 1, particles = 12 } = {}) {
    if (!r) return;
    const { x, y } = this.center(r);
    const ring = this.el('fx-ring', '', { left: `${x}px`, top: `${y}px`, borderColor: color, boxShadow: `0 0 24px ${color}` });
    this.anim(ring, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: `translate(-50%,-50%) scale(${2.4 * size})`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
    if (reduced()) return;
    for (let i = 0; i < particles; i++) {
      const p = this.el('fx-particle', '', { left: `${x}px`, top: `${y}px`, background: color, boxShadow: `0 0 8px ${color}` });
      const ang = (Math.PI * 2 * i) / particles + Math.random() * 0.5;
      const dist = (50 + Math.random() * 60) * size;
      this.anim(p, [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.2)`, opacity: 0 },
      ], { duration: 500 + Math.random() * 300, easing: 'cubic-bezier(.1,.8,.3,1)' });
    }
  }

  // 攻擊：蓄力 → 光彈飛向目標 → 斬擊
  attack(fromR, toR, type, name) {
    const color = TYPE_COLOR[type] || '#fff';
    if (fromR) {
      const glow = this.el('fx-charge', '', { left: `${fromR.left}px`, top: `${fromR.top}px`, width: `${fromR.width}px`, height: `${fromR.height}px`, boxShadow: `0 0 30px 8px ${color}`, borderColor: color });
      this.anim(glow, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 520 });
      const label = this.el('fx-atk-name', name, { left: `${fromR.left + fromR.width / 2}px`, top: `${fromR.top - 10}px`, color, textShadow: `0 0 12px ${color}, 0 2px 0 #000` });
      this.anim(label, [{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-14px) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-30px) scale(1)', opacity: 0 }], { duration: 1300 });
    }
    if (!fromR || !toR) return 0;
    const a = this.center(fromR), b = this.center(toR);
    const orb = this.el('fx-orb', TYPE_NAMES[type] || '', { left: `${a.x}px`, top: `${a.y}px`, background: `radial-gradient(circle, #fff 0 20%, ${color} 45%, transparent 70%)`, boxShadow: `0 0 30px 10px ${color}` });
    this.anim(orb, [
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15 },
      { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(1.3)`, opacity: 1 },
    ], { duration: 420, delay: 150, easing: 'cubic-bezier(.5,0,.9,.5)' });
    this.later(570, () => {
      this.slash(toR, color);
      this.burst(toR, color, { size: 1.2, particles: 16 });
    });
    return 600;
  }
  slash(r, color) {
    const { x, y } = this.center(r);
    for (let i = 0; i < 3; i++) {
      const s = this.el('fx-slash', '', { left: `${x}px`, top: `${y}px`, background: `linear-gradient(90deg, transparent, #fff 45%, ${color} 55%, transparent)` });
      const rot = -35 + i * 35 + (Math.random() * 10 - 5);
      this.anim(s, [
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(0)`, opacity: 1 },
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(1.1)`, opacity: 0 },
      ], { duration: 360, delay: i * 70 });
    }
  }
  damage(r, amount, delay = 0) {
    if (!r) return;
    this.later(delay, () => {
      const { x, y } = this.center(r);
      const big = amount >= 200 ? 'huge' : amount >= 100 ? 'big' : '';
      const d = this.el(`fx-number ${big}`, `-${amount}`, { left: `${x}px`, top: `${y}px` });
      this.anim(d, [
        { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15 },
        { transform: 'translate(-50%,-90%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-140%) scale(.9)', opacity: 0 },
      ], { duration: 1200, easing: 'ease-out' });
      if (amount >= 100) this.shake(amount >= 200 ? 12 : 7);
      if (amount >= 200) this.flash('rgba(255,80,40,.35)');
    });
  }
  counters(r, delay = 0) {
    if (!r) return;
    this.later(delay, () => this.burst(r, '#c46bff', { size: 0.8, particles: 10 }));
  }
  shake(px = 8) {
    if (reduced()) return;
    const board = document.querySelector('.board');
    board?.animate([
      { transform: 'translate(0,0)' }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: `translate(${px}px,${-px / 2}px)` },
      { transform: `translate(${-px / 2}px,${px / 3}px)` }, { transform: 'translate(0,0)' },
    ], { duration: 360 });
  }
  flash(color = 'rgba(255,255,255,.6)') {
    const f = this.el('fx-flash', '', { background: color });
    this.anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 450 });
  }
  ko(r, delay = 0) {
    if (!r) return;
    this.later(delay, () => {
      this.burst(r, '#ff3b1f', { size: 1.8, particles: 24 });
      this.burst(r, '#ffd83a', { size: 1.2, particles: 12 });
      const { x, y } = this.center(r);
      const t = this.el('fx-ko-text', '昏厥！', { left: `${x}px`, top: `${y}px` });
      this.anim(t, [
        { transform: 'translate(-50%,-50%) scale(3) rotate(-12deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(-6deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(-6deg)', opacity: 1, offset: 0.75 },
        { transform: 'translate(-50%,-80%) scale(.9) rotate(-6deg)', opacity: 0 },
      ], { duration: 1400 });
      this.shake(14);
      this.flash('rgba(255,255,255,.5)');
    });
  }
  energy(r, type) {
    if (!r) return;
    const color = TYPE_COLOR[type] || '#fff';
    const { x, y } = this.center(r);
    const e = this.el('fx-energy', TYPE_NAMES[type] || '', { left: `${x}px`, top: `${y}px`, background: color, boxShadow: `0 0 20px ${color}` });
    this.anim(e, [
      { transform: 'translate(-50%, 120px) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    ], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
    this.later(420, () => this.burst(r, color, { size: 0.7, particles: 8 }));
  }
  evolve(r, cid) {
    if (!r) return;
    const { x, y } = this.center(r);
    const rays = this.el('fx-rays', '', { left: `${x}px`, top: `${y}px` });
    this.anim(rays, [{ transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(60deg)', opacity: 1, offset: 0.4 }, { transform: 'translate(-50%,-50%) scale(1.6) rotate(120deg)', opacity: 0 }], { duration: 1000 });
    const w = this.el('fx-evo-glow', '', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.anim(w, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 800 });
    this.burst(r, '#fff6c2', { size: 1.1, particles: 14 });
    const t = this.el('fx-banner-small', '進化！', { left: `${x}px`, top: `${r.top - 6}px` });
    this.anim(t, [{ transform: 'translate(-50%,0) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-10px) scale(1)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-26px)', opacity: 0 }], { duration: 1100 });
  }
  ability(r) {
    if (!r) return;
    const a = this.el('fx-aura', '', { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.anim(a, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.4 }, { opacity: 0, transform: 'scale(1.2)' }], { duration: 900 });
    this.burst(r, '#d7a8ff', { size: 0.9, particles: 10 });
  }
  // 使用訓練家卡：放大展示卡片
  cardReveal(cid, fromOpp) {
    const wrap = this.el('fx-card-reveal', cardHTML(cid));
    const from = fromOpp ? '-120%' : '120%';
    this.anim(wrap, [
      { transform: `translate(-50%, ${from}) scale(.5) rotate(${fromOpp ? -8 : 8}deg)`, opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.05) rotate(0deg)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%,-50%) scale(.85)', opacity: 0 },
    ], { duration: 1150, easing: 'cubic-bezier(.2,.8,.3,1)' });
    const shine = this.el('fx-shine');
    this.anim(shine, [{ transform: 'translateX(-100%) skewX(-20deg)', opacity: 0 }, { transform: 'translateX(-100%) skewX(-20deg)', opacity: 1, offset: 0.2 }, { transform: 'translateX(100%) skewX(-20deg)', opacity: 0 }], { duration: 900 });
  }
  coin(heads) {
    const c = this.el('fx-coin', `<div class="coin-inner ${heads ? 'heads' : 'tails'}"><div class="coin-face front">正</div><div class="coin-face back">反</div></div>`);
    this.anim(c, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 1300 });
  }
  turn(mine, text) {
    const b = this.el(`fx-turn ${mine ? 'me' : 'opp'}`, `<span>${text}</span>`);
    this.anim(b, [
      { transform: 'translate(-110%,-50%) skewX(-12deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) skewX(-12deg)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%,-50%) skewX(-12deg)', opacity: 1, offset: 0.75 },
      { transform: 'translate(10%,-50%) skewX(-12deg)', opacity: 0 },
    ], { duration: 1300, easing: 'cubic-bezier(.3,.8,.3,1)' });
  }
  prize(mine, n) {
    const t = this.el(`fx-prize ${mine ? 'me' : 'opp'}`, `🎴 獲得 ${n} 張獎賞卡！`);
    this.anim(t, [{ transform: 'translate(-50%,20px) scale(.8)', opacity: 0 }, { transform: 'translate(-50%,0) scale(1)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%,0)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-20px)', opacity: 0 }], { duration: 1500 });
  }
}
