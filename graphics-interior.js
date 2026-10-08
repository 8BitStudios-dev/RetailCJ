/* Native pixel-art furnishings. All positions and sizes remain in world units. */
(function (global) {
  'use strict';

  const graphics = global.PLGraphics || (global.PLGraphics = {});
  const floorCache = new Map();
  const treeCache = new Map();
  const screens = [
    ['#087ccc', '#53c8f5'], ['#1593af', '#77ded9'],
    ['#d9982d', '#ffe28a'], ['#ae53ba', '#eb9ede'],
    ['#6452b2', '#a798ec'], ['#1174c6', '#80d7ff'],
  ];

  const pixel = (value, scale) => Math.round(value / scale);
  const safeScale = scale => Number.isFinite(scale) && scale > 0 ? scale : 2.5;

  function fill(ctx, x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function worldRect(ctx, x, y, w, h, color, scale) {
    const left = pixel(x, scale), top = pixel(y, scale);
    fill(ctx, left, top,
      Math.max(1, pixel(x + w, scale) - left),
      Math.max(1, pixel(y + h, scale) - top), color);
  }

  // Integer hash for visual variation; never advances the simulation's RNG.
  function hash(x, y, seed) {
    let value = Math.imul(x + 101, 374761393) ^ Math.imul(y + 59, 668265263) ^ seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  function remember(cache, key, value, limit) {
    if (cache.size >= limit) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  }

  // width and height are canvas pixels; the floor geometry is the original plan.
  function drawFloor(ctx, options) {
    const settings = options || {};
    const scale = safeScale(settings.scale);
    const width = Math.round(settings.width || ctx.canvas.width);
    const height = Math.round(settings.height || ctx.canvas.height);
    const key = width + ':' + height + ':' + scale;
    let cached = floorCache.get(key);
    if (!cached) {
      const target = surface(width, height), f = target.ctx;
      fill(f, 0, 0, width, height, '#24272d');
      // A few quiet bands retain the charcoal surround without a smooth gradient.
      for (let y = 0; y < height; y += 8) {
        fill(f, 0, y, width, 8, y % 24 === 0 ? '#25282e' : '#24272d');
      }
      const left = pixel(105, scale), top = pixel(60, scale);
      const right = pixel(1310, scale), bottom = pixel(1880, scale);
      fill(f, left, top, right - left, bottom - top, '#d5d4cf');
      const stone = ['#d5d4cf', '#d6d5d0', '#d7d6d1', '#d4d3ce'];
      let row = 0;
      for (let wy = 60; wy < 1880; wy += 60, row++) {
        let column = 0;
        for (let wx = 105; wx < 1310; wx += 120, column++) {
          const x = pixel(wx, scale), y = pixel(wy, scale);
          const tileW = pixel(Math.min(wx + 120, 1310), scale) - x;
          const tileH = pixel(Math.min(wy + 60, 1880), scale) - y;
          const tone = Math.floor(hash(column, row, 721) * stone.length);
          fill(f, x, y, tileW, tileH, stone[tone]);
          fill(f, x, y, tileW, 1, '#bfc1bb');
          fill(f, x, y, 1, tileH, '#bfc1bb');
          if (tileW > 3 && tileH > 3) {
            fill(f, x + 1, y + 1, tileW - 1, 1, '#dcdbd6');
            // Sparse, low-contrast stone flecks, fixed to this tile.
            for (let i = 0; i < 3; i++) {
              const tx = x + 2 + Math.floor(hash(column, row, i + 907) * (tileW - 3));
              const ty = y + 3 + Math.floor(hash(row, column, i + 1103) * (tileH - 4));
              fill(f, tx, ty, 1, 1, i === 0 ? '#dfded9' : '#cecec7');
            }
          }
        }
      }
      fill(f, left, top, right - left, 1, '#f0efea');
      fill(f, left, top, 1, bottom - top, '#e9e8e2');
      fill(f, right - 1, top, 1, bottom - top, '#aeb1ab');
      fill(f, left, bottom - 1, right - left, 1, '#aeb1ab');

      // The entrance keeps exactly the existing position and opening width.
      const doorLeft = pixel(1189, scale), doorRight = pixel(1305, scale);
      fill(f, doorLeft, 0, doorRight - doorLeft, top, '#d8d8d3');
      fill(f, doorLeft, 0, 1, top, '#eeefed');
      fill(f, doorRight - 1, 0, 1, top, '#b4b9ba');
      fill(f, doorLeft, pixel(52, scale), doorRight - doorLeft, 1, '#70b6d8');
      cached = remember(floorCache, key, target.canvas, 4);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cached, 0, 0);
    ctx.restore();
  }

  function wood(ctx, x, y, w, h, seed) {
    fill(ctx, x + 2, y + 3, w, h, 'rgba(27,31,30,0.18)');
    fill(ctx, x, y, w, h, '#8e6638');
    fill(ctx, x + 1, y + 1, w - 2, h - 3, '#c99857');
    const grain = ['#c28f4e', '#cda063', '#d0a365', '#c69454'];
    for (let i = 3; i < w - 2; i += 4) {
      const tone = Math.floor(hash(i, h, seed) * grain.length);
      fill(ctx, x + i, y + 2, 1, h - 5, grain[tone]);
      if (hash(i, w, seed + 13) > 0.65) {
        fill(ctx, x + i + 1, y + 9, 1, Math.max(1, h - 20), '#cda063');
      }
    }
    fill(ctx, x + 1, y, w - 2, 1, '#f0c58a');
    fill(ctx, x + 1, y + 1, 1, h - 3, '#dfb274');
    fill(ctx, x + w - 2, y + 2, 1, h - 4, '#b48144');
    fill(ctx, x + 1, y + h - 2, w - 2, 1, '#a9783e');
    fill(ctx, x + 2, y + h - 3, w - 4, 1, '#b9894b');
  }

  function display(ctx, wx, wy, ww, wh, colors, scale, shell) {
    const x = pixel(wx, scale), y = pixel(wy, scale);
    const w = Math.max(3, pixel(wx + ww, scale) - x);
    const h = Math.max(4, pixel(wy + wh, scale) - y);
    fill(ctx, x + 1, y + 1, w, h, 'rgba(47,37,28,0.18)');
    fill(ctx, x, y, w, h, shell || '#19232c');
    fill(ctx, x + 1, y + 1, w - 2, h - 2, colors[0]);
    // A crisp, stepped screen reflection instead of a gradient.
    for (let iy = 1; iy < h - 1; iy++) {
      const span = Math.max(1, Math.floor((h - iy) * (w - 2) / h));
      fill(ctx, x + 1, y + iy, span, 1, colors[1]);
    }
    fill(ctx, x + 1, y, Math.max(1, w - 2), 1, '#35424d');
  }

  function drawTable(ctx, table, inputScale) {
    const scale = safeScale(inputScale);
    const x = pixel(table.x, scale), y = pixel(table.y, scale);
    const w = pixel(table.x + table.w, scale) - x;
    const h = pixel(table.y + table.h, scale) - y;
    ctx.save();
    wood(ctx, x, y, w, h, Math.round(table.x + table.y));
    if (table.kind === 'support') {
      worldRect(ctx, table.x + 15, table.y + 8, table.w - 30, 8, '#a27640', scale);
      worldRect(ctx, table.x + 17, table.y + 8, table.w - 34, 3, '#e5b879', scale);
      for (let i = 0; i < 2; i++) {
        display(ctx, table.x + 19, table.y + 51 + i * 105, 26, 22,
          ['#101d29', '#263642'], scale, '#e1e4e0');
      }
    } else if (table.kind === 'express' || table.product === 'express') {
      display(ctx, table.x + 57, table.y + 98, 23, 31, screens[0], scale);
      const boxes = ['#edf0e8', '#da6356', '#368ec2', '#e6b14c', '#70a655', '#bd70be'];
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 2; column++) {
          const bx = table.x + 15 + column * 20, by = table.y + 49 + row * 55;
          worldRect(ctx, bx + 2, by + 2, 15, 15, '#a17b4a', scale);
          worldRect(ctx, bx, by, 15, 15, boxes[row * 2 + column], scale);
          worldRect(ctx, bx, by, 15, 3, '#e8d4aa', scale);
        }
      }
      worldRect(ctx, table.x + 15, table.y + 195, 58, 14, '#2c69ae', scale);
      worldRect(ctx, table.x + 18, table.y + 195, 52, 3, '#5797d0', scale);
    } else if (table.product === 'help') {
      worldRect(ctx, table.x + 21, table.y + 94, 44, 40, '#b78a50', scale);
      worldRect(ctx, table.x + 22, table.y + 93, 42, 38, '#d8ac70', scale);
      worldRect(ctx, table.x + 22, table.y + 93, 42, 3, '#e7be85', scale);
    } else {
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 2; column++) {
          const centerX = table.x + 22 + column * 44;
          const centerY = table.y + 32 + row * 52;
          const colors = screens[(row * 2 + column) % screens.length];
          if (table.product === 'iphone') {
            display(ctx, centerX - 8, centerY - 14, 16, 28, colors, scale);
            worldRect(ctx, centerX - 3, centerY - 12, 6, 2, '#18232c', scale);
          } else if (table.product === 'ipad') {
            display(ctx, centerX - 15, centerY - 18, 30, 36, colors, scale);
          } else if (table.product === 'watch') {
            worldRect(ctx, centerX - 3, centerY - 17, 6, 34, '#838f92', scale);
            worldRect(ctx, centerX - 2, centerY - 15, 3, 31, '#b8bdba', scale);
            display(ctx, centerX - 7, centerY - 9, 14, 18,
              ['#142c3c', '#346075'], scale, '#323d43');
          } else if (table.product === 'mac') {
            display(ctx, centerX - 15, centerY - 16, 30, 23, colors, scale, '#d9e0dd');
            worldRect(ctx, centerX - 17, centerY + 7, 34, 10, '#929eaa', scale);
            worldRect(ctx, centerX - 15, centerY + 8, 30, 5, '#c3ccc9', scale);
            worldRect(ctx, centerX - 5, centerY + 13, 10, 3, '#e1e5e0', scale);
          }
        }
      }
    }
    ctx.restore();
  }

  function treeSprite(tree, scale) {
    const radius = Math.max(1, pixel(tree.r, scale));
    const seed = (Math.round(tree.x) * 31 + Math.round(tree.y) * 17) | 0;
    const key = radius + ':' + scale + ':' + seed;
    let cached = treeCache.get(key);
    if (cached) return cached;
    const pad = 1, center = radius + pad;
    const target = surface(radius * 2 + 8, radius * 2 + 8), f = target.ctx;
    for (let dy = -radius; dy <= radius; dy++) {
      const span = Math.floor(Math.sqrt(radius * radius - dy * dy));
      fill(f, center - span + 2, center + dy + 3, span * 2 + 1, 1, 'rgba(24,38,27,0.18)');
    }
    const cluster = Math.max(1, pixel(6, scale));
    const palette = ['#225b31', '#2e7335', '#36843a', '#4d9536', '#72ac3d', '#95bf4c'];
    const rim = Math.max(1, pixel(5, scale));
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = dx * dx + dy * dy;
        if (distance > radius * radius) continue;
        const cellX = Math.floor((dx + radius) / cluster);
        const cellY = Math.floor((dy + radius) / cluster);
        const noise = hash(cellX, cellY, seed);
        let color;
        if (distance > (radius - rim) * (radius - rim)) {
          color = noise > 0.65 ? '#245e32' : '#194b2d';
        } else {
          const light = (-dx - dy) / Math.max(1, radius) * 0.12;
          const value = noise + light - (distance / (radius * radius)) * 0.11;
          const index = value > 0.96 ? 5 : value > 0.81 ? 4 : value > 0.61 ? 3 : value > 0.33 ? 2 : value > 0.12 ? 1 : 0;
          color = palette[index];
        }
        fill(f, center + dx, center + dy, 1, 1, color);
      }
    }
    cached = { canvas: target.canvas, offset: center };
    return remember(treeCache, key, cached, 32);
  }

  function drawTree(ctx, tree, inputScale) {
    const scale = safeScale(inputScale), cached = treeSprite(tree, scale);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cached.canvas, pixel(tree.x, scale) - cached.offset,
      pixel(tree.y, scale) - cached.offset);
    ctx.restore();
  }

  function drawStool(ctx, stool, inputScale) {
    const scale = safeScale(inputScale);
    const x = pixel(stool.x - 25, scale), y = pixel(stool.y - 30, scale);
    const w = pixel(stool.x + 30, scale) - x;
    const h = pixel(stool.y + 30, scale) - y;
    ctx.save();
    wood(ctx, x, y, w, h, Math.round(stool.x + stool.y));
    ctx.restore();
  }

  Object.assign(graphics, { drawFloor, drawTable, drawTree, drawStool });
})(window);
