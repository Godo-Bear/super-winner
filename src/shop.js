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
  back: { name: 'Back', icon: '🎒' },
  pet: { name: 'Pets', icon: '🐾' },
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
  { id: 'hat-beanie', slot: 'hat', name: 'Beanie', icon: '🧶', style: 'beanie', color: 0x3a86ff, price: 25 },
  { id: 'hat-cat', slot: 'hat', name: 'Cat ears', icon: '🐱', style: 'cat', color: 0x333333, price: 40 },
  { id: 'hat-bunny', slot: 'hat', name: 'Bunny ears', icon: '🐰', style: 'bunny', color: 0xffffff, price: 50 },
  { id: 'hat-flower', slot: 'hat', name: 'Flower crown', icon: '🌸', style: 'flower', color: 0x3ddc84, price: 60 },
  { id: 'hat-headphones', slot: 'hat', name: 'Headphones', icon: '🎧', style: 'headphones', color: 0x222222, price: 70 },
  { id: 'hat-cowboy', slot: 'hat', name: 'Cowboy hat', icon: '🤠', style: 'cowboy', color: 0x8b5a2b, price: 90 },
  { id: 'hat-pirate', slot: 'hat', name: 'Pirate hat', icon: '🏴‍☠️', style: 'pirate', color: 0x1b1b1b, price: 110 },
  { id: 'hat-santa', slot: 'hat', name: 'Santa hat', icon: '🎅', style: 'santa', color: 0xd62828, price: 130 },
  { id: 'hat-wizard', slot: 'hat', name: 'Wizard hat', icon: '🧙', style: 'wizard', color: 0x3a0ca3, price: 180 },
  { id: 'hat-helmet', slot: 'hat', name: 'Space helmet', icon: '🧑‍🚀', style: 'helmet', color: 0xf2f2f2, price: 300 },
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
  { id: 'shirt-teal', slot: 'shirt', name: 'Teal', color: 0x06d6a0, price: 25 },
  { id: 'shirt-sky', slot: 'shirt', name: 'Sky blue', color: 0x7fd4ff, price: 25 },
  { id: 'shirt-lime', slot: 'shirt', name: 'Lime', color: 0xb5e61d, price: 30 },
  { id: 'shirt-navy', slot: 'shirt', name: 'Navy', color: 0x1d3557, price: 35 },
  { id: 'shirt-brown', slot: 'shirt', name: 'Brown', color: 0x8b5a2b, price: 35 },
  { id: 'shirt-lavender', slot: 'shirt', name: 'Lavender', color: 0xc8b6ff, price: 45 },
  { id: 'shirt-silver', slot: 'shirt', name: 'Silver', color: 0xc0c0c8, price: 150 },
  { id: 'shirt-neon', slot: 'shirt', name: 'Neon green', color: 0x39ff14, price: 200 },
  // pants
  { id: 'pants-navy', slot: 'pants', name: 'Navy', color: 0x1d3557, price: 0 },
  { id: 'pants-black', slot: 'pants', name: 'Black', color: 0x222222, price: 15 },
  { id: 'pants-white', slot: 'pants', name: 'White', color: 0xe9ecef, price: 25 },
  { id: 'pants-red', slot: 'pants', name: 'Red', color: 0x9d0208, price: 30 },
  { id: 'pants-green', slot: 'pants', name: 'Forest', color: 0x386641, price: 30 },
  { id: 'pants-jeans', slot: 'pants', name: 'Jeans', color: 0x3d5a80, price: 20 },
  { id: 'pants-khaki', slot: 'pants', name: 'Khaki', color: 0xc2a878, price: 20 },
  { id: 'pants-purple', slot: 'pants', name: 'Purple', color: 0x5a189a, price: 35 },
  { id: 'pants-pink', slot: 'pants', name: 'Pink', color: 0xff70a6, price: 40 },
  { id: 'pants-gold', slot: 'pants', name: 'Gold', color: 0xffc300, price: 250 },
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
  { id: 'skin-zombie', slot: 'skin', name: 'Zombie', color: 0x7bc46a, price: 120 },
  { id: 'skin-ghost', slot: 'skin', name: 'Ghostly', color: 0xeef0ff, price: 160 },
  { id: 'skin-lava', slot: 'skin', name: 'Lava', color: 0xff5a1f, price: 220 },
  { id: 'skin-galaxy', slot: 'skin', name: 'Galaxy', color: 0x3a0ca3, price: 350 },
  // back
  { id: 'back-none', slot: 'back', name: 'Nothing', icon: '🚫', style: null, color: 0, price: 0 },
  { id: 'back-cape-red', slot: 'back', name: 'Red cape', icon: '🦸', style: 'cape', color: 0xd62828, price: 60 },
  { id: 'back-cape-purple', slot: 'back', name: 'Royal cape', icon: '👑', style: 'cape', color: 0x7b2cbf, price: 90 },
  { id: 'back-backpack', slot: 'back', name: 'Backpack', icon: '🎒', style: 'backpack', color: 0xf28c28, price: 50 },
  { id: 'back-shell', slot: 'back', name: 'Turtle shell', icon: '🐢', style: 'shell', color: 0x2e7d32, price: 80 },
  { id: 'back-jetpack', slot: 'back', name: 'Jetpack (looks)', icon: '🚀', style: 'jetpack', color: 0x9aa0a8, price: 150 },
  { id: 'back-wings-white', slot: 'back', name: 'Angel wings', icon: '🕊️', style: 'wings', color: 0xffffff, price: 250 },
  { id: 'back-wings-black', slot: 'back', name: 'Bat wings', icon: '🦇', style: 'wings', color: 0x222222, price: 250 },
  { id: 'back-wings-gold', slot: 'back', name: 'Golden wings', icon: '✨', style: 'wings', color: 0xffc300, price: 600 },
  // pets (float next to you)
  { id: 'pet-none', slot: 'pet', name: 'No pet', icon: '🚫', pet: null, price: 0 },
  { id: 'pet-duck', slot: 'pet', name: 'Duckling', icon: '🐤', pet: '🐤', price: 40 },
  { id: 'pet-cat', slot: 'pet', name: 'Kitty', icon: '🐈', pet: '🐈', price: 80 },
  { id: 'pet-dog', slot: 'pet', name: 'Puppy', icon: '🐕', pet: '🐕', price: 80 },
  { id: 'pet-bunny', slot: 'pet', name: 'Bunny', icon: '🐇', pet: '🐇', price: 90 },
  { id: 'pet-ghost', slot: 'pet', name: 'Ghosty', icon: '👻', pet: '👻', price: 120 },
  { id: 'pet-robot', slot: 'pet', name: 'Robo buddy', icon: '🤖', pet: '🤖', price: 150 },
  { id: 'pet-alien', slot: 'pet', name: 'Alien pal', icon: '👽', pet: '👽', price: 180 },
  { id: 'pet-unicorn', slot: 'pet', name: 'Unicorn', icon: '🦄', pet: '🦄', price: 300 },
  { id: 'pet-dragon', slot: 'pet', name: 'Baby dragon', icon: '🐉', pet: '🐉', price: 500 },
];

export const DEFAULT_EQUIPPED = { hat: 'hat-cap', shirt: 'shirt-green', pants: 'pants-navy', skin: 'skin-2', back: 'back-none', pet: 'pet-none' };
export const HAT_STYLES = ['cap', 'party', 'tophat', 'chef', 'horns', 'propeller', 'crown', 'halo', 'beanie', 'cowboy', 'wizard', 'pirate', 'santa', 'bunny', 'cat', 'headphones', 'flower', 'helmet'];
export const BACK_STYLES = ['cape', 'wings', 'backpack', 'jetpack', 'shell'];
export const PET_ICONS = ['🐤', '🐈', '🐕', '🐇', '👻', '🤖', '👽', '🦄', '🐉'];

export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

export function isOwned(save, item) { return item.price === 0 || save.owned.includes(item.id); }

/** Turns the equipped items into the colours/hat used to build a character. */
export function lookFromSave(save) {
  const eq = { ...DEFAULT_EQUIPPED, ...save.equipped };
  const get = (slot) => {
    const it = itemById(eq[slot]);
    return it && it.slot === slot && isOwned(save, it) ? it : itemById(DEFAULT_EQUIPPED[slot]);
  };
  const hat = get('hat'), back = get('back'), pet = get('pet');
  return {
    skin: get('skin').color, shirt: get('shirt').color, pants: get('pants').color, hat: hat.style ? hat.color : null, hatStyle: hat.style,
    back: back.style, backColor: back.color, pet: pet.pet,
  };
}

/** Online: sanitise a look sent by another player. */
export function cleanLook(l) {
  const num = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
  if (!l || typeof l !== 'object') return null;
  return {
    skin: num(l.skin, 0xffd6a5), shirt: num(l.shirt, 0x22c55e), pants: num(l.pants, 0x1d3557),
    hat: l.hat === null ? null : num(l.hat, 0xffd23f),
    hatStyle: HAT_STYLES.includes(l.hatStyle) ? l.hatStyle : null,
    back: BACK_STYLES.includes(l.back) ? l.back : null, backColor: num(l.backColor, 0xd62828),
    pet: PET_ICONS.includes(l.pet) ? l.pet : null,
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
