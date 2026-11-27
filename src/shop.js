/**
 * Coin shop: cosmetic items. Data only — add an item by adding a line here.
 *   slot   'hat' | 'shirt' | 'pants' | 'skin'
 *   color  hex colour; hats also have a `style` (see makeHumanoid in models.js)
 *   price  0 = free / owned from the start
 */
export const SLOTS = {
  hat: { name: 'Hats', icon: '🎩' },
  shirt: { name: 'Shirts', icon: '👕' },
  pants: { name: 'Pants', icon: '👖' },
  skin: { name: 'Skin', icon: '🎨' },
};

export const ITEMS = [
  // hats
  { id: 'hat-none', slot: 'hat', name: 'No hat', icon: '🚫', style: null, color: 0, price: 0 },
  { id: 'hat-cap', slot: 'hat', name: 'Yellow cap', icon: '🧢', style: 'cap', color: 0xffd23f, price: 0 },
  { id: 'hat-party', slot: 'hat', name: 'Party hat', icon: '🥳', style: 'party', color: 0xf15bb5, price: 30 },
  { id: 'hat-top', slot: 'hat', name: 'Top hat', icon: '🎩', style: 'tophat', color: 0x222222, price: 60 },
  { id: 'hat-chef', slot: 'hat', name: 'Chef hat', icon: '👨‍🍳', style: 'chef', color: 0xffffff, price: 80 },
  { id: 'hat-horns', slot: 'hat', name: 'Devil horns', icon: '😈', style: 'horns', color: 0xd62828, price: 120 },
  { id: 'hat-prop', slot: 'hat', name: 'Propeller cap', icon: '🚁', style: 'propeller', color: 0x3fa9ff, price: 150 },
  { id: 'hat-crown', slot: 'hat', name: 'Golden crown', icon: '👑', style: 'crown', color: 0xffc300, price: 250 },
  { id: 'hat-halo', slot: 'hat', name: 'Halo', icon: '😇', style: 'halo', color: 0xfff3a0, price: 400 },
  // shirts
  { id: 'shirt-green', slot: 'shirt', name: 'Green', color: 0x22c55e, price: 0 },
  { id: 'shirt-red', slot: 'shirt', name: 'Red', color: 0xef233c, price: 20 },
  { id: 'shirt-blue', slot: 'shirt', name: 'Blue', color: 0x3a86ff, price: 20 },
  { id: 'shirt-purple', slot: 'shirt', name: 'Purple', color: 0x8338ec, price: 30 },
  { id: 'shirt-orange', slot: 'shirt', name: 'Orange', color: 0xfb8500, price: 30 },
  { id: 'shirt-pink', slot: 'shirt', name: 'Pink', color: 0xff70a6, price: 40 },
  { id: 'shirt-black', slot: 'shirt', name: 'Black', color: 0x1b1b1b, price: 60 },
  { id: 'shirt-white', slot: 'shirt', name: 'White', color: 0xf5f5f5, price: 60 },
  { id: 'shirt-gold', slot: 'shirt', name: 'Gold', color: 0xffc300, price: 300 },
  // pants
  { id: 'pants-navy', slot: 'pants', name: 'Navy', color: 0x1d3557, price: 0 },
  { id: 'pants-black', slot: 'pants', name: 'Black', color: 0x222222, price: 15 },
  { id: 'pants-white', slot: 'pants', name: 'White', color: 0xe9ecef, price: 25 },
  { id: 'pants-red', slot: 'pants', name: 'Red', color: 0x9d0208, price: 30 },
  { id: 'pants-green', slot: 'pants', name: 'Forest', color: 0x386641, price: 30 },
  // skin (real skin tones are always free)
  { id: 'skin-1', slot: 'skin', name: 'Tone 1', color: 0xffe0bd, price: 0 },
  { id: 'skin-2', slot: 'skin', name: 'Tone 2', color: 0xffd6a5, price: 0 },
  { id: 'skin-3', slot: 'skin', name: 'Tone 3', color: 0xe0ac69, price: 0 },
  { id: 'skin-4', slot: 'skin', name: 'Tone 4', color: 0xc68642, price: 0 },
  { id: 'skin-5', slot: 'skin', name: 'Tone 5', color: 0x8d5524, price: 0 },
  { id: 'skin-alien', slot: 'skin', name: 'Alien', color: 0x9fe870, price: 100 },
  { id: 'skin-blue', slot: 'skin', name: 'Smurfy', color: 0x7ec8e3, price: 100 },
  { id: 'skin-robot', slot: 'skin', name: 'Robot', color: 0x9aa0a8, price: 150 },
  { id: 'skin-gold', slot: 'skin', name: 'Golden', color: 0xffd700, price: 500 },
];

export const DEFAULT_EQUIPPED = { hat: 'hat-cap', shirt: 'shirt-green', pants: 'pants-navy', skin: 'skin-2' };
export const HAT_STYLES = ['cap', 'party', 'tophat', 'chef', 'horns', 'propeller', 'crown', 'halo'];

export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

export function isOwned(save, item) { return item.price === 0 || save.owned.includes(item.id); }

/** Turns the equipped items into the colours/hat used to build a character. */
export function lookFromSave(save) {
  const eq = { ...DEFAULT_EQUIPPED, ...save.equipped };
  const get = (slot) => {
    const it = itemById(eq[slot]);
    return it && it.slot === slot && isOwned(save, it) ? it : itemById(DEFAULT_EQUIPPED[slot]);
  };
  const hat = get('hat');
  return { skin: get('skin').color, shirt: get('shirt').color, pants: get('pants').color, hat: hat.style ? hat.color : null, hatStyle: hat.style };
}

/** Online: sanitise a look sent by another player. */
export function cleanLook(l) {
  const num = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
  if (!l || typeof l !== 'object') return null;
  return {
    skin: num(l.skin, 0xffd6a5), shirt: num(l.shirt, 0x22c55e), pants: num(l.pants, 0x1d3557),
    hat: l.hat === null ? null : num(l.hat, 0xffd23f),
    hatStyle: HAT_STYLES.includes(l.hatStyle) ? l.hatStyle : null,
  };
}

/** Buy an item. Returns an error message, or null on success. */
export function buy(save, item) {
  if (isOwned(save, item)) return null;
  if (save.coins < item.price) return `You need ${item.price - save.coins} more coins!`;
  save.coins -= item.price;
  save.owned.push(item.id);
  return null;
}
