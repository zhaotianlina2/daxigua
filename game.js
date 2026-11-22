/* ============================================================
   合成大西瓜 · 超果冻版
   matter.js 物理驱动 + 手绘果冻水果 + 全代码合成音效
   ============================================================ */
(function () {
  'use strict';
  if (window.__daxiguaLoaded) return;
  window.__daxiguaLoaded = true;

  /* ---------- 小工具 ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function nowMs() { return performance.now(); }
  function $(id) { return document.getElementById(id); }
  function easeOutBack(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
    var g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
    var b = clamp(Math.round((n & 255) * f), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- 常量 ---------- */
  var GAME_W = 375, GAME_H = 640;
  var DROP_Y = 92;
  var DANGER_Y = 128;
  var NEXT_DELAY = 520;
  var COMBO_WINDOW = 1400;

  var FRUITS = [
    { r: 13, name: '樱桃',   c1: '#ff97a8', c2: '#e8465f', face: 'shy'    },
    { r: 17, name: '草莓',   c1: '#ffa2ad', c2: '#f2426d', face: 'happy'  },
    { r: 22, name: '葡萄',   c1: '#c39bf5', c2: '#8e5cf0', face: 'sleepy' },
    { r: 28, name: '橘子',   c1: '#ffcf6b', c2: '#f7a01d', face: 'happy'  },
    { r: 34, name: '柿子',   c1: '#ffab70', c2: '#f26b2a', face: 'shy'    },
    { r: 41, name: '苹果',   c1: '#ff8c8c', c2: '#ec3b3b', face: 'happy'  },
    { r: 48, name: '青梨',   c1: '#d3ea85', c2: '#a4c93f', face: 'sleepy' },
    { r: 56, name: '桃子',   c1: '#ffc3ce', c2: '#ff8fae', face: 'shy'    },
    { r: 64, name: '菠萝',   c1: '#ffe084', c2: '#f0b429', face: 'happy'  },
    { r: 73, name: '哈密瓜', c1: '#c2ecab', c2: '#8bc98a', face: 'sleepy' },
    { r: 83, name: '大西瓜', c1: '#8fe08f', c2: '#43b649', face: 'happy'  }
  ];
  var SMALL_WEIGHTS = [28, 26, 20, 15, 11];
  var INK = 'rgba(70,38,22,0.92)';

  /* ---------- DOM ---------- */
  var root = document.getElementById('daxigua-root');
  if (!root || typeof Matter === 'undefined') return;
  var canvas = $('dax-game'), ctx = canvas.getContext('2d');
  var nextCv = $('dax-next'), nctx = nextCv.getContext('2d');
  var logoCv = $('dax-logo');
  var elScore = $('dax-score'), elBest = $('dax-best'), elStartBest = $('dax-startbest');
  var elFinal = $('dax-final'), elOverBest = $('dax-overbest'), elNewBest = $('dax-newbest'), elOverFruit = $('dax-overfruit');
  var startOverlay = $('dax-start'), overOverlay = $('dax-over'), toastEl = $('dax-toast');
  var btnStart = $('dax-btn-start'), btnAgain = $('dax-btn-again'), btnShare = $('dax-btn-share');
  var btnMute = $('dax-btn-mute'), btnRestart = $('dax-btn-restart');

  /* ---------- 状态 ---------- */
  var state = 'idle';                 // idle | playing | over
  var score = 0, best = 0, maxLevel = 0;
  var fruits = [];
  var currentLevel = 0, nextLevel = 0, canDrop = true, nextFruitAt = 0;
  var aimX = GAME_W / 2, pressing = false;
  var comboCount = 0, lastMergeAt = -1e9;
  var dangerTime = 0;
  var shakeMag = 0, flashA = 0;
  var particles = [], floats = [], rings = [], timers = [];
  var mergeQueue = [];
  var idleNextAt = 0;
  var hangBlinkAt = nowMs() + 2000;
  var lastThudAt = 0;
  var newBestFlag = false;
  var muted = false;
  try {
    best = +localStorage.getItem('dax_best') || 0;
    muted = localStorage.getItem('dax_muted') === '1';
  } catch (e) {}

  /* ---------- 画布尺寸 ---------- */
  var k = 1, dpr = 1;
  var bgCv = document.createElement('canvas'), bgCtx = bgCv.getContext('2d'), bgDirty = true;

  function resize() {
    var cssW = root.clientWidth || 375;
    var cssH = cssW * GAME_H / GAME_W;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    root.style.fontSize = (cssW * 0.042) + 'px';
    k = canvas.width / GAME_W || 1;
    var em = cssW * 0.042;
    nextCv.width = nextCv.height = Math.max(16, Math.round(em * 2.6 * dpr));
    bgDirty = true;
    drawNextPreview();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
  window.addEventListener('resize', resize);

  /* ---------- 音效：全部 WebAudio 现场合成 ---------- */
  var AC = null, masterGain = null, noiseBuf = null;
  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      AC = new Ctx();
      var comp = AC.createDynamicsCompressor();
      masterGain = AC.createGain();
      masterGain.gain.value = muted ? 0 : 0.5;
      masterGain.connect(comp);
      comp.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  function tone(o) {
    if (!AC) return;
    var t0 = AC.currentTime + (o.delay || 0);
    var osc = AC.createOscillator(), g = AC.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + (o.dur || 0.15));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.3, t0 + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + (o.dur || 0.15));
    osc.connect(g); g.connect(masterGain);
    osc.start(t0); osc.stop(t0 + (o.dur || 0.15) + 0.06);
  }
  function noiseHit(o) {
    if (!AC) return;
    var t0 = AC.currentTime + (o.delay || 0);
    var src = AC.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = rand(0.9, 1.1);
    var bp = AC.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.sweepTo) bp.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur);
    bp.Q.value = o.q || 0.9;
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + o.dur);
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }
  function sfxClick() { tone({ f0: 660, f1: 880, type: 'square', dur: 0.06, vol: 0.07 }); }
  function sfxDrop() { tone({ f0: 175, f1: 92, type: 'sine', dur: 0.1, vol: 0.2 }); }
  function sfxThud() {
    var t = nowMs();
    if (t - lastThudAt < 90) return;
    lastThudAt = t;
    tone({ f0: 120, f1: 58, type: 'sine', dur: 0.09, vol: 0.13 });
    noiseHit({ f: 380, dur: 0.05, vol: 0.05 });
  }
  function sfxPop(level, combo) {
    var base = 300 * Math.pow(2, (level * 2 + Math.min(combo, 8)) / 12);
    tone({ f0: base * 0.85, f1: base * 1.65, type: 'triangle', dur: 0.15, vol: 0.26 });
    noiseHit({ f: 2300, dur: 0.045, vol: 0.1 });
    if (combo >= 4) tone({ f0: base * 2, type: 'sine', dur: 0.22, vol: 0.1, delay: 0.05 });
    if (combo >= 6) tone({ f0: base * 3, type: 'sine', dur: 0.26, vol: 0.08, delay: 0.1 });
  }
  function sfxExplode() {
    noiseHit({ f: 900, sweepTo: 110, dur: 0.55, vol: 0.42 });
    tone({ f0: 105, f1: 38, type: 'sine', dur: 0.45, vol: 0.42 });
    tone({ f0: 1200, f1: 2600, type: 'sine', dur: 0.35, vol: 0.1, delay: 0.04 });
  }
  function sfxGameOver() {
    [392, 311, 262, 196].forEach(function (f, i) {
      tone({ f0: f, type: 'triangle', dur: 0.26, vol: 0.2, delay: i * 0.21 });
    });
  }
  function sfxBest() {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) {
      tone({ f0: f, type: 'triangle', dur: 0.2, vol: 0.18, delay: i * 0.09 });
    });
  }

  /* ---------- 水果贴图（离屏缓存，手绘果冻质感） ---------- */
  var spriteCache = [];
  function getSprite(level) {
    if (spriteCache[level]) return spriteCache[level];
    var f = FRUITS[level];
    var pad = Math.ceil(f.r * 0.55) + 8;
    var size = (f.r + pad) * 2;
    var S = 2;
    var cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * S);
    var c = cv.getContext('2d');
    c.scale(S, S);
    c.translate(size / 2, size / 2);
    drawFruitBody(c, level, f.r);
    var sp = { cv: cv, size: size, half: size / 2 };
    spriteCache[level] = sp;
    return sp;
  }
  function drawFruitBody(c, level, r) {
    var f = FRUITS[level];
    var rim = shade(f.c2, 0.72);

    function bodyCircle() { c.beginPath(); c.arc(0, 0, r, 0, TAU); }
    function clipBody(fn) {
      c.save(); bodyCircle(); c.clip(); fn(); c.restore();
    }

    // 主体：径向渐变 + 暗色包边
    var g = c.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.12, 0, 0, r * 1.06);
    g.addColorStop(0, shade(f.c1, 1.12));
    g.addColorStop(0.55, f.c1);
    g.addColorStop(1, f.c2);
    bodyCircle(); c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1.2, r * 0.05); c.strokeStyle = rim; c.stroke();

    // 底部反光
    clipBody(function () {
      c.beginPath(); c.arc(r * 0.1, r * 0.55, r * 0.75, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    });

    // 各水果特征细节
    if (level === 0) {            // 樱桃：果柄
      c.strokeStyle = '#8a5a2b'; c.lineWidth = Math.max(1.6, r * 0.14); c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -r * 0.86); c.quadraticCurveTo(r * 0.32, -r - r * 0.42, r * 0.62, -r - r * 0.5); c.stroke();
    } else if (level === 1) {     // 草莓：籽
      clipBody(function () {
        c.fillStyle = 'rgba(255,224,126,0.95)';
        var seeds = [[-0.42, -0.34], [0.02, -0.5], [0.44, -0.28], [-0.3, 0.12], [0.32, 0.16], [0, 0.52], [-0.55, 0.3], [0.58, 0.34]];
        seeds.forEach(function (s) {
          c.beginPath(); c.ellipse(s[0] * r, s[1] * r, r * 0.05, r * 0.075, 0, 0, TAU); c.fill();
        });
      });
      leafPair(c, r, 0.5, -0.1);
    } else if (level === 2) {     // 葡萄：小高光团
      clipBody(function () {
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.beginPath(); c.arc(r * 0.3, r * 0.35, r * 0.3, 0, TAU); c.fill();
      });
    } else if (level === 3) {     // 橘子：双叶
      leafPair(c, r, 0.62, -0.42);
    } else if (level === 4) {     // 柿子：萼片
      c.fillStyle = '#3a7d2c';
      for (var i = 0; i < 4; i++) {
        var a = -Math.PI / 2 + (i - 1.5) * 0.55;
        c.save(); c.translate(0, -r * 0.9); c.rotate(a + Math.PI / 2);
        c.beginPath(); c.ellipse(0, 0, r * 0.3, r * 0.13, 0, 0, TAU); c.fill(); c.restore();
      }
    } else if (level === 5) {     // 苹果：柄 + 叶
      stem(c, r, 1);
      leafPair(c, r, 0.6, -0.55);
    } else if (level === 6) {     // 青梨：短柄
      stem(c, r, 0.7);
    } else if (level === 7) {     // 桃子：中缝 + 叶
      clipBody(function () {
        c.strokeStyle = 'rgba(214,90,120,0.4)'; c.lineWidth = Math.max(1.2, r * 0.045);
        c.beginPath(); c.moveTo(0, -r * 0.95); c.quadraticCurveTo(r * 0.22, -r * 0.3, r * 0.1, r * 0.35); c.stroke();
      });
      leafPair(c, r, 0.6, -0.5);
    } else if (level === 8) {     // 菠萝：网格 + 皇冠叶
      clipBody(function () {
        c.strokeStyle = 'rgba(170,110,20,0.4)'; c.lineWidth = Math.max(1.2, r * 0.035);
        for (var d = -3; d <= 3; d++) {
          c.beginPath(); c.moveTo(d * r * 0.42 - r, -r); c.lineTo(d * r * 0.42 + r, r); c.stroke();
          c.beginPath(); c.moveTo(d * r * 0.42 + r, -r); c.lineTo(d * r * 0.42 - r, r); c.stroke();
        }
      });
      c.fillStyle = '#2e8b3a';
      [-0.55, 0, 0.55].forEach(function (s, i) {
        c.save(); c.translate(s * r * 0.4, -r * (i === 1 ? 1.04 : 0.92)); c.rotate(s * 0.7);
        c.beginPath(); c.ellipse(0, -r * 0.18, r * 0.11, r * 0.3, 0, 0, TAU); c.fill(); c.restore();
      });
    } else if (level === 9) {     // 哈密瓜：网纹
      clipBody(function () {
        c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = Math.max(1, r * 0.03);
        for (var i = -2; i <= 2; i++) {
          c.beginPath();
          c.moveTo(i * r * 0.45 - r * 0.4, -r);
          c.quadraticCurveTo(i * r * 0.45 + r * 0.15, 0, i * r * 0.45 - r * 0.4, r);
          c.stroke();
        }
        c.beginPath(); c.moveTo(-r, -r * 0.4); c.quadraticCurveTo(0, -r * 0.05, r, -r * 0.4); c.stroke();
        c.beginPath(); c.moveTo(-r, r * 0.4); c.quadraticCurveTo(0, r * 0.05, r, r * 0.4); c.stroke();
      });
    } else {                      // 大西瓜：墨绿条纹 + 卷须
      clipBody(function () {
        c.fillStyle = 'rgba(18,105,45,0.55)';
        for (var i = -2; i <= 2; i++) {
          c.beginPath();
          c.ellipse(i * r * 0.42, 0, r * 0.1, r * 1.02, 0, 0, TAU);
          c.fill();
        }
      });
      c.strokeStyle = '#5a7d3a'; c.lineWidth = Math.max(2, r * 0.05); c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, -r * 0.94);
      c.quadraticCurveTo(r * 0.1, -r - r * 0.28, r * 0.3, -r - r * 0.16);
      c.quadraticCurveTo(r * 0.42, -r - r * 0.06, r * 0.34, -r - r * 0.02);
      c.stroke();
    }

    // 高光
    c.save(); c.rotate(-0.5);
    c.beginPath(); c.ellipse(-r * 0.34, -r * 0.4, r * 0.26, r * 0.13, 0, 0, TAU);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    c.beginPath(); c.arc(-r * 0.12, -r * 0.56, r * 0.06, 0, TAU); c.fill();
    c.restore();
  }
  function stem(c, r, len) {
    c.strokeStyle = '#8a5a2b'; c.lineWidth = Math.max(1.8, r * 0.07); c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -r * 0.9); c.quadraticCurveTo(r * 0.06, -r * (0.9 + len * 0.28), r * 0.16, -r * (0.9 + len * 0.34)); c.stroke();
  }
  function leafPair(c, r, s, rot) {
    c.save(); c.translate(0, -r * 0.9); c.rotate(rot);
    c.fillStyle = '#4a9d3f';
    c.beginPath(); c.ellipse(-s * r * 0.42, -r * 0.06, s * r * 0.34, s * r * 0.16, -0.5, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(s * r * 0.42, -r * 0.06, s * r * 0.34, s * r * 0.16, 0.5, 0, TAU); c.fill();
    c.restore();
  }

  /* ---------- 表情（实时画，支持眨眼/难过） ---------- */
  function drawFace(c, r, type, opt) {
    var eyeDX = r * 0.3, eyeY = -r * 0.1, eyeR = Math.max(1.4, r * 0.1);
    c.strokeStyle = INK; c.fillStyle = INK;
    c.lineWidth = Math.max(1.4, r * 0.07); c.lineCap = 'round';
    for (var side = -1; side <= 1; side += 2) {
      var ex = side * eyeDX;
      if (opt.blink || (type === 'sleepy' && !opt.sad)) {
        c.beginPath(); c.moveTo(ex - eyeR * 1.4, eyeY);
        c.quadraticCurveTo(ex, eyeY + eyeR * 1.6, ex + eyeR * 1.4, eyeY);
        c.stroke();
      } else if (type === 'shy' && !opt.sad) {
        c.beginPath(); c.arc(ex, eyeY + eyeR * 1.1, eyeR * 1.5, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
      } else {
        c.beginPath(); c.arc(ex, eyeY, eyeR, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.92)';
        c.beginPath(); c.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.34, 0, TAU); c.fill();
        c.fillStyle = INK;
      }
      if (opt.sad) {   // 眉毛垂下来
        c.beginPath();
        c.moveTo(ex - side * eyeR * 1.3, eyeY - eyeR * 2.1);
        c.lineTo(ex + side * eyeR * 1.3, eyeY - eyeR * 2.6);
        c.stroke();
      }
    }
    // 腮红
    if (r >= 15) {
      c.fillStyle = 'rgba(255,110,130,' + (type === 'shy' ? 0.4 : 0.26) + ')';
      c.beginPath(); c.arc(-eyeDX * 1.55, r * 0.1, r * 0.13, 0, TAU); c.fill();
      c.beginPath(); c.arc(eyeDX * 1.55, r * 0.1, r * 0.13, 0, TAU); c.fill();
    }
    // 嘴
    var my = r * 0.18;
    if (opt.sad) {
      c.beginPath(); c.arc(0, my + r * 0.2, r * 0.15, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
      // 眼泪
      if (Math.sin(opt.t / 180) > 0) {
        c.fillStyle = 'rgba(90,165,255,0.85)';
        c.beginPath(); c.arc(-eyeDX, eyeY + r * 0.22, Math.max(1.4, r * 0.07), 0, TAU); c.fill();
      }
    } else if (type === 'sleepy') {
      c.beginPath(); c.arc(0, my, Math.max(1.2, r * 0.06), 0, TAU); c.fill();
    } else {
      c.beginPath(); c.arc(0, my - r * 0.06, r * 0.16, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    }
  }

  /* ---------- 物理世界 ---------- */
  var Engine = Matter.Engine, Bodies = Matter.Bodies, Body = Matter.Body,
      Composite = Matter.Composite, Events = Matter.Events;

  var engine = Engine.create({ positionIterations: 8, velocityIterations: 6 });
  engine.gravity.y = 1.15;
  var world = engine.world;

  var wallOpts = { isStatic: true, friction: 0.4, restitution: 0.05, label: 'wall' };
  Composite.add(world, [
    Bodies.rectangle(GAME_W / 2, GAME_H + 100, GAME_W + 500, 200, wallOpts),
    Bodies.rectangle(-100, GAME_H / 2 - 300, 200, GAME_H + 1000, wallOpts),
    Bodies.rectangle(GAME_W + 100, GAME_H / 2 - 300, 200, GAME_H + 1000, wallOpts)
  ]);

  function spawnFruit(level, x, y, opts) {
    opts = opts || {};
    var f = FRUITS[level];
    var body = Bodies.circle(x, y, f.r, {
      restitution: 0.12,
      friction: 0.35,
      frictionStatic: 0.5,
      frictionAir: 0.008,
      density: 0.0012,
      label: 'fruit'
    });
    body.plugin = {
      kind: 'fruit', level: level,
      born: nowMs(),
      droppedAt: opts.dropped ? nowMs() : 0,
      blinkAt: nowMs() + rand(1200, 5200),
      sad: false, dead: false, queued: false
    };
    Composite.add(world, body);
    fruits.push(body);
    return body;
  }
  function removeFruit(body) {
    if (body.plugin.dead) return;
    body.plugin.dead = true;
    Composite.remove(world, body);
    var i = fruits.indexOf(body);
    if (i >= 0) fruits.splice(i, 1);
  }

  Events.on(engine, 'collisionStart', function (e) {
    for (var i = 0; i < e.pairs.length; i++) {
      var a = e.pairs[i].bodyA, b = e.pairs[i].bodyB;
      if (a.label === 'fruit' && b.label === 'fruit') {
        if (a.plugin.level === b.plugin.level && !a.plugin.dead && !b.plugin.dead &&
            !a.plugin.queued && !b.plugin.queued) {
          a.plugin.queued = true; b.plugin.queued = true;
          mergeQueue.push([a, b]);
        }
      } else {
        var f = a.label === 'fruit' ? a : (b.label === 'fruit' ? b : null);
        if (f && f.speed > 4.5) sfxThud();
      }
    }
  });

  function processMerges() {
    if (!mergeQueue.length) return;
    var q = mergeQueue; mergeQueue = [];
    for (var i = 0; i < q.length; i++) {
      var a = q[i][0], b = q[i][1];
      if (a.plugin.dead || b.plugin.dead) continue;
      var level = a.plugin.level;
      var x = (a.position.x + b.position.x) / 2;
      var y = (a.position.y + b.position.y) / 2;
      removeFruit(a); removeFruit(b);
      if (level === FRUITS.length - 1) { explodeWatermelon(x, y); continue; }
      var nb = spawnFruit(level + 1, clamp(x, FRUITS[level + 1].r + 2, GAME_W - FRUITS[level + 1].r - 2), y);
      Body.setVelocity(nb, { x: a.velocity.x * 0.3, y: -1.3 });
      Body.setAngularVelocity(nb, rand(-0.09, 0.09));
      nb.plugin.born = nowMs();
      onMerge(level, x, y);
    }
  }

  /* ---------- 得分 / 连击 / 特效 ---------- */
  function addScore(base, x, y, big) {
    score += base;
    elScore.textContent = score;
    elScore.classList.remove('dax-popscore');
    void elScore.offsetWidth;
    elScore.classList.add('dax-popscore');
    if (x !== undefined) {
      floats.push({
        x: x, y: y, text: '+' + base, life: 0.9, age: 0,
        size: big ? 24 : 15,
        color: big ? '#ff4d3a' : '#ffffff',
        stroke: big ? '#ffffff' : 'rgba(205,85,30,0.9)',
        vy: -52
      });
    }
  }
  function burst(x, y, n, color, power) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), sp = rand(70, 230) * (power || 1);
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        g: 620, age: 0, life: rand(0.45, 0.9),
        size: rand(2, 4.6) + (power || 1),
        color: color,
        star: Math.random() < 0.22,
        rot: rand(0, TAU), vr: rand(-8, 8)
      });
    }
  }
  function confetti(n) {
    var colors = ['#ff5a4e', '#ffb14e', '#ffe066', '#7bd88a', '#5ac8fa', '#c39bf5', '#ff8fab'];
    for (var i = 0; i < n; i++) {
      particles.push({
        x: rand(0, GAME_W), y: rand(-90, -10),
        vx: rand(-70, 70), vy: rand(110, 260),
        g: 260, age: 0, life: rand(1.7, 2.7),
        size: rand(4, 7), color: pick(colors),
        conf: true, rot: rand(0, TAU), vr: rand(-7, 7)
      });
    }
  }
  function onMerge(level, x, y) {
    var t = nowMs();
    burst(x, y, 8 + level * 2, FRUITS[level].c2, 1 + level * 0.14);
    if (state !== 'playing') { if (AC) sfxPop(level, 1); return; }
    comboCount = (t - lastMergeAt <= COMBO_WINDOW) ? comboCount + 1 : 1;
    lastMergeAt = t;
    var mult = Math.min(comboCount, 8);
    addScore((level + 2) * 2 * mult, x, y);
    maxLevel = Math.max(maxLevel, level + 1);
    sfxPop(level, comboCount);
    shakeMag = Math.max(shakeMag, 2 + level * 0.9);
    if (comboCount >= 3) {
      floats.push({
        x: GAME_W / 2, y: 205, text: '连击 x' + comboCount + '！',
        life: 0.85, age: 0, size: 21 + Math.min(comboCount, 8), vy: -34,
        color: '#ff8a1e', stroke: '#ffffff', punch: true
      });
    }
    if (level + 1 === 10) {
      flashA = Math.max(flashA, 0.55);
      rings.push({ x: x, y: y, r: 30, age: 0, life: 0.55 });
      confetti(46);
      floats.push({
        x: GAME_W / 2, y: GAME_H * 0.36, text: '🍉 合成大西瓜！',
        life: 1.5, age: 0, size: 30, vy: -22,
        color: '#ff5722', stroke: '#ffffff', punch: true
      });
      sfxBest();
    }
  }
  function explodeWatermelon(x, y) {
    if (state === 'playing') addScore(200, x, y, true);
    flashA = 0.9; shakeMag = Math.max(shakeMag, 16);
    rings.push({ x: x, y: y, r: 24, age: 0, life: 0.6 });
    burst(x, y, 34, '#ff5a4e', 2.6);
    burst(x, y, 18, '#7bd88a', 2);
    if (AC) sfxExplode();
    floats.push({
      x: GAME_W / 2, y: GAME_H * 0.36, text: '双瓜爆炸！',
      life: 1.4, age: 0, size: 28, vy: -22,
      color: '#ff3b30', stroke: '#ffffff', punch: true
    });
    var victims = fruits.filter(function (f) {
      return !f.plugin.dead && Math.hypot(f.position.x - x, f.position.y - y) < 135;
    }).sort(function (p, q) {
      return Math.hypot(p.position.x - x, p.position.y - y) - Math.hypot(q.position.x - x, q.position.y - y);
    });
    victims.forEach(function (f, i) {
      timers.push({ at: nowMs() + 60 + i * 55, fn: function () {
        if (f.plugin.dead) return;
        var lv = f.plugin.level;
        var fx = f.position.x, fy = f.position.y;
        removeFruit(f);
        if (state === 'playing') addScore((lv + 1) * 3, fx, fy);
        burst(fx, fy, 9, FRUITS[lv].c2, 1.4);
        if (AC) sfxPop(lv, 1);
      } });
    });
  }

  /* ---------- 输入 ---------- */
  function updateAim(e) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    aimX = clamp((e.clientX - rect.left) / rect.width * GAME_W, 0, GAME_W);
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'playing') return;
    pressing = true; updateAim(e);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (state !== 'playing') return;
    if (pressing || e.pointerType === 'mouse') updateAim(e);
  });
  window.addEventListener('pointerup', function () {
    if (!pressing) return;
    pressing = false;
    if (state === 'playing') dropFruit();
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function randomSmallLevel() {
    var total = 0, i;
    for (i = 0; i < SMALL_WEIGHTS.length; i++) total += SMALL_WEIGHTS[i];
    var r = Math.random() * total;
    for (i = 0; i < SMALL_WEIGHTS.length; i++) {
      r -= SMALL_WEIGHTS[i];
      if (r < 0) return i;
    }
    return 0;
  }
  function dropFruit() {
    if (state !== 'playing' || !canDrop) return;
    var r = FRUITS[currentLevel].r;
    var x = clamp(aimX, r + 2, GAME_W - r - 2);
    var b = spawnFruit(currentLevel, x, DROP_Y, { dropped: true });
    Body.setVelocity(b, { x: 0, y: 2 });
    maxLevel = Math.max(maxLevel, currentLevel);
    sfxDrop();
    canDrop = false;
    currentLevel = nextLevel;
    nextLevel = randomSmallLevel();
    drawNextPreview();
    nextFruitAt = nowMs() + NEXT_DELAY;
  }

  /* ---------- 危险线 / 结束 ---------- */
  function updateDanger(t, dt) {
    if (state !== 'playing') { dangerTime = 0; return; }
    var danger = false;
    for (var i = 0; i < fruits.length; i++) {
      var f = fruits[i], p = f.plugin;
      if (p.dead) continue;
      if (p.droppedAt && t - p.droppedAt < 900) continue;
      if (f.speed > 1.4) continue;
      if (f.position.y - FRUITS[p.level].r < DANGER_Y) { danger = true; break; }
    }
    dangerTime = danger ? dangerTime + dt : Math.max(0, dangerTime - dt * 2.5);
    if (dangerTime > 1500) gameOver();
  }
  function gameOver() {
    state = 'over';
    fruits.forEach(function (f) { f.plugin.sad = true; });
    sfxGameOver();
    newBestFlag = score > best;
    if (newBestFlag) {
      best = score;
      try { localStorage.setItem('dax_best', String(best)); } catch (e) {}
      updateBestUI();
    }
    timers.push({ at: nowMs() + 1000, fn: function () {
      elOverBest.textContent = '历史最高 ' + best;
      elOverFruit.textContent = '本局最大合成：' + FRUITS[maxLevel].name;
      elNewBest.classList.toggle('dax-hidden', !newBestFlag);
      overOverlay.classList.remove('dax-hidden');
      countUp(elFinal, score, 900);
      if (newBestFlag) { confetti(130); sfxBest(); }
    } });
  }
  function countUp(el, target, dur) {
    var t0 = nowMs();
    var stepMs = 30;
    var timer = setInterval(function () {
      var p = Math.min(1, (nowMs() - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p >= 1) clearInterval(timer);
    }, stepMs);
  }

  /* ---------- 流程 ---------- */
  function resetWorld() {
    while (fruits.length) removeFruit(fruits[0]);
    mergeQueue = []; timers = []; particles = []; floats = []; rings = [];
    score = 0; elScore.textContent = '0';
    comboCount = 0; lastMergeAt = -1e9; maxLevel = 0;
    dangerTime = 0; shakeMag = 0; flashA = 0;
    canDrop = true; pressing = false;
    currentLevel = randomSmallLevel();
    nextLevel = randomSmallLevel();
    drawNextPreview();
  }
  function startGame() {
    resetWorld();
    state = 'playing';
    startOverlay.classList.add('dax-hidden');
    overOverlay.classList.add('dax-hidden');
  }
  btnStart.addEventListener('click', function () { initAudio(); sfxClick(); startGame(); });
  btnAgain.addEventListener('click', function () { initAudio(); sfxClick(); startGame(); });
  btnRestart.addEventListener('click', function () {
    initAudio(); sfxClick();
    if (state === 'idle') startGame(); else startGame();
  });
  function applyMute() {
    btnMute.textContent = muted ? '🔇' : '🔊';
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.5;
    try { localStorage.setItem('dax_muted', muted ? '1' : '0'); } catch (e) {}
  }
  btnMute.addEventListener('click', function () {
    initAudio();
    muted = !muted;
    applyMute();
    if (!muted) sfxClick();
  });
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('dax-show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove('dax-show'); }, 1500);
  }
  btnShare.addEventListener('click', function () {
    var txt = '🍉 我在《合成大西瓜·超果冻版》拿了 ' + score + ' 分，合成了「' + FRUITS[maxLevel].name + '」！敢来挑战我吗？';
    var done = function () { showToast('已复制，快去粘贴炫耀吧！'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
    } else fallbackCopy(txt, done);
  });
  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { showToast('复制失败，请手动复制'); }
    ta.remove();
  }
  function updateBestUI() {
    elBest.textContent = '最高 ' + best;
    elStartBest.textContent = '历史最高：' + best;
  }

  /* ---------- 待机演出：后台自动落水果 ---------- */
  function idleSpawn(t) {
    if (t < idleNextAt) return;
    idleNextAt = t + rand(850, 1500);
    if (fruits.length > 40) removeFruit(fruits[0]);
    spawnFruit((Math.random() * 5) | 0, rand(42, GAME_W - 42), DROP_Y - 10, { dropped: true });
  }

  /* ---------- 渲染 ---------- */
  function renderBG() {
    bgCv.width = canvas.width; bgCv.height = canvas.height;
    var c = bgCtx;
    c.setTransform(k, 0, 0, k, 0, 0);
    var g = c.createLinearGradient(0, 0, 0, GAME_H);
    g.addColorStop(0, '#fff7e8');
    g.addColorStop(0.55, '#ffedd6');
    g.addColorStop(1, '#ffdfc2');
    c.fillStyle = g; c.fillRect(0, 0, GAME_W, GAME_H);
    bgDirty = false;
  }
  function drawHanging(t) {
    if (state !== 'playing' || !canDrop) return;
    var r = FRUITS[currentLevel].r;
    var x = clamp(aimX, r + 2, GAME_W - r - 2);
    var bob = Math.sin(t / 380) * 2.2;
    // 落点虚线
    ctx.save();
    ctx.strokeStyle = 'rgba(180,90,40,0.3)';
    ctx.lineWidth = 2; ctx.setLineDash([5, 9]);
    ctx.beginPath(); ctx.moveTo(x, DROP_Y + r + 8); ctx.lineTo(x, GAME_H - 8); ctx.stroke();
    ctx.restore();
    // 水果本体
    var s = getSprite(currentLevel);
    ctx.save();
    ctx.translate(x, DROP_Y + bob);
    ctx.rotate(Math.sin(t / 700) * 0.05);
    ctx.drawImage(s.cv, -s.half, -s.half, s.size, s.size);
    var blink = t > hangBlinkAt && t < hangBlinkAt + 130;
    if (t > hangBlinkAt + 130) hangBlinkAt = t + rand(2000, 5600);
    drawFace(ctx, r, FRUITS[currentLevel].face, { blink: blink, sad: false, t: t });
    ctx.restore();
  }
  function drawDangerLine(t) {
    var closeWarn = false;
    if (state === 'playing') {
      for (var i = 0; i < fruits.length; i++) {
        var f = fruits[i];
        if (!f.plugin.dead && f.position.y - FRUITS[f.plugin.level].r < DANGER_Y + 52) { closeWarn = true; break; }
      }
    }
    var alpha = 0.32, color = '#e08a5a', lw = 2;
    if (dangerTime > 0.15) {
      var p = 0.5 + 0.5 * Math.sin(t / 110);
      alpha = 0.45 + 0.5 * p; color = '#ff3b30'; lw = 2.5 + p * 1.5;
    } else if (closeWarn) {
      var p2 = 0.5 + 0.5 * Math.sin(t / 300);
      alpha = 0.35 + 0.28 * p2; color = '#ff8a1e';
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash([9, 7]);
    ctx.beginPath(); ctx.moveTo(8, DANGER_Y); ctx.lineTo(GAME_W - 8, DANGER_Y); ctx.stroke();
    ctx.restore();
  }
  function drawStar(c, x, y, ro, ri) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
  }
  function render(t) {
    if (bgDirty) renderBG();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (shakeMag > 0.2) ctx.translate(rand(-1, 1) * shakeMag * 0.55, rand(-1, 1) * shakeMag * 0.55);
    ctx.drawImage(bgCv, 0, 0, GAME_W, GAME_H);

    // 漂浮装饰泡泡
    ctx.fillStyle = 'rgba(255,180,110,0.1)';
    for (var i = 0; i < 6; i++) {
      var bx = (i * 97 + 40) % GAME_W;
      var by = ((i * 173 + 80) % GAME_H) + Math.sin(t / 3000 + i * 1.7) * 14;
      ctx.beginPath(); ctx.arc(bx, by, 26 + (i * 23) % 46, 0, TAU); ctx.fill();
    }

    drawDangerLine(t);
    drawHanging(t);

    // 物理水果
    for (var j = 0; j < fruits.length; j++) {
      var f = fruits[j], p = f.plugin;
      if (p.dead) continue;
      var fr = FRUITS[p.level], s = getSprite(p.level);
      var a = clamp((t - p.born) / 190, 0, 1);
      var sc = 0.55 + 0.45 * easeOutBack(a);
      ctx.save();
      ctx.translate(f.position.x, f.position.y);
      ctx.rotate(f.angle);
      ctx.scale(sc, sc);
      ctx.drawImage(s.cv, -s.half, -s.half, s.size, s.size);
      var blink = t > p.blinkAt && t < p.blinkAt + 130;
      if (t > p.blinkAt + 130) p.blinkAt = t + rand(2000, 5600);
      drawFace(ctx, fr.r, fr.face, { blink: blink, sad: p.sad, t: t });
      ctx.restore();
    }

    // 冲击波圆环
    for (var q = rings.length - 1; q >= 0; q--) {
      var rg = rings[q];
      var ra = 1 - rg.age / rg.life;
      if (ra <= 0) { rings.splice(q, 1); continue; }
      ctx.save();
      ctx.globalAlpha = ra * 0.8;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 + 9 * ra;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // 粒子
    for (var m = 0; m < particles.length; m++) {
      var pt = particles[m];
      var pa = 1 - pt.age / pt.life;
      if (pa <= 0) continue;
      ctx.save();
      ctx.globalAlpha = pa;
      ctx.fillStyle = pt.color;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rot);
      if (pt.conf) ctx.fillRect(-pt.size / 2, -pt.size, pt.size, pt.size * 2);
      else if (pt.star) { drawStar(ctx, 0, 0, pt.size * 1.6, pt.size * 0.7); }
      else { ctx.beginPath(); ctx.arc(0, 0, pt.size, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    // 飘字
    for (var n = 0; n < floats.length; n++) {
      var fl = floats[n];
      var fa = 1 - fl.age / fl.life;
      if (fa <= 0) continue;
      var fs = fl.size;
      if (fl.punch) {
        var pp = clamp(fl.age / 0.22, 0, 1);
        fs = fl.size * (0.6 + 0.4 * easeOutBack(pp));
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, fa * 1.6);
      ctx.font = '900 ' + fs + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2.5, fs * 0.16);
      ctx.strokeStyle = fl.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.restore();
    }

    // 白闪
    if (flashA > 0.01) {
      ctx.globalAlpha = flashA;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-30, -30, GAME_W + 60, GAME_H + 60);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 特效推进 ---------- */
  function updateFx(dt, t) {
    var dts = dt / 1000;
    shakeMag = Math.max(0, shakeMag - dt * 0.028);
    flashA = Math.max(0, flashA - dts * 1.9);
    var i;
    for (i = particles.length - 1; i >= 0; i--) {
      var pt = particles[i];
      pt.age += dts;
      if (pt.age >= pt.life) { particles.splice(i, 1); continue; }
      pt.vy += pt.g * dts;
      pt.x += pt.vx * dts; pt.y += pt.vy * dts;
      pt.rot += pt.vr * dts;
    }
    for (i = floats.length - 1; i >= 0; i--) {
      var fl = floats[i];
      fl.age += dts;
      if (fl.age >= fl.life) { floats.splice(i, 1); continue; }
      fl.y += fl.vy * dts;
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var rg = rings[i];
      rg.age += dts;
      rg.r += 470 * dts;
      if (rg.age >= rg.life) rings.splice(i, 1);
    }
    if (comboCount > 0 && t - lastMergeAt > COMBO_WINDOW) comboCount = 0;
  }
  function runTimers(t) {
    for (var i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) {
        var fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
    }
  }

  /* ---------- 主循环：rAF 驱动 + 定时器兜底（部分 WebView / 后台场景 rAF 会被暂停） ---------- */
  var lastT = 0, acc = 0;
  function step() {
    var t = nowMs();
    var dt = t - lastT;
    if (dt < 4) return;
    lastT = t;
    if (dt > 100) dt = 100;
    acc += dt;
    var steps = 0;
    while (acc >= 16.666 && steps < 5) {
      Engine.update(engine, 16.666);
      acc -= 16.666;
      steps++;
    }
    if (steps === 5) acc = 0;
    processMerges();
    runTimers(t);
    if (state === 'playing') {
      updateDanger(t, dt);
      if (!canDrop && t >= nextFruitAt) canDrop = true;
    } else if (state === 'idle') {
      idleSpawn(t);
    }
    updateFx(dt, t);
    render(t);
  }
  (function frame() { step(); requestAnimationFrame(frame); })();
  setInterval(step, 80);

  /* ---------- 启动 ---------- */
  function drawLogo() {
    var w = logoCv.width;
    var c = logoCv.getContext('2d');
    c.clearRect(0, 0, w, w);
    var s = getSprite(10);
    var sc = w / s.size * 1.04;
    var ds = s.size * sc;
    c.drawImage(s.cv, (w - ds) / 2, (w - ds) / 2, ds, ds);
    c.save();
    c.translate(w / 2, w / 2);
    drawFace(c, FRUITS[10].r * sc, 'happy', { blink: false, sad: false, t: 0 });
    c.restore();
  }
  function drawNextPreview() {
    if (!nextCv.width) return;
    nctx.setTransform(1, 0, 0, 1, 0, 0);
    nctx.clearRect(0, 0, nextCv.width, nextCv.height);
    var s = getSprite(nextLevel);
    var sc = nextCv.width / s.size * 0.94;
    var ds = s.size * sc;
    nctx.drawImage(s.cv, (nextCv.width - ds) / 2, (nextCv.height - ds) / 2, ds, ds);
  }

  resize();
  drawLogo();
  updateBestUI();
  applyMute();

  // 调试钩子：仅当 URL 带 #debug 时暴露
  if (location.hash === '#debug') {
    window.__daxigua = {
      get state() { return state; },
      get score() { return score; },
      get fruitCount() { return fruits.length; },
      get maxLevel() { return maxLevel; },
      get canDrop() { return canDrop; },
      get currentLevel() { return currentLevel; },
      get aimX() { return aimX; },
      get dangerTime() { return dangerTime; },
      get positions() { return fruits.map(function (f) { return { x: Math.round(f.position.x), y: Math.round(f.position.y), lvl: f.plugin.level, speed: +f.speed.toFixed(2) }; }); },
      spawn: function (level, x) { return spawnFruit(level, x, DROP_Y, { dropped: true }); },
      spawnAt: function (level, x, y) { return spawnFruit(level, x, y, { dropped: false }); },
      drop: function () { dropFruit(); },
      forceOver: function () { gameOver(); }
    };
  }
})();
