/* Accessory-wall artwork. Coordinates and customer interaction spots stay in index.html. */
(function (root) {
  'use strict';

  const graphics = root.PLGraphics = root.PLGraphics || {};
  const INK = '#343b43';
  const SILVER = '#a8afb5';
  const PAPER = '#f0f1ec';
  const COLORS = Object.freeze({
    k: INK, d: '#626c77', s: SILVER, w: PAPER, h: '#ffffff',
    b: '#5f9ba8', c: '#91bac0', r: '#c9807c', y: '#c9ae73',
    g: '#8da88b', p: '#a58bb7', v: '#776493', n: '#688ba0',
  });

  // Each silhouette is drawn with solid, integer-aligned canvas pixels.
  const SPRITES = {
    wallet: [
      '.kkkkkk.', 'kbbbbbbk', 'kbhhhbbk', 'kbcccbbk', 'kbbbbbbk',
      'kbbbbbbk', 'kbbbbbbk', 'kbbbbbbk', 'kbbbbbbk', '.kkkkkk.',
    ],
    battery: [
      '..ssss..', '.swwwws.', '.swhhws.', '.swhhws.', '.swwwws.',
      '.swwwws.', '.swwwws.', '.swwwws.', '.swwwws.', '..ssss..',
    ],
    puck: [
      '...sss...', '..swwws..', '.swhhhws.', 'swhssshws', 'swhswshws',
      'swhssshws', '.swhhhws.', '..swwws..', '...sss...', '....s....',
      '....s....', '....s....',
    ],
    stand: [
      '..kkkkk..', '..kbbbk..', '..kbbbk..', '..kbbbk..', '..kbbbk..',
      '..kkkkk..', '....s....', '....s....', '..sssss..', '.sssssss.',
    ],
    case: [
      '.kkkkkk.', 'kcccccck', 'kcddccck', 'kcddccck', 'kcccccck',
      'kcccccck', 'kcccccck', 'kcccccck', 'kcccccck', 'kcccccck',
      'kcccccck', 'kcccccck', '.kkkkkk.',
    ],
    controller: [
      '..kkkkkkkkk..', '.kwwwwwwwwwk.', 'kwwdwwwrwwwpk', 'kwdddwwwwbwwk',
      'kwwdwwwwgwwwk', 'kwwwwkkkwwwwk', '.kwwk...kwwk.', '..kk.....kk..',
    ],
    game: [
      '.kkkkkkk.', 'kccccccck', 'kchhcccck', 'kcchhccck', 'kccchhcck',
      'kccccccck', 'kcccvccck', 'kccvvvcck', 'kcvvvvvck', 'kccccccck',
      'kwwwwwwwk', '.kkkkkkk.',
    ],
    tv: [
      'kkkkkkkkkkk', 'kbbbbbbbbbk', 'kbhhbbbbbbk', 'kbchhbbbbbk',
      'kbccchhbbbk', 'kbcccccbbbk', 'kkkkkkkkkkk', '.....s.....',
      '...sssss...',
    ],
    tvBox: [
      '.kkkkkkk.', 'kdddddddk', 'kdddddddk', 'kdddwhddk', 'kdddddddk',
      '.kkkkkkk.',
    ],
    remote: [
      '.sss.', 'skkks', 'skhks', 'skkks', 'skdks', 'skkks', 'skwks',
      'skkks', 'skwks', 'skkks', 'skkks', 'skkks', '.sss.',
    ],
    charger: [
      '..s.s..', '..s.s..', '.sssss.', 'swwwwws', 'swhhhws', 'swhhhws',
      'swwwwws', 'swwwwws', '.sssss.', '...s...',
    ],
    cable: [
      '...sss...', '..s...s..', '.s.sss.s.', 's.s...s.s', 's.s.s.s.s',
      's.s...s.s', '.s.sss.s.', '..s...s..', '...sss...', '....s....',
      '....s....', '...www...', '...www...',
    ],
    pencil: [
      '.s.', '.w.', '.w.', '.w.', '.w.', '.w.', '.w.', '.w.',
      '.w.', '.w.', '.w.', '.s.', '.k.',
    ],
    folio: [
      '.kkkkkkkkk.', 'kbcccccccck', 'kbcccccccck', 'kbcccccccck',
      'kbcccccccck', 'kbcccccccck', 'kbcccccccck', 'kbcccccccck',
      'kbcccccccck', 'kbcccccccck', '.kkkkkkkkk.',
    ],
    ipadKeyboard: [
      '.sssssssss.', 'sddddddddds', 'sdhddddddds', 'sddddddddds',
      'sssssssssss', 'swkwkwkwkws', 'swkwkwkwkws', 'swwkkkkkwws',
      '.sssssssss.',
    ],
    airpodsCase: [
      '..sssssss..', '.swwwwwwws.', 'swwhhhhwwws', 'swwhhhhwwws',
      'swwwwwwwwws', 'sddddddddds', 'swwwwwwwwws', 'swwwwgwwwws',
      '.swwwwwwws.', '..sssssss..',
    ],
    airpods: [
      '.sss...sss.', 'shwws.swwhs', 'shkws.swkhs', '.ssws.swss.',
      '..sws.sws..', '..sws.sws..', '..sws.sws..', '..sws.sws..',
      '..sss.sss..',
    ],
    earbuds: [
      '.sss...sss.', 'swwws.swwws', 'swkws.swkws', '.swws.swws.',
      '..sws.sws..', '..sws.sws..', '..sss.sss..',
    ],
    music: [
      '.....wwwww.', '..wwwwwwww.', '..wwww..ww.', '..ww....ww.',
      '..ww....ww.', '..ww....ww.', '.www...www.', 'wwww..wwww.',
      'www...www..', '.w.....w...',
    ],
    musicPlayer: [
      '.kkkkkkk.', 'kccccccck', 'kcwwwwcck', 'kcwccwcck', 'kcwccwcck',
      'kcwccwcck', 'kcwwwwcck', 'kccccccck', 'kcwwwccck', 'kcwwwccck',
      'kccccccck', '.kkkkkkk.',
    ],
    watchBand: [
      '..cccc..', '..cccc..', '..cdcc..', '..cccc..', '..cdcc..',
      '..cccc..', '.ssssss.', '.sdddds.', '.sdhhds.', '.sdddds.',
      '.ssssss.', '..cccc..', '..cdcc..', '..cccc..', '..cdcc..',
      '..cccc..', '..cdcc..', '..cccc..', '..cccc..',
    ],
    homepod: [
      '..kkkkkk..', '.kcccccck.', 'kcccssccck', 'kccsssscck',
      'kcccccccck', 'kcsccsccck', 'kcccccccck',
      'kccsccscck', 'kcccccccck', 'kcsccsccck',
      '.kcccccck.', '..kkkkkk..',
    ],
    homepodMini: [
      '...kkkk...', '..kcccck..', '.kccsscck.', 'kccsssssck',
      'kcccccccck', 'kcsccsccck', 'kcccccccck',
      '.kcsccsck.', '..kcccck..', '...kkkk...',
    ],
    keyboard: [
      '.sssssssssss.', 'swwwwwwwwwwws', 'swkwkwkwkwkws', 'swwkwkwkwkwws',
      'swkwkwkwkwkws', 'swwwkkkkkwwws', '.sssssssssss.',
    ],
    mouse: [
      '..ssss..', '.swwwws.', 'swwsswws', 'swwsswws', 'swwwwwws',
      'swwwwwws', 'swwwwwws', '.swwwws.', '..ssss..',
    ],
    trackpad: [
      '.sssssssss.', 'swwwwwwwwws', 'swhhhhhhhws', 'swhhhhhhhws',
      'swhhhhhhhws', 'swhhhhhhhws', 'swwwwwwwwws', '.sssssssss.',
    ],
    hub: [
      '....s.....', '....s.....', '.ssssssss.', 'sdddddddds',
      'sdkdkdkdds', 'sdddddddds', '.ssssssss.',
    ],
    adapter: [
      '..ss..', '..ss..', '..ss..', '..ss..', '.ssss.', 'swwwws',
      'swhhws', 'swwwws', 'swwwws', 'swwwws', 'sdddds', '.ssss.',
    ],
  };

  const categories = {
    L: [
      { id: 'iphone-accessories', name: 'Accessori iPhone', items: ['wallet', 'battery', 'puck', 'stand'] },
      { id: 'iphone-cases', name: 'Custodie iPhone', items: ['case', 'case', 'case', 'case'], tones: ['r', 'y', 'g', 'p'] },
      { id: 'arcade', name: 'Arcade', background: '#75658b', items: ['controller', 'game', 'game', 'game'], tones: ['w', 'v', 'p', 'b'] },
      { id: 'tv', name: 'TV', background: '#4c5969', items: ['tv', 'tvBox', 'remote'] },
      { id: 'iphone-chargers', name: 'Caricatori iPhone', items: ['charger', 'cable', 'charger', 'puck'] },
      { id: 'ipad-accessories', name: 'Accessori iPad', items: ['folio', 'ipadKeyboard', 'folio', 'pencil'], tones: ['n', 'w', 'b', 'w'] },
    ],
    R: [
      { id: 'airpods', name: 'AirPods', items: ['airpodsCase', 'airpods', 'earbuds', 'airpods'] },
      { id: 'music', name: 'Music', background: '#bc7479', items: ['musicPlayer', 'music', 'musicPlayer', 'musicPlayer'], tones: ['r', 'w', 'r', 'r'] },
      { id: 'watch-bands', name: 'Cinturini Watch', items: ['watchBand', 'watchBand', 'watchBand', 'watchBand'], tones: ['y', 'g', 'p', 'n'] },
      { id: 'homepod', name: 'HomePod', items: ['homepod', 'homepodMini', 'homepod'], tones: ['d', 'd', 'w'] },
      { id: 'mac-keyboards-mice', name: 'Mac · tastiere e mouse', items: ['keyboard', 'mouse', 'trackpad'] },
      { id: 'mac-adapters-cables', name: 'Mac · adattatori e cavi', items: ['hub', 'adapter', 'cable', 'adapter'] },
    ],
  };

  Object.keys(categories).forEach(side => {
    categories[side].forEach(category => {
      Object.freeze(category.items);
      if (category.tones) Object.freeze(category.tones);
      Object.freeze(category);
    });
    Object.freeze(categories[side]);
  });
  graphics.accessoryWallCategories = Object.freeze(categories);

  function fill(ctx, x, y, width, height, color) {
    if (width <= 0 || height <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }

  function drawSprite(ctx, sprite, centerX, centerY, availableWidth, tone) {
    const spriteWidth = sprite[0].length;
    const factor = Math.min(1, availableWidth / spriteWidth);
    const width = Math.round(spriteWidth * factor);
    const height = Math.round(sprite.length * factor);
    const x = Math.round(centerX - width / 2);
    const y = Math.round(centerY - height / 2);
    sprite.forEach((row, j) => {
      [...row].forEach((key, i) => {
        if (key === '.') return;
        const colorKey = tone && key === 'c' ? tone : key;
        const left = x + Math.round(i * factor);
        const top = y + Math.round(j * factor);
        const right = x + Math.round((i + 1) * factor);
        const bottom = y + Math.round((j + 1) * factor);
        fill(ctx, left, top, right - left, bottom - top, COLORS[colorKey]);
      });
    });
    return { x, y, width, height };
  }

  graphics.drawAccessoryWall = function drawAccessoryWall(ctx, wall, scale) {
    if (!ctx || !wall || !Number.isFinite(scale) || scale <= 0) return;
    const x = Math.round(wall.x / scale);
    const y = Math.round(wall.y / scale);
    const width = Math.round((wall.x + wall.w) / scale) - x;
    const height = Math.round((wall.y + wall.h) / scale) - y;
    if (width < 3 || height < 12) return;
    const side = wall.side === 'L' || wall.side === 'R' ? wall.side : wall.x < 720 ? 'L' : 'R';
    const wallCategories = categories[side];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    fill(ctx, x, y, width, height, '#444e5a');
    wallCategories.forEach((category, index) => {
      const top = y + Math.round(index * height / 6);
      const bottom = y + Math.round((index + 1) * height / 6);
      const panelHeight = bottom - top;
      const backdrop = category.background || '#d8dcda';
      // Narrow aluminium frames make all six merchandising bays distinct.
      fill(ctx, x + 1, top + 1, width - 2, panelHeight - 3, SILVER);
      fill(ctx, x + 2, top + 3, width - 4, panelHeight - 7, backdrop);
      fill(ctx, x + 1, top + 1, width - 2, 1, '#d8dddc');
      fill(ctx, x + 1, bottom - 3, width - 2, 1, '#69737d');
      fill(ctx, x + (side === 'L' ? width - 2 : 1), top + 3, 1, panelHeight - 7, '#8c969f');

      const innerTop = top + 8;
      const innerHeight = panelHeight - 18;
      const spacing = innerHeight / category.items.length;
      category.items.forEach((name, itemIndex) => {
        const centerY = innerTop + spacing * (itemIndex + 0.5);
        const bounds = drawSprite(ctx, SPRITES[name], x + width / 2, centerY, width - 4,
          category.tones && category.tones[itemIndex]);
        // A small mounting shadow, rather than bright packaging on every row.
        fill(ctx, bounds.x + 1, bounds.y + bounds.height + 1, Math.max(1, bounds.width - 2), 1,
          category.background ? '#ffffff35' : '#b4bbb9');
      });
    });
    ctx.restore();
  };
})(window);
