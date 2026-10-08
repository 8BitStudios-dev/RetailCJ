/* Pixel-art characters. Coordinates stay anchored to the simulation's feet. */
(function () {
  'use strict';
  const graphics = window.PLGraphics = window.PLGraphics || {};
  const shades = new Map();
  function shade(hex, amount) {
    const key = hex + ':' + amount;
    if (!shades.has(key)) {
      const n = parseInt(hex.slice(1), 16);
      const channel = shift => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
      shades.set(key, '#' + [16, 8, 0].map(s => channel(s).toString(16).padStart(2, '0')).join(''));
    }
    return shades.get(key);
  }
  function drawPerson(ctx, entity, scale, options = {}) {
    const look = entity.look;
    if (!look) return;
    const footX = Math.round(entity.x / scale), footY = Math.round(entity.y / scale);
    const seated = entity.state === 'seated' || (entity.state === 'training' && !entity.path.length) || (entity.state === 'setup' && !entity.standing);
    const moving = entity.path.length > 0;
    const frame = moving ? Math.floor(entity.walk) % 4 : -1;
    const x = footX - 6, y = footY - (seated ? 14 : 18);
    const p = (dx, dy, w, h, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + dx, y + dy, w, h);
    };
    const dark = '#26303d', shoes = '#1e2530';
    p(1, seated ? 12 : 17, 10, 2, 'rgba(22,30,34,0.20)');
    if (options.selected) {
      const ringY = seated ? 13 : 18;
      p(-1, ringY - 2, 1, 4, '#43d9ed'); p(12, ringY - 2, 1, 4, '#43d9ed');
      p(0, ringY - 3, 12, 1, '#a2f5fb'); p(0, ringY + 2, 12, 1, '#43d9ed');
      p(-1, ringY + 1, 2, 1, '#43d9ed'); p(11, ringY + 1, 2, 1, '#43d9ed');
    }
    // Head, ears and hair: same person in four walking directions.
    p(3, 0, 6, 1, shade(look.hair, -12)); p(2, 1, 8, 4, look.hair);
    p(3, 1, 5, 1, shade(look.hair, 22));
    if (entity.facing === 'up') {
      p(2, 4, 8, 2, look.hair); p(4, 6, 4, 1, look.skin);
    } else {
      p(3, 3, 6, 4, look.skin);
      p(2, 4, 1, 2, look.skin); p(9, 4, 1, 2, shade(look.skin, -12));
      p(4, 7, 4, 1, shade(look.skin, -18));
      if (entity.facing === 'left') {
        p(7, 3, 3, 3, look.hair); p(3, 4, 1, 1, dark); p(2, 5, 1, 1, look.skin);
      } else if (entity.facing === 'right') {
        p(2, 3, 3, 3, look.hair); p(8, 4, 1, 1, dark); p(9, 5, 1, 1, look.skin);
      } else {
        p(4, 4, 1, 1, dark); p(7, 4, 1, 1, dark);
        p(5, 6, 2, 1, shade(look.skin, -30));
      }
    }
    // Shirt outline, collar and discreet highlights.
    p(2, 8, 8, 6, shade(look.shirt, -22)); p(3, 8, 6, 6, look.shirt);
    p(3, 8, 2, 4, shade(look.shirt, 18)); p(5, 8, 2, 1, shade(look.shirt, -12));
    const armLeft = frame === 0 || frame === 3 ? 1 : 0;
    const armRight = frame === 1 || frame === 2 ? 1 : 0;
    p(1, 9 - armLeft, 2, 4, look.shirt); p(9, 9 - armRight, 2, 4, shade(look.shirt, -10));
    p(1, 12 - armLeft, 2, 2, look.skin); p(9, 12 - armRight, 2, 2, shade(look.skin, -12));
    if (entity.isStaff && options.badge && entity.facing !== 'up') {
      p(7, 9, 2, 2, options.badge); p(7, 9, 1, 1, '#fffaf0');
    }
    if (seated) {
      p(3, 13, 6, 1, look.pants); p(2, 14, 3, 1, shoes); p(7, 14, 3, 1, shoes);
    } else {
      p(3, 14, 6, 2, look.pants);
      p(3, 16, 2, frame === 1 ? 1 : 2, look.pants);
      p(7, 16, 2, frame === 3 ? 1 : 2, shade(look.pants, -10));
      p(2, frame === 1 ? 17 : 18, 3, 1, shoes);
      p(7, frame === 3 ? 17 : 18, 3, 1, shoes);
    }
    if (entity.bubble && options.drawIcon) {
      const bx = footX - 7, by = y - 17;
      ctx.fillStyle = '#293443'; ctx.fillRect(bx + 1, by, 12, 14); ctx.fillRect(bx, by + 1, 14, 12);
      ctx.fillStyle = '#fffdf7'; ctx.fillRect(bx + 2, by + 2, 10, 10);
      ctx.fillStyle = '#293443'; ctx.fillRect(bx + 6, by + 14, 2, 2);
      options.drawIcon(entity.bubble.icon, bx + 2, by + 2, 2);
    } else if (options.waiting) {
      const clockX = footX - 4, clockY = y - 12;
      ctx.fillStyle = '#b67612'; ctx.fillRect(clockX + 1, clockY, 6, 10); ctx.fillRect(clockX, clockY + 1, 8, 8);
      ctx.fillStyle = '#f8c95a'; ctx.fillRect(clockX + 1, clockY + 1, 6, 8);
      ctx.fillStyle = '#fff8db'; ctx.fillRect(clockX + 2, clockY + 2, 4, 6);
      ctx.fillStyle = '#855514'; ctx.fillRect(clockX + 4, clockY + 3, 1, 3); ctx.fillRect(clockX + 4, clockY + 5, 2, 1);
    }
  }
  graphics.drawPerson = drawPerson;
})();
