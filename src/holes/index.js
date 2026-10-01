import desert from './desert.js';
import forest from './forest.js';
import ice from './ice.js';
import mountain from './mountain.js';
import sector5 from './sector5.js';
import fortune from './fortune.js';

export const SECTORS = [
  { key: 'desert', name: 'Desert Sector' },
  { key: 'forest', name: 'Forest Sector' },
  { key: 'ice', name: 'Ice Sector' },
  { key: 'mountain', name: 'Mountain Sector' },
  { key: 'sector5', name: 'Sector 5' },
  { key: 'fortune', name: 'Cyberpunk Fortune Falls' },
];

export const SECTOR_NAMES = Object.fromEntries(SECTORS.map((s) => [s.key, s.name]));

// 3 holes per sector × 6 sectors = 18, in play order.
export const HOLES = [...desert, ...forest, ...ice, ...mountain, ...sector5, ...fortune];
