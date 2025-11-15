const overlayKeys = {
  ShiftLeft: document.getElementById('shift'),
  KeyW: document.getElementById('up'),
  Space: document.getElementById('space'),
  KeyA: document.getElementById('left'),
  KeyS: document.getElementById('down'),
  KeyD: document.getElementById('right'),
};
window.addEventListener('keydown', (e) => {
  if (overlayKeys[e.code]) overlayKeys[e.code].classList.add('pressed');
});
window.addEventListener('keyup', (e) => {
  if (overlayKeys[e.code]) overlayKeys[e.code].classList.remove('pressed');
});

/* ===== Config ===== */
    const CONFIG = {
      gravity: 950,                         // baseline downward acceleration strength
      jetpackThrust: -1600,                 // upward thrust applied while the jetpack is firing
      maxUpSpeed: -480,                     // clamp for upward velocity (negative = going up)
      maxDownSpeed: 240,                    // normal downward velocity cap
      maxDownSpeedFast: 1100,               // downward velocity cap while fast-falling
      gravityFast: 2000,                    // gravity multiplier used while diving
      maxSpeedX: 350,                       // base horizontal velocity limit
      accelX: 2400,                         // horizontal acceleration while moving
      friction: 900,                        // ground friction slowing the player when idle
      frictionAir: 220,                     // air friction applied when airborne
      playerSize: 40,                       // default diameter of the player orb
      startX: 200,                          // initial player X spawn position
      startY: 200,                          // initial player Y spawn position
      staminaMax: 3.0,                      // maximum stamina (fuel) capacity
      staminaConsumeRate: 1.111111111111111,// jetpack stamina drain per second
      staminaRegenRate: 3.0,                // stamina regen per second while grounded
      gridSize: 100,                        // base grid size for placement snapping
      zoomStep: 0.2,                        // increment applied when using discrete zoom keys
      minZoom: 0.5,                         // minimum camera zoom multiplier
      maxZoom: 3,                           // maximum camera zoom multiplier
      zoomLerp: 0.12,                       // smoothing factor for zoom interpolation
      camLerp: 0.14,                        // smoothing factor for camera follow
      platformThickness: 12,                // rendered thickness of line platforms
    };

    /* ===== Globals ===== */
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d', { alpha: false });
    let w = canvas.width = innerWidth;
    let h = canvas.height = innerHeight;

    let keys = {};
    let mouse = { x:0, y:0, down:false, wheelDelta:0 };
    const fuelBarInner = document.getElementById('fuelBarInner');
    const coordsEl = document.getElementById('coords');
    const statHUD = document.getElementById('statHUD');
    const zoomIndicatorEl = document.getElementById('zoomIndicator');

    const BOOST = {
      accelMul: 1.5,
      jetMul: 1.5,
      gravityMul: 1.0,
      diagSpeedMul: 1.08,
      upDiagVerticalBias: 1.20,
      upDiagHorizBias: 0.92,
      overshoot: 1.03,
      windowMs: 120
    };
    const SPRINT = {
      xImpulse: 820,
      xAirMul: 1.15,
      xFallMul: 1.35,
      xOvershoot: 1.15,
      xOvershootMs: 220,

      downRampMs: 180,
      downRampAdd: 360,

      upGlideMs: 520,
      upGlideMinMul: 0.38,
      upCost: 0.12,

      upImpulse: 900,
      downAdd: 420,

      overshoot: 1.06,
      overshootMs: 160,

      fallEaseMs: 360,
      fallEaseMinMul: 0.45
    };

    let spaceBoostUntil = 0;
    let xBoostUntil = 0;
    let lastSprintAt = -1;
    let downRampUntil = 0, downRampAccel = 0;
    let upGlideStart = -1;
    const SHIFT = { costFrac: 1/17, haltMs: 50 };
    let jetGlideStart = -1;
    const JETGLIDE = { ms: 750, minMul: 0.22 }; // more glide, softer gravity
    const placementMenu = document.getElementById('placementMenu');
    const placeButtons = document.querySelectorAll('.placeBtn');
    const killbrickGridSnapEl = document.getElementById('killbrickGridSnap');

    let placementOpen = false;
    let placementType = 'line';
    let currentLineLength = CONFIG.gridSize;
    let placedObjects = [];

    let sprintBoostPending = null;
    let sprintBoostLock = false;
    let sprintActiveTimer = 0;
    let lastMoveDir = {dx: 1, dy: 0};

    let player = { x: CONFIG.startX, y: CONFIG.startY, vx: 0, vy: 0, size: CONFIG.playerSize, onGround: false, stamina: CONFIG.staminaMax };

    // Jetpack-style particles for the ball (Skap-like trail)
    const jetpackParticles = [];
    let jetpackSpawnAccumulator = 0;
    const MAX_JETPACK_PARTICLES = 400;

    let haltUntil = 0;

    let cam = { x: player.x, y: player.y };
    let zoom = 1;
    let targetZoom = 1;
    let zoomIndicatorTimer = null;

    window.canvas = canvas;
    window.ctx = ctx;
    window.player = player;
    window.cam = cam;
    window.zoom = zoom;

    let lastTime = performance.now();

    let __prevUsingJet = false;

    // NEW: W hold time → variable jump height
    let jetHoldTime = 0;
    const MAX_JET_HOLD = 0.25; // seconds of full upward thrust for a max jump

    function resize() { w = canvas.width = innerWidth; h = canvas.height = innerHeight; }
    addEventListener('resize', resize);

    /* ===== Input ===== */
    addEventListener('keydown', e => {
      const key = e.key.toLowerCase();
      keys[key] = true;

      if ((e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') && !e.repeat) {
        const now = performance.now();
        player.vx = 0; player.vy = 0;
        haltUntil = now + SHIFT.haltMs;
        player.stamina = Math.max(0, player.stamina - CONFIG.staminaMax * SHIFT.costFrac);
        if (fuelBarInner) {
          fuelBarInner.style.width = (player.stamina / CONFIG.staminaMax * 100) + '%';
        }
      }

      if (["w","a","s","d"].includes(key)) {
        let dx = 0, dy = 0;
        if (keys['w']) dy -= 1;
        if (keys['s']) dy += 1;
        if (keys['a']) dx -= 1;
        if (keys['d']) dx += 1;
        if (dx !== 0 || dy !== 0) {
          let mag = Math.sqrt(dx*dx + dy*dy);
          lastMoveDir = {dx: dx/mag, dy: dy/mag};
        }
      }

      if (!sprintBoostLock && keys[' '] && (["w","a","s","d"].includes(key))) {
        sprintBoostPending = true;
        sprintBoostLock = true;
      }

      if (key === 't') { placementOpen = !placementOpen; placementMenu.style.display = placementOpen ? 'block' : 'none'; }
      if (key === 'r') { resetPlayer(); }
      if (key === 'u') { setTargetZoom(targetZoom - CONFIG.zoomStep); }
      if (key === 'i') { setTargetZoom(targetZoom + CONFIG.zoomStep); }
    });

    addEventListener('keyup', e => {
      delete keys[e.key.toLowerCase()];
      const k = e.key.toLowerCase();
      if (["w","a","s","d"," "].includes(k)) { sprintBoostLock = false; }
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', e => { mouse.down = true; if (placementOpen) placeObjectAtMouse(); });
    canvas.addEventListener('mouseup', e => mouse.down = false);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      if (placementOpen && (placementType === 'line' || placementType === 'blueplatform')) {
        currentLineLength = Math.max(CONFIG.gridSize, currentLineLength + (-delta * CONFIG.gridSize));
      } else if (e.ctrlKey) {
        setTargetZoom(targetZoom + (-delta * 0.12));
      }
    }, { passive:false });

    placeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        placeButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        placementType = btn.dataset.type;
      });
    });

    /* ===== Utils ===== */
    function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
    function lerp(a,b,t){ return a + (b-a)*t; }

    function formatZoomLabel(value) {
      const rounded = Math.round(value * 100) / 100;
      let text = rounded.toFixed(2).replace(/\.0+$/, '').replace(/\.(\d*?)0+$/, '.$1');
      if (text.endsWith('.')) text = text.slice(0, -1);
      return `${text}x`;
    }

    function showZoomIndicator(value) {
      if (!zoomIndicatorEl) return;
      zoomIndicatorEl.textContent = formatZoomLabel(value);
      zoomIndicatorEl.classList.add('show');
      if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);
      zoomIndicatorTimer = setTimeout(() => {
        zoomIndicatorEl.classList.remove('show');
      }, 700);
    }

    function setTargetZoom(value) {
      targetZoom = clamp(value, CONFIG.minZoom, CONFIG.maxZoom);
      showZoomIndicator(targetZoom);
    }

    function screenToWorld(sx, sy) {
      const worldX = cam.x + ((sx - w/2) / zoom);
      const worldY = cam.y + ((sy - h/2) / zoom);
      return { x: worldX, y: worldY };
    }
    function worldToScreen(wx, wy) {
      return { x: ((wx - cam.x) * zoom) + w/2, y: ((wy - cam.y) * zoom) + h/2 };
    }

    function updateJetpackParticles(dt) {
      const dtScale = dt * 60;
      for (let i = jetpackParticles.length - 1; i >= 0; i--) {
        const p = jetpackParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.hue += 10 * dtScale;
        p.s *= Math.pow(0.975, dtScale);
        p.o -= 0.01 * dtScale;
        if (p.o <= 0.05 || p.s <= 0.6) {
          jetpackParticles.splice(i, 1);
        }
      }
    }

    function placeObjectAtMouse() {
      const world = screenToWorld(mouse.x, mouse.y);
      const gs = CONFIG.gridSize;

      if (placementType === 'line' || placementType === 'blueplatform') {
        placedObjects.push({
          type: placementType,
          x: Math.round(world.x / gs) * gs,
          y: Math.round(world.y / gs) * gs,
          length: currentLineLength
        });
      } else if (placementType === 'killbrick') {
        if (killbrickGridSnapEl && killbrickGridSnapEl.checked) {
          const snapX = Math.floor(world.x / gs) * gs + gs/2;
          const snapY = Math.floor(world.y / gs) * gs + gs/2;
          placedObjects.push({ type: 'killbrick', x: snapX, y: snapY, size: gs });
        } else {
          placedObjects.push({ type: 'killbrick', x: world.x, y: world.y, size: gs });
        }
      }
    }

    function resetPlayer() {
      player.x = CONFIG.startX; player.y = CONFIG.startY;
      player.vx = 0; player.vy = 0;
      player.stamina = CONFIG.staminaMax;
    }

    function currentIntent() {
      const left = !!keys['a'], right = !!keys['d'];
      const up   = !!keys['w'], down  = !!keys['s'];
      let vx = 0, vy = 0;
      if (left) vx -= 1;
      if (right) vx += 1;
      if (up) vy -= 1;
      if (down) vy += 1;
      const m = Math.hypot(vx, vy) || 1;
      return {vx: vx/m, vy: vy/m, raw:{left,right,up,down}};
    }

    function doSprintImpulse() {
      const intent = currentIntent();
      if (intent.vx === 0 && intent.vy === 0) return false;

      const noFuelInAir = (player.stamina <= 0 && !player.onGround);
      if (noFuelInAir && !intent.raw.down) {
        return false;
      }

      const now = performance.now();

      if (SPRINT.upCost > 0) {
        player.stamina = Math.max(0, player.stamina - SPRINT.upCost);
        if (fuelBarInner) {
          fuelBarInner.style.width = (player.stamina / CONFIG.staminaMax * 100) + '%';
        }
      }

      if (intent.vx !== 0) {
        let imp = SPRINT.xImpulse;
        if (!player.onGround) {
          imp *= (player.vy > 0) ? SPRINT.xFallMul : SPRINT.xAirMul;
        }
        player.vx = intent.vx * imp;
        xBoostUntil = now + SPRINT.xOvershootMs;
      }

      if (intent.raw.up) {
        if (player.stamina > 0) {
          player.vy = -SPRINT.upImpulse;
          upGlideStart = now;
        }
      } else if (intent.raw.down) {
        if (!player.onGround) {
          const rampSec = Math.max(0.001, SPRINT.downRampMs / 1000);
          downRampAccel = SPRINT.downRampAdd / rampSec;
          downRampUntil = now + SPRINT.downRampMs;
        }
      }

      spaceBoostUntil = now + Math.max(BOOST.windowMs, SPRINT.overshootMs);
      lastSprintAt = now;
      return true;
    }

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.key === ' ') {
        spaceBoostUntil = performance.now() + Math.max(BOOST.windowMs, SPRINT.overshootMs);
        doSprintImpulse();
      }
    });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key?.toLowerCase();
      if (k && ['w','a','s','d'].includes(k) && (keys[' '] || e.code === 'Space')) {
        doSprintImpulse();
      }
    });

    function update(dt) {
      const now = performance.now();
      const spaceDown = !!keys[' '];
      if (player.stamina <= 0) upGlideStart = -1;
      const boostActive = spaceDown;
      const overshootActive = now < spaceBoostUntil;

      if (haltUntil > now) {
        player.vx = 0; player.vy = 0;
        cam.x = player.x; cam.y = player.y - player.size / 2;
        zoom = lerp(zoom, targetZoom, CONFIG.zoomLerp);
        fuelBarInner.style.width = (player.stamina / CONFIG.staminaMax * 100) + '%';
        coordsEl.textContent = `Coords: ${Math.round(player.x)}, ${Math.round(player.y)}`;
        if (statHUD) {
          const sp0 = Math.hypot(player.vx, player.vy).toFixed(3);
          statHUD.innerHTML = `pos: ${Math.round(player.x)}, ${Math.round(player.y)}<br>vel: ${Math.round(player.vx)}, ${Math.round(player.vy)} (${sp0})`;
        }
        return;
      }

      const left = !!keys['a'];
      const right = !!keys['d'];
      const upIntent = !!keys['w'];
      const downIntent = !!keys['s'];
      const horizIntent = left || right;
      const diagIntent = horizIntent && (upIntent || downIntent);

      // track how long W is held for variable jump height
      if (upIntent) {
        jetHoldTime += dt;
      } else {
        jetHoldTime = 0;
      }

      const usingJet = upIntent && player.stamina > 0 && jetHoldTime < MAX_JET_HOLD;

      if (!usingJet && __prevUsingJet) { jetGlideStart = performance.now(); }

      // horizontal
      let ax = 0;
      if (left && !right) ax = -CONFIG.accelX;
      else if (right && !left) ax = CONFIG.accelX;
      else {
        const fr = player.onGround ? CONFIG.friction : (CONFIG.frictionAir ?? CONFIG.friction*0.25);
        if (player.vx > 0) ax = -fr;
        else if (player.vx < 0) ax = fr;
        else ax = 0;
      }
      if (boostActive) ax *= BOOST.accelMul;
      if (diagIntent) ax *= BOOST.diagSpeedMul;
      if (boostActive && diagIntent && upIntent) ax *= BOOST.upDiagHorizBias;

      player.vx += ax * dt;
      if (!left && !right) {
        if (Math.sign(player.vx) !== Math.sign(player.vx - ax * dt) && Math.abs(player.vx) < 20) player.vx = 0;
      }
      const xOvershootActive = now < xBoostUntil;
      const maxX = CONFIG.maxSpeedX * ((overshootActive || xOvershootActive) ? Math.max(BOOST.overshoot, SPRINT.overshoot, SPRINT.xOvershoot) : 1);
      player.vx = clamp(player.vx, -maxX, maxX);

      if (downRampUntil > now && !player.onGround) {
        player.vy += downRampAccel * dt;
      }

      const fastFall = downIntent;

      // glides
      let upGlideMul = 1.0;
      if (upGlideStart >= 0 && now - upGlideStart < SPRINT.upGlideMs && player.vy < 0) {
        const a = Math.min(1, (now - upGlideStart) / SPRINT.upGlideMs);
        upGlideMul = Math.min(upGlideMul, SPRINT.upGlideMinMul + (1 - SPRINT.upGlideMinMul) * a);
      }
      if (jetGlideStart >= 0 && now - jetGlideStart < JETGLIDE.ms && !fastFall) {
        const b = Math.min(1, (now - jetGlideStart) / JETGLIDE.ms);
        const mul = JETGLIDE.minMul + (1 - JETGLIDE.minMul) * b;
        upGlideMul = Math.min(upGlideMul, mul);
      }

      let fallEaseMul = 1.0;
      if (player.vy > 0 && lastSprintAt >= 0) {
        const t = now - lastSprintAt;
        if (t < SPRINT.fallEaseMs) {
          const a = Math.min(1, t / SPRINT.fallEaseMs);
          fallEaseMul = SPRINT.fallEaseMinMul + (1 - SPRINT.fallEaseMinMul) * a;
        }
      }

      if (usingJet) {
        player.stamina = Math.max(0, player.stamina - CONFIG.staminaConsumeRate * dt);
        let jetMul = boostActive ? BOOST.jetMul : 1;
        if (boostActive && diagIntent && upIntent) jetMul *= BOOST.upDiagVerticalBias;
        player.vy += CONFIG.jetpackThrust * dt * jetMul;
      } else if (fastFall) {
        let gMul = (boostActive ? BOOST.gravityMul : 1) * fallEaseMul;
        if (diagIntent && downIntent) gMul *= BOOST.diagSpeedMul;
        player.vy += CONFIG.gravityFast * dt * gMul * upGlideMul;
      } else {
        let gMul = (boostActive ? BOOST.gravityMul : 1) * fallEaseMul;
        player.vy += CONFIG.gravity * dt * gMul * upGlideMul;
      }

      const vyMin = CONFIG.maxUpSpeed * (overshootActive ? Math.max(BOOST.overshoot, SPRINT.overshoot) : 1);
      const vyMaxBase = fastFall ? CONFIG.maxDownSpeedFast : CONFIG.maxDownSpeed;
      const vyMax = vyMaxBase * (overshootActive ? Math.max(BOOST.overshoot, SPRINT.overshoot) : 1);
      player.vy = clamp(player.vy, vyMin, vyMax);

      // jetpack particles (less, side-offset, 70% opacity)
      if (usingJet) {
        const dtScale = dt * 60;
        jetpackSpawnAccumulator += 1.0 * dtScale; // fewer particles

        let spawnCount = Math.floor(jetpackSpawnAccumulator);
        if (spawnCount > 0) {
          spawnCount = Math.min(spawnCount, 2); // never more than 2 per frame
          jetpackSpawnAccumulator -= spawnCount;

          for (let i = 0; i < spawnCount; i++) {
            const spread = 0.7;
            const dir = Math.PI / 2 + (Math.random() - 0.5) * spread;
            const speed = 120 + Math.random() * 80;

            const sideOffset = (Math.random() - 0.5) * 30;      // ~±15px side
            const verticalJitter = (Math.random() - 0.5) * 10;  // slight up/down

            const baseW = player.size * 1.4;
            const baseH = player.size * 0.30;

            jetpackParticles.push({
              x: player.x + sideOffset,
              y: player.y + player.size * 0.3 + verticalJitter,
              vx: Math.cos(dir) * speed,
              vy: Math.sin(dir) * speed,
              hue: 120,
              s: 100,
              w: baseW,
              h: baseH,
              o: 0.7   // start at 70% opacity
            });
          }

          if (jetpackParticles.length > MAX_JETPACK_PARTICLES) {
            jetpackParticles.splice(0, jetpackParticles.length - MAX_JETPACK_PARTICLES);
          }
        }
      }

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      player.onGround = false;
      const half = player.size / 2;
      const px1 = player.x - half, px2 = player.x + half;
      const py1 = player.y - half, py2 = player.y + half;

      placedObjects.forEach(obj => {
        if ((obj.type === 'blueplatform' && obj.visible === false)) return;

        if (obj.type === 'line' || obj.type === 'blueplatform') {
          const len = obj.length || CONFIG.gridSize;
          const leftX = obj.x - len/2, rightX = obj.x + len/2;
          const topY = obj.y - CONFIG.platformThickness/2, bottomY = obj.y + CONFIG.platformThickness/2;

          const overlapX = px2 > leftX && px1 < rightX;
          const overlapY = py2 > topY && py1 < bottomY;

          if (overlapX && overlapY) {
            if (player.vy >= 0 && (player.y - half) < bottomY && (player.y + half) > topY) {
              player.y = topY - half; player.vy = 0; player.onGround = true;
            } else if (player.vy < 0 && (player.y + half) > topY && (player.y - half) < bottomY) {
              player.y = bottomY + half; player.vy = 0;
            } else {
              const penTop = bottomY - py1;
              const penBottom = py2 - topY;
              if (penTop < penBottom) { player.y += penTop; } else { player.y -= penBottom; }
            }
          }
        } else if (obj.type === 'killbrick') {
          const s = obj.size || CONFIG.gridSize;
          const leftX = obj.x - s/2, rightX = obj.x + s/2;
          const topY = obj.y - s/2, bottomY = obj.y + s/2;
          if (px2 > leftX && px1 < rightX && py2 > topY && py1 < bottomY) { resetPlayer(); }
        }
      });

      if (player.onGround && !upIntent) {
        player.stamina = clamp(player.stamina + CONFIG.staminaRegenRate * dt, 0, CONFIG.staminaMax);
      }

      updateJetpackParticles(dt);

      cam.x = player.x; cam.y = player.y - player.size / 2;
      zoom = lerp(zoom, targetZoom, CONFIG.zoomLerp);

      window.player = player;
      window.cam = cam;
      window.zoom = zoom;

      fuelBarInner.style.width = (player.stamina / CONFIG.staminaMax * 100) + '%';
      coordsEl.textContent = `Coords: ${Math.round(player.x)}, ${Math.round(player.y)}`;
      if (statHUD) {
        const sp = Math.hypot(player.vx, player.vy).toFixed(3);
        statHUD.innerHTML = `pos: ${Math.round(player.x)}, ${Math.round(player.y)}<br>vel: ${Math.round(player.vx)}, ${Math.round(player.vy)} (${sp})`;
      }

      __prevUsingJet = usingJet;
    }

    function draw() {
      ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0,0,w,h);

      ctx.save();
      ctx.translate(w/2, h/2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cam.x, -cam.y);

      drawGrid();

      placedObjects.forEach(obj => {
        if (obj.type === 'line' || obj.type === 'blueplatform') {
          ctx.lineWidth = CONFIG.platformThickness;
          ctx.lineCap = 'round';
          ctx.strokeStyle = obj.type === 'blueplatform' ? '#2b7bff' : '#ffffff';
          ctx.beginPath();
          ctx.moveTo(obj.x - (obj.length/2), obj.y);
          ctx.lineTo(obj.x + (obj.length/2), obj.y);
          ctx.stroke();
        } else if (obj.type === 'killbrick') {
          const s = obj.size || CONFIG.gridSize;
          ctx.fillStyle = '#ff3b3b';
          ctx.fillRect(obj.x - s/2, obj.y - s/2, s, s);
        }
      });

      // jetpack particles (behind player)
      for (const p of jetpackParticles) {
        if (p.o <= 0) continue;
        ctx.globalAlpha = Math.min(0.7, p.o); // cap at 70% opacity
        ctx.fillStyle = `hsl(${p.hue}, ${p.s}%, 60%)`;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      }
      ctx.globalAlpha = 1;

      // player (base color, will be over-drawn by settings script)
      ctx.beginPath();
      const pr = player.size / 2;
      ctx.fillStyle = '#086699';
      ctx.arc(player.x, player.y, pr, 0, Math.PI*2);
      ctx.fill();

      const henLabelPos = worldToScreen(player.x, player.y - pr - 5);

      ctx.restore();

      ctx.fillStyle = '#f6f6ff';
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('hen', henLabelPos.x, henLabelPos.y);

      ctx.save();
      ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillStyle = 'rgba(220,230,255,0.75)';
      ctx.fillText('W = jetpack | A/D = move | U/I = zoom out/in | T = placement | R = reset', 12, h - 24);
      ctx.restore();

      if (placementOpen) {
        const world = screenToWorld(mouse.x, mouse.y);
        const gs = CONFIG.gridSize;
        let snapX, snapY;

        if (placementType === 'killbrick' && !(killbrickGridSnapEl && killbrickGridSnapEl.checked)) {
          snapX = world.x; snapY = world.y;
        } else if (placementType === 'killbrick' && killbrickGridSnapEl && killbrickGridSnapEl.checked) {
          snapX = Math.floor(world.x / gs) * gs + gs/2;
          snapY = Math.floor(world.y / gs) * gs + gs/2;
        } else {
          snapX = Math.round(world.x / gs) * gs;
          snapY = Math.round(world.y / gs) * gs;
        }

        ctx.save();
        const scr = worldToScreen(snapX, snapY);
        if (placementType === 'killbrick') {
          const s = gs;
          ctx.fillStyle = 'rgba(255,59,59,0.35)';
          ctx.fillRect(scr.x - (s/2)*zoom, scr.y - (s/2)*zoom, s*zoom, s*zoom);
          ctx.strokeStyle = 'rgba(255,59,59,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(scr.x - (s/2)*zoom, scr.y - (s/2)*zoom, s*zoom, s*zoom);
        } else {
          const len = currentLineLength;
          const left = worldToScreen(snapX - len/2, snapY);
          const right = worldToScreen(snapX + len/2, snapY);
          ctx.strokeStyle = placementType === 'blueplatform' ? 'rgba(43,123,255,0.9)' : 'rgba(255,255,255,0.9)';
          ctx.lineWidth = CONFIG.platformThickness * zoom;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(left.x, left.y);
          ctx.lineTo(right.x, right.y);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawGrid() {
      const gs = CONFIG.gridSize;
      const left = cam.x - (w/2)/zoom - gs*2;
      const right = cam.x + (w/2)/zoom + gs*2;
      const top = cam.y - (h/2)/zoom - gs*2;
      const bottom = cam.y + (h/2)/zoom + gs*2;

      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      const startVX = Math.floor(left / gs) * gs;
      for (let x = startVX; x <= right; x += gs) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
      const startHY = Math.floor(top / gs) * gs;
      for (let y = startHY; y <= bottom; y += gs) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.moveTo(0, top); ctx.lineTo(0, bottom);
      ctx.moveTo(left, 0); ctx.lineTo(right, 0);
      ctx.stroke();
    }

    function loop(now) {
      const dt = Math.min(0.032, (now - lastTime) / 1000);
      lastTime = now;
      update(dt);
      draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    placedObjects.push({ type: 'line', x: 200, y: 520, length: 1000 });
    placedObjects.push({ type: 'blueplatform', x: 700, y: 420, length: 300 });
    placedObjects.push({ type: 'line', x: 1100, y: 300, length: 600 });
    placedObjects.push({ type: 'killbrick', x: 900, y: 540, size: CONFIG.gridSize });

let isShrunk = false;
    const shrinkFactor = 0.7;
    let shrinkYOffset = 0;
    const shrinkButton = document.getElementById('power0');
    if (shrinkButton) {
      shrinkButton.addEventListener('click', function() {
        if (!isShrunk) {
          const oldSize = player.size;
          player.size = CONFIG.playerSize * shrinkFactor;
          shrinkYOffset = (oldSize - player.size) / 2;
          player.y += shrinkYOffset;
          isShrunk = true;
        } else {
          player.y -= shrinkYOffset;
          player.size = CONFIG.playerSize;
          isShrunk = false;
        }
      });
    }

(function() {
      const STORAGE_KEY = 'jp_settings_v1';

      const DEFAULT = {
        graphics: {
          playerInterpolation: false,
          networkUsage: 'high',
          showFPS: false,
          keyOverlay: true,
          diagnostics: true
        },
        player: {
          color: '#086699',
          showHitbox: false,
          showState: false
        },
        keybinds: {
          up: 'w',
          down: 's',
          left: 'a',
          right: 'd',
          power1: 'e',
          power2: 'f',
          hitboxes: 'o'
        }
      };

      function mergeSettings(base, override) {
        const out = JSON.parse(JSON.stringify(base));
        if (!override || typeof override !== 'object') return out;
        for (const k in override) {
          if (!(k in out)) out[k] = override[k];
          else if (typeof out[k] === 'object' && out[k] && !Array.isArray(out[k])) {
            out[k] = mergeSettings(out[k], override[k]);
          } else {
            out[k] = override[k];
          }
        }
        return out;
      }

      function loadSettings() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
          return mergeSettings(DEFAULT, JSON.parse(raw));
        } catch (e) {
          return JSON.parse(JSON.stringify(DEFAULT));
        }
      }

      function saveSettings() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
      }

      let settings = loadSettings();

      const overlay = document.getElementById('settingsOverlay');
      if (!overlay) return;

      const closeBtn = document.getElementById('settingsCloseBtn');
      const keyOverlayEl = document.getElementById('key-overlay');
      const statHUDEl = document.getElementById('statHUD');
      const fpsEl = document.getElementById('fpsCounter');
      const playerStateEl = document.getElementById('playerState');

      const chkPlayerInterp = document.getElementById('opt-playerInterpolation');
      const chkShowFPS = document.getElementById('opt-showFPS');
      const chkKeyOverlay = document.getElementById('opt-keyOverlay');
      const chkDiagnostics = document.getElementById('opt-diagnostics');
      const netHigh = document.getElementById('net-high');
      const netMedium = document.getElementById('net-medium');
      const netLow = document.getElementById('net-low');

      const colorPicker = document.getElementById('playerColorPicker');
      const colorHexInput = document.getElementById('playerColorHex');
      const chkHitbox = document.getElementById('opt-hitbox');
      const chkPlayerState = document.getElementById('opt-playerState');

      const keyButtons = Array.from(document.querySelectorAll('.keybind-btn'));

      let settingsOpen = false;
      let listeningFor = null;

      function formatKeyLabel(key) {
        if (!key) return 'Unbound';
        if (key === ' ' || key === 'Space') return 'Space';
        if (key.toLowerCase && key.toLowerCase() === 'shift') return 'Shift';
        if (key.length === 1) return key.toUpperCase();
        return key;
      }

      function syncUI() {
        if (chkPlayerInterp) chkPlayerInterp.checked = !!settings.graphics.playerInterpolation;
        if (chkShowFPS) chkShowFPS.checked = !!settings.graphics.showFPS;
        if (chkKeyOverlay) chkKeyOverlay.checked = !!settings.graphics.keyOverlay;
        if (chkDiagnostics) chkDiagnostics.checked = !!settings.graphics.diagnostics;

        if (netHigh || netMedium || netLow) {
          const cur = settings.graphics.networkUsage || 'high';
          if (netHigh) netHigh.checked = cur === 'high';
          if (netMedium) netMedium.checked = cur === 'medium';
          if (netLow) netLow.checked = cur === 'low';
        }

        if (colorPicker) colorPicker.value = settings.player.color || DEFAULT.player.color;
        if (colorHexInput) colorHexInput.value = (settings.player.color || DEFAULT.player.color).toUpperCase();
        if (chkHitbox) chkHitbox.checked = !!settings.player.showHitbox;
        if (chkPlayerState) chkPlayerState.checked = !!settings.player.showState;

        keyButtons.forEach(btn => {
          const action = btn.dataset.action;
          const key = settings.keybinds[action];
          btn.textContent = formatKeyLabel(key);
        });
      }

      function applyToGame() {
        if (keyOverlayEl) keyOverlayEl.style.display = settings.graphics.keyOverlay ? 'grid' : 'none';
        if (statHUDEl) statHUDEl.style.display = settings.graphics.diagnostics ? 'block' : 'none';
        if (fpsEl) fpsEl.style.display = settings.graphics.showFPS ? 'block' : 'none';
        if (playerStateEl) playerStateEl.style.display = settings.player.showState ? 'block' : 'none';
      }

      function setSettingsOpen(open) {
        settingsOpen = open;
        if (open) {
          overlay.classList.add('open');
          syncUI();
        } else {
          overlay.classList.remove('open');
          saveSettings();
        }
      }

      function toggleSettingsOverlay() {
        setSettingsOpen(!settingsOpen);
      }

      syncUI();
      applyToGame();

      if (closeBtn) {
        closeBtn.addEventListener('click', () => setSettingsOpen(false));
      }

      if (chkPlayerInterp) {
        chkPlayerInterp.addEventListener('change', () => {
          settings.graphics.playerInterpolation = chkPlayerInterp.checked;
          saveSettings();
        });
      }
      if (chkShowFPS) {
        chkShowFPS.addEventListener('change', () => {
          settings.graphics.showFPS = chkShowFPS.checked;
          saveSettings();
          applyToGame();
        });
      }
      if (chkKeyOverlay) {
        chkKeyOverlay.addEventListener('change', () => {
          settings.graphics.keyOverlay = chkKeyOverlay.checked;
          saveSettings();
          applyToGame();
        });
      }
      if (chkDiagnostics) {
        chkDiagnostics.addEventListener('change', () => {
          settings.graphics.diagnostics = chkDiagnostics.checked;
          saveSettings();
          applyToGame();
        });
      }

      function setNetwork(v) {
        settings.graphics.networkUsage = v;
        saveSettings();
      }
      if (netHigh) netHigh.addEventListener('change', () => { if (netHigh.checked) setNetwork('high'); });
      if (netMedium) netMedium.addEventListener('change', () => { if (netMedium.checked) setNetwork('medium'); });
      if (netLow) netLow.addEventListener('change', () => { if (netLow.checked) setNetwork('low'); });

      if (colorPicker) {
        colorPicker.addEventListener('input', () => {
          const val = colorPicker.value || DEFAULT.player.color;
          settings.player.color = val;
          if (colorHexInput) colorHexInput.value = val.toUpperCase();
          saveSettings();
        });
      }
      if (colorHexInput) {
        colorHexInput.addEventListener('change', () => {
          let val = colorHexInput.value.trim();
          if (!val.startsWith('#')) val = '#' + val;
          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            settings.player.color = val;
            colorHexInput.value = val.toUpperCase();
            if (colorPicker) colorPicker.value = val;
            saveSettings();
          } else {
            colorHexInput.value = (settings.player.color || DEFAULT.player.color).toUpperCase();
          }
        });
      }

      if (chkHitbox) {
        chkHitbox.addEventListener('change', () => {
          settings.player.showHitbox = chkHitbox.checked;
          saveSettings();
        });
      }
      if (chkPlayerState) {
        chkPlayerState.addEventListener('change', () => {
          settings.player.showState = chkPlayerState.checked;
          saveSettings();
          applyToGame();
        });
      }

      keyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          listeningFor = btn.dataset.action;
          keyButtons.forEach(b => b.classList.toggle('listening', b === btn));
        });
      });

      window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          toggleSettingsOverlay();
        }
      });

      window.addEventListener('keydown', function(e) {
        if (!settingsOpen || !listeningFor) return;
        if (e.key === 'Escape') {
          listeningFor = null;
          keyButtons.forEach(b => b.classList.remove('listening'));
          return;
        }
        e.preventDefault();
        e.stopPropagation();

        const action = listeningFor;
        listeningFor = null;
        keyButtons.forEach(b => b.classList.remove('listening'));

        let val;
        if (e.key === ' ') val = 'Space';
        else if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') val = 'Shift';
        else if (e.key.length === 1) val = e.key.toLowerCase();
        else val = e.key;

        settings.keybinds[action] = val;
        saveSettings();
        syncUI();
      }, true);

      const originalRAF = window.requestAnimationFrame;
      let lastFrameTime = performance.now();
      let fps = 0;

      window.requestAnimationFrame = function(callback) {
        return originalRAF(function(timestamp) {
          const dt = (timestamp - lastFrameTime) / 1000;
          lastFrameTime = timestamp;
          if (dt > 0 && dt < 1) {
            fps = fps * 0.9 + (1 / dt) * 0.1;
            if (fpsEl && settings.graphics.showFPS) {
              fpsEl.textContent = 'FPS: ' + Math.round(fps);
            }
          }

          callback(timestamp);

          const c = window.canvas || document.getElementById('game');
          if (window.ctx && window.player && window.cam && typeof window.zoom === 'number' && c) {
            const p = window.player;
            const pr = p.size / 2;
            const color = settings.player.color || DEFAULT.player.color;

            window.ctx.save();
            window.ctx.translate(c.width / 2, c.height / 2);
            window.ctx.scale(window.zoom, window.zoom);
            window.ctx.translate(-window.cam.x, -window.cam.y);

            window.ctx.beginPath();
            window.ctx.fillStyle = color;
            window.ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
            window.ctx.fill();

            if (settings.player.showHitbox) {
              window.ctx.strokeStyle = '#ffdd33';
              window.ctx.lineWidth = 2 / window.zoom;
              window.ctx.strokeRect(p.x - pr, p.y - pr, p.size, p.size);
            }

            window.ctx.restore();
          }

          if (playerStateEl && settings.player.showState) {
            playerStateEl.textContent = 'State: Alive';
          }
        });
      };

      window.__jpSettings = settings;
    })();
