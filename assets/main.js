(function() {
  document.addEventListener('DOMContentLoaded', () => {
    /* ===== Key overlay state ===== */
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

    const zoomIndicatorEl = document.getElementById('zoomIndicator');
    let zoomIndicatorTimer = null;

    function formatZoom(value) {
      const str = value.toFixed(value >= 1 ? 1 : 2);
      return str.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
    }

    function showZoomIndicator(value) {
      if (!zoomIndicatorEl) return;
      zoomIndicatorEl.textContent = `${formatZoom(value)}x`;
      zoomIndicatorEl.classList.add('visible');
      if (zoomIndicatorTimer) clearTimeout(zoomIndicatorTimer);
      zoomIndicatorTimer = setTimeout(() => {
        zoomIndicatorEl.classList.remove('visible');
      }, 900);
    }

    /* ===== Config ===== */
    const CONFIG = {
      gravity: 950,                      // Base downward acceleration during normal fall (units/s^2)
      jetpackThrust: -1600,              // Upward force applied each second while the jetpack fires
      maxUpSpeed: -480,                  // Maximum upward velocity cap (negative = upward)
      maxDownSpeed: 240,                 // Max fall speed during standard descent
      maxDownSpeedFast: 1100,            // Max fall speed while holding down for fast fall
      gravityFast: 2000,                 // Downward acceleration applied during fast fall
      maxSpeedX: 350,                    // Horizontal speed limit before overshoot multipliers
      accelX: 2400,                      // Horizontal acceleration when pressing movement keys
      friction: 900,                     // Ground friction that slows the player when idle
      frictionAir: 220,                  // Air resistance while drifting without input
      playerSize: 40,                    // Default diameter of the player in world units
      startX: 200,                       // Initial spawn X position on reset
      startY: 200,                       // Initial spawn Y position on reset
      staminaMax: 3.0,                   // Maximum stamina (fuel) capacity in seconds
      staminaConsumeRate: 1.111111111111111, // Fuel drain per second while using the jetpack
      staminaRegenRate: 3.0,             // Fuel regenerated each second while grounded
      gridSize: 1,                       // Size of the placement grid in world units (1 = 1:1)
      zoomStep: 0.2,                     // Amount of zoom change per keyboard tap
      minZoom: 0.5,                      // Minimum allowed zoom level
      maxZoom: 3,                        // Maximum allowed zoom level
      zoomLerp: 0.12,                    // Lerp factor for smoothing zoom adjustments
      camLerp: 0.14,                     // Lerp factor for smoothing camera follow
      platformThickness: 12              // Visual thickness of drawn platforms
    };

    /* ===== Globals ===== */
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d', { alpha: false });
    let w = (canvas.width = innerWidth);
    let h = (canvas.height = innerHeight);

    let keys = {};
    let mouse = { x: 0, y: 0, down: false, wheelDelta: 0 };
    const fuelBarInner = document.getElementById('fuelBarInner');
    const coordsEl = document.getElementById('coords');
    const statHUD = document.getElementById('statHUD');

    const BOOST = {
      accelMul: 1.5,
      jetMul: 1.5,
      gravityMul: 1.0,
      diagSpeedMul: 1.08,
      upDiagVerticalBias: 1.2,
      upDiagHorizBias: 0.92,
      overshoot: 1.03,
      windowMs: 120,
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
      fallEaseMinMul: 0.45,
    };

    let spaceBoostUntil = 0;
    let xBoostUntil = 0;
    let lastSprintAt = -1;
    let downRampUntil = 0;
    let downRampAccel = 0;
    let upGlideStart = -1;
    const SHIFT = { costFrac: 1 / 17, haltMs: 50 };
    let jetGlideStart = -1;
    const JETGLIDE = { ms: 750, minMul: 0.22 };
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
    let lastMoveDir = { dx: 1, dy: 0 };

    let player = {
      x: CONFIG.startX,
      y: CONFIG.startY,
      vx: 0,
      vy: 0,
      size: CONFIG.playerSize,
      onGround: false,
      stamina: CONFIG.staminaMax,
    };

    const jetpackParticles = [];
    let jetpackSpawnAccumulator = 0;
    const MAX_JETPACK_PARTICLES = 400;

    let haltUntil = 0;

    let cam = { x: player.x, y: player.y };
    let zoom = 1;
    let targetZoom = 1;

    window.canvas = canvas;
    window.ctx = ctx;
    window.player = player;
    window.cam = cam;
    window.zoom = zoom;

    let lastTime = performance.now();

    let __prevUsingJet = false;

    let jetHoldTime = 0;
    const MAX_JET_HOLD = 0.25;

    function resize() {
      w = canvas.width = innerWidth;
      h = canvas.height = innerHeight;
    }

    addEventListener('resize', resize);

    /* ===== Input ===== */
    addEventListener('keydown', (e) => {
      const lower = e.key?.toLowerCase?.();
      if (lower) keys[lower] = true;

      if (e.key === 'Shift' || e.key === 'ShiftLeft' || e.key === 'ShiftRight') {
        if (e.repeat) return;
        const haltCost = CONFIG.staminaMax * SHIFT.costFrac;
        if (player.stamina >= haltCost) {
          player.stamina = Math.max(0, player.stamina - haltCost);
          player.vx = 0;
          player.vy = 0;
          haltUntil = performance.now() + SHIFT.haltMs;
          fuelBarInner.style.width = `${(player.stamina / CONFIG.staminaMax) * 100}%`;
        }
        return;
      }

      if ([ 'w', 'a', 's', 'd' ].includes(lower)) {
        let dx = 0;
        let dy = 0;
        if (keys['w']) dy -= 1;
        if (keys['s']) dy += 1;
        if (keys['a']) dx -= 1;
        if (keys['d']) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const mag = Math.hypot(dx, dy);
          lastMoveDir = { dx: dx / mag, dy: dy / mag };
        }
      }

      if (!sprintBoostLock && keys[' '] && [ 'w', 'a', 's', 'd' ].includes(lower)) {
        sprintBoostPending = true;
        sprintBoostLock = true;
      }

      if (lower === 't') {
        placementOpen = !placementOpen;
        placementMenu.style.display = placementOpen ? 'block' : 'none';
      }
      if (lower === 'r') {
        resetPlayer();
      }
      if (lower === 'u') {
        targetZoom = Math.max(CONFIG.minZoom, targetZoom - CONFIG.zoomStep);
        showZoomIndicator(targetZoom);
      }
      if (lower === 'i') {
        targetZoom = Math.min(CONFIG.maxZoom, targetZoom + CONFIG.zoomStep);
        showZoomIndicator(targetZoom);
      }
    });

    addEventListener('keyup', (e) => {
      const lower = e.key?.toLowerCase?.();
      if (lower) delete keys[lower];
      if ([ 'w', 'a', 's', 'd', ' ' ].includes(lower)) {
        sprintBoostLock = false;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener('mousedown', () => {
      mouse.down = true;
      if (placementOpen) placeObjectAtMouse();
    });

    canvas.addEventListener('mouseup', () => {
      mouse.down = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        if (placementOpen && (placementType === 'line' || placementType === 'blueplatform')) {
          currentLineLength = Math.max(CONFIG.gridSize, currentLineLength + -delta * CONFIG.gridSize);
        } else if (e.ctrlKey) {
          targetZoom = clamp(targetZoom + -delta * 0.12, CONFIG.minZoom, CONFIG.maxZoom);
          showZoomIndicator(targetZoom);
        }
      },
      { passive: false }
    );

    placeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        placeButtons.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        placementType = btn.dataset.type;
      });
    });

    /* ===== Utils ===== */
    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function screenToWorld(sx, sy) {
      const worldX = cam.x + (sx - w / 2) / zoom;
      const worldY = cam.y + (sy - h / 2) / zoom;
      return { x: worldX, y: worldY };
    }

    function worldToScreen(wx, wy) {
      return { x: (wx - cam.x) * zoom + w / 2, y: (wy - cam.y) * zoom + h / 2 };
    }

    function updateJetpackParticles(dt) {
      const dtScale = dt * 60;
      for (let i = jetpackParticles.length - 1; i >= 0; i -= 1) {
        const p = jetpackParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.hue += 6 * dtScale;
        p.s *= Math.pow(0.982, dtScale);
        p.o -= 0.0042 * dtScale;
        if (p.o <= 0.05 || p.s <= 5) {
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
          length: currentLineLength,
        });
      } else if (placementType === 'killbrick') {
        if (killbrickGridSnapEl && killbrickGridSnapEl.checked) {
          const snapX = Math.floor(world.x / gs) * gs + gs / 2;
          const snapY = Math.floor(world.y / gs) * gs + gs / 2;
          placedObjects.push({ type: 'killbrick', x: snapX, y: snapY, size: gs });
        } else {
          placedObjects.push({ type: 'killbrick', x: world.x, y: world.y, size: gs });
        }
      }
    }

    function resetPlayer() {
      player.x = CONFIG.startX;
      player.y = CONFIG.startY;
      player.vx = 0;
      player.vy = 0;
      player.stamina = CONFIG.staminaMax;
      fuelBarInner.style.width = '100%';
    }

    function currentIntent() {
      const left = !!keys['a'];
      const right = !!keys['d'];
      const up = !!keys['w'];
      const down = !!keys['s'];
      let vx = 0;
      let vy = 0;
      if (left) vx -= 1;
      if (right) vx += 1;
      if (up) vy -= 1;
      if (down) vy += 1;
      const m = Math.hypot(vx, vy) || 1;
      return { vx: vx / m, vy: vy / m, raw: { left, right, up, down } };
    }

    function doSprintImpulse() {
      const intent = currentIntent();
      if (intent.vx === 0 && intent.vy === 0) return false;

      const noFuelInAir = player.stamina <= 0 && !player.onGround;
      if (noFuelInAir && !intent.raw.down) {
        return false;
      }

      const now = performance.now();

      if (intent.vx !== 0) {
        let imp = SPRINT.xImpulse;
        if (!player.onGround) {
          imp *= player.vy > 0 ? SPRINT.xFallMul : SPRINT.xAirMul;
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
      if (e.code === 'Space' || e.key === ' ') {
        spaceBoostUntil = performance.now() + Math.max(BOOST.windowMs, SPRINT.overshootMs);
        doSprintImpulse();
      }
    });

    addEventListener('keydown', (e) => {
      const k = e.key?.toLowerCase?.();
      if (k && [ 'w', 'a', 's', 'd' ].includes(k) && (keys[' '] || e.code === 'Space')) {
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
        player.vx = 0;
        player.vy = 0;
        cam.x = player.x;
        cam.y = player.y - player.size / 2;
        zoom = lerp(zoom, targetZoom, CONFIG.zoomLerp);
        fuelBarInner.style.width = `${(player.stamina / CONFIG.staminaMax) * 100}%`;
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

      if (upIntent) {
        jetHoldTime += dt;
      } else {
        jetHoldTime = 0;
      }

      const usingJet = upIntent && player.stamina > 0 && jetHoldTime < MAX_JET_HOLD;

      if (!usingJet && __prevUsingJet) {
        jetGlideStart = performance.now();
      }

      let ax = 0;
      if (left && !right) ax = -CONFIG.accelX;
      else if (right && !left) ax = CONFIG.accelX;
      else {
        const fr = player.onGround ? CONFIG.friction : CONFIG.frictionAir ?? CONFIG.friction * 0.25;
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

      if (usingJet) {
        const dtScale = dt * 60;
        jetpackSpawnAccumulator += 1.0 * dtScale;

        let spawnCount = Math.floor(jetpackSpawnAccumulator);
        if (spawnCount > 0) {
          spawnCount = Math.min(spawnCount, 2);
          jetpackSpawnAccumulator -= spawnCount;

          for (let i = 0; i < spawnCount; i += 1) {
            const spread = 0.7;
            const dir = Math.PI / 2 + (Math.random() - 0.5) * spread;
            const speed = 120 + Math.random() * 80;

            const sideOffset = (Math.random() - 0.5) * 30;
            const verticalJitter = (Math.random() - 0.5) * 10;

            const baseW = player.size * 1.4;
            const baseH = player.size * 0.3;

            jetpackParticles.push({
              x: player.x + sideOffset,
              y: player.y + player.size * 0.3 + verticalJitter,
              vx: Math.cos(dir) * speed,
              vy: Math.sin(dir) * speed,
              hue: 120,
              s: 100,
              w: baseW,
              h: baseH,
              o: 0.7,
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
      const px1 = player.x - half;
      const px2 = player.x + half;
      const py1 = player.y - half;
      const py2 = player.y + half;

      placedObjects.forEach((obj) => {
        if (obj.type === 'blueplatform' && obj.visible === false) return;

        if (obj.type === 'line' || obj.type === 'blueplatform') {
          const len = obj.length || CONFIG.gridSize;
          const leftX = obj.x - len / 2;
          const rightX = obj.x + len / 2;
          const topY = obj.y - CONFIG.platformThickness / 2;
          const bottomY = obj.y + CONFIG.platformThickness / 2;

          const overlapX = px2 > leftX && px1 < rightX;
          const overlapY = py2 > topY && py1 < bottomY;

          if (overlapX && overlapY) {
            if (player.vy >= 0 && player.y - half < bottomY && player.y + half > topY) {
              player.y = topY - half;
              player.vy = 0;
              player.onGround = true;
            } else if (player.vy < 0 && player.y + half > topY && player.y - half < bottomY) {
              player.y = bottomY + half;
              player.vy = 0;
            } else {
              const penTop = bottomY - py1;
              const penBottom = py2 - topY;
              if (penTop < penBottom) {
                player.y += penTop;
              } else {
                player.y -= penBottom;
              }
            }
          }
        } else if (obj.type === 'killbrick') {
          const s = obj.size || CONFIG.gridSize;
          const leftX = obj.x - s / 2;
          const rightX = obj.x + s / 2;
          const topY = obj.y - s / 2;
          const bottomY = obj.y + s / 2;
          if (px2 > leftX && px1 < rightX && py2 > topY && py1 < bottomY) {
            resetPlayer();
          }
        }
      });

      if (player.onGround && !upIntent) {
        player.stamina = clamp(player.stamina + CONFIG.staminaRegenRate * dt, 0, CONFIG.staminaMax);
      }

      updateJetpackParticles(dt);

      cam.x = lerp(cam.x, player.x, CONFIG.camLerp);
      cam.y = lerp(cam.y, player.y - player.size / 2, CONFIG.camLerp);
      zoom = lerp(zoom, targetZoom, CONFIG.zoomLerp);

      window.player = player;
      window.cam = cam;
      window.zoom = zoom;

      fuelBarInner.style.width = `${(player.stamina / CONFIG.staminaMax) * 100}%`;
      coordsEl.textContent = `Coords: ${Math.round(player.x)}, ${Math.round(player.y)}`;
      if (statHUD) {
        const sp = Math.hypot(player.vx, player.vy).toFixed(3);
        statHUD.innerHTML = `pos: ${Math.round(player.x)}, ${Math.round(player.y)}<br>vel: ${Math.round(player.vx)}, ${Math.round(player.vy)} (${sp})`;
      }

      __prevUsingJet = usingJet;
    }

    function draw() {
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-cam.x, -cam.y);

      drawGrid();

      placedObjects.forEach((obj) => {
        if (obj.type === 'line' || obj.type === 'blueplatform') {
          ctx.lineWidth = CONFIG.platformThickness;
          ctx.lineCap = 'round';
          ctx.strokeStyle = obj.type === 'blueplatform' ? '#2b7bff' : '#ffffff';
          ctx.beginPath();
          ctx.moveTo(obj.x - obj.length / 2, obj.y);
          ctx.lineTo(obj.x + obj.length / 2, obj.y);
          ctx.stroke();
        } else if (obj.type === 'killbrick') {
          const s = obj.size || CONFIG.gridSize;
          ctx.fillStyle = '#ff3b3b';
          ctx.fillRect(obj.x - s / 2, obj.y - s / 2, s, s);
        }
      });

      for (const p of jetpackParticles) {
        if (p.o <= 0) continue;
        ctx.globalAlpha = Math.min(0.7, p.o);
        ctx.fillStyle = `hsl(${p.hue}, ${p.s}%, 60%)`;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      }
      ctx.globalAlpha = 1;

      ctx.beginPath();
      const pr = player.size / 2;
      ctx.fillStyle = '#086699';
      ctx.arc(player.x, player.y, pr, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.save();
      ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillStyle = 'rgba(220,230,255,0.75)';
      ctx.fillText('W = jetpack | A/D = move | U/I = zoom out/in | T = placement | R = reset', 12, h - 24);
      ctx.restore();

      if (placementOpen) {
        const world = screenToWorld(mouse.x, mouse.y);
        const gs = CONFIG.gridSize;
        let snapX;
        let snapY;

        if (placementType === 'killbrick' && !(killbrickGridSnapEl && killbrickGridSnapEl.checked)) {
          snapX = world.x;
          snapY = world.y;
        } else if (placementType === 'killbrick' && killbrickGridSnapEl && killbrickGridSnapEl.checked) {
          snapX = Math.floor(world.x / gs) * gs + gs / 2;
          snapY = Math.floor(world.y / gs) * gs + gs / 2;
        } else {
          snapX = Math.round(world.x / gs) * gs;
          snapY = Math.round(world.y / gs) * gs;
        }

        ctx.save();
        const scr = worldToScreen(snapX, snapY);
        if (placementType === 'killbrick') {
          const s = gs;
          ctx.fillStyle = 'rgba(255,59,59,0.35)';
          ctx.fillRect(scr.x - (s / 2) * zoom, scr.y - (s / 2) * zoom, s * zoom, s * zoom);
          ctx.strokeStyle = 'rgba(255,59,59,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(scr.x - (s / 2) * zoom, scr.y - (s / 2) * zoom, s * zoom, s * zoom);
        } else {
          const len = currentLineLength;
          const left = worldToScreen(snapX - len / 2, snapY);
          const right = worldToScreen(snapX + len / 2, snapY);
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

      const namePos = worldToScreen(player.x, player.y - pr - 5);
      ctx.save();
      ctx.font = '16px "Trebuchet MS", system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255, 230, 140, 0.92)';
      ctx.fillText('hen', namePos.x, namePos.y);
      ctx.restore();
    }

    function drawGrid() {
      const gs = CONFIG.gridSize;
      const pxSpacing = zoom * gs;
      const minSpacingPx = 2;
      const stepMultiplier = Math.max(1, Math.ceil(minSpacingPx / Math.max(pxSpacing, 0.0001)));
      const step = gs * stepMultiplier;

      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      const left = cam.x - w / (2 * zoom) - step * 2;
      const right = cam.x + w / (2 * zoom) + step * 2;
      const top = cam.y - h / (2 * zoom) - step * 2;
      const bottom = cam.y + h / (2 * zoom) + step * 2;

      const startVX = Math.floor(left / step) * step;
      for (let x = startVX; x <= right; x += step) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      const startHY = Math.floor(top / step) * step;
      for (let y = startHY; y <= bottom; y += step) {
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.moveTo(0, top);
      ctx.lineTo(0, bottom);
      ctx.moveTo(left, 0);
      ctx.lineTo(right, 0);
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

    const shrinkButton = document.getElementById('power0');
    if (shrinkButton) {
      let isShrunk = false;
      let shrinkYOffset = 0;
      const shrinkFactor = 0.7;
      shrinkButton.addEventListener('click', () => {
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

    fuelBarInner.style.width = '100%';
  });
})();
