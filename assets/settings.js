(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'jp_settings_v1';

    const DEFAULT = {
      graphics: {
        playerInterpolation: false,
        networkUsage: 'high',
        showFPS: false,
        keyOverlay: true,
        diagnostics: true,
      },
      player: {
        color: '#086699',
        showHitbox: false,
        showState: false,
      },
      keybinds: {
        up: 'w',
        down: 's',
        left: 'a',
        right: 'd',
        power1: 'e',
        power2: 'f',
        hitboxes: 'o',
      },
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
      } catch (e) {
        /* ignore */
      }
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

      keyButtons.forEach((btn) => {
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
      overlay.classList.toggle('open', open);
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
      if (netHigh) netHigh.checked = v === 'high';
      if (netMedium) netMedium.checked = v === 'medium';
      if (netLow) netLow.checked = v === 'low';
      saveSettings();
    }

    if (netHigh) netHigh.addEventListener('change', () => setNetwork('high'));
    if (netMedium) netMedium.addEventListener('change', () => setNetwork('medium'));
    if (netLow) netLow.addEventListener('change', () => setNetwork('low'));

    if (colorPicker) {
      colorPicker.addEventListener('change', () => {
        settings.player.color = colorPicker.value;
        if (colorHexInput) colorHexInput.value = colorPicker.value.toUpperCase();
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

    keyButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        listeningFor = btn.dataset.action;
        keyButtons.forEach((b) => b.classList.toggle('listening', b === btn));
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleSettingsOverlay();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!settingsOpen || !listeningFor) return;
      if (e.key === 'Escape') {
        listeningFor = null;
        keyButtons.forEach((b) => b.classList.remove('listening'));
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const action = listeningFor;
      listeningFor = null;
      keyButtons.forEach((b) => b.classList.remove('listening'));

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
  });
})();
