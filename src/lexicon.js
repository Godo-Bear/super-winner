import { resolveWord, normalizeWord, DICTIONARY } from './words.js';
import { hashString } from './utils.js';

/**
 * THE WORD BRAIN
 * --------------
 * Turns (almost) any 1–2 word phrase into a hazard:
 *   1. hand-made dictionary words (words.js)           "meteor", "tsunami"
 *   2. a describing word + a known word                 "giant meteor", "fire chicken", "tiny robots"
 *   3. hundreds of extra words below, each mapped onto a generic hazard
 *      (creatures, falling objects, food, money, vehicles, effects)
 *   4. known words hidden inside a longer word          "megashark", "zombiecat"
 *   5. word endings                                      "...er" / "...man" → a person, "...ball" → giant ball
 *   6. anything else                                     → Mystery Blob (never nothing!)
 *
 * To add a word: put it in one of the lists below. [words, emoji, template, extra settings]
 */

// ---------- templates (generic hazards the words plug into) ----------
const T = {
  // creatures (hazards/creatures.js)
  pet: { hazard: 'creature', body: 'quad', behavior: 'chase', size: 0.8, speed: 5.2, count: 3, damage: 14 },
  beast: { hazard: 'creature', body: 'quad', behavior: 'chase', size: 1.2, speed: 4.6, count: 2, damage: 22 },
  charger: { hazard: 'creature', body: 'quad', behavior: 'charge', size: 1.4, speed: 4.5, count: 2, damage: 28 },
  hopper: { hazard: 'creature', body: 'quad', behavior: 'leap', size: 0.8, speed: 5, count: 3, damage: 18 },
  critter: { hazard: 'creature', body: 'quad', behavior: 'swarm', size: 0.45, speed: 5.8, count: 8, damage: 12 },
  flyer: { hazard: 'creature', body: 'bird', behavior: 'dive', size: 1.1, speed: 6, count: 3, damage: 22 },
  walker: { hazard: 'creature', body: 'bird', behavior: 'chase', size: 0.9, speed: 5, count: 4, damage: 12 },
  bug: { hazard: 'creature', body: 'bug', behavior: 'swarm', size: 0.7, speed: 5.6, count: 9, damage: 10 },
  crawler: { hazard: 'creature', body: 'bug', behavior: 'chase', size: 1.2, speed: 4, count: 3, damage: 18 },
  sea: { hazard: 'creature', body: 'sea', behavior: 'leap', size: 1.2, speed: 5, count: 3, damage: 24 },
  person: { hazard: 'creature', body: 'human', behavior: 'chase', size: 1, speed: 4.8, count: 3, damage: 18 },
  brute: { hazard: 'creature', body: 'human', behavior: 'chase', size: 2.2, speed: 3.4, count: 1, damage: 35 },
  caster: { hazard: 'creature', body: 'human', behavior: 'shoot', size: 1, speed: 4, count: 2, damage: 24 },
  // things that fall (hazards/objects.js)
  thing: { hazard: 'objectrain', size: 1.6, damage: 22, rate: 0.35, total: 26, radius: 1.4, land: 'gone' },
  heavy: { hazard: 'objectrain', size: 2.6, damage: 55, rate: 0.7, total: 12, radius: 2.4, land: 'gone', heavy: true },
  boom: { hazard: 'objectrain', size: 1.6, damage: 30, rate: 0.6, total: 14, radius: 2.8, land: 'gone', heavy: true, explode: true },
  food: { hazard: 'objectrain', size: 1.4, damage: 8, rate: 0.25, total: 34, radius: 1.1, land: 'food' },
  money: { hazard: 'objectrain', size: 1.3, damage: 4, rate: 0.2, total: 40, radius: 1, land: 'coin' },
  love: { hazard: 'objectrain', size: 1.3, damage: 0, rate: 0.25, total: 30, radius: 1, land: 'heart' },
  soft: { hazard: 'objectrain', size: 1.4, damage: 6, rate: 0.25, total: 30, radius: 1.1, land: 'gone' },
  // vehicles
  car: { hazard: 'vehicle', kind: 'car', speed: 24, lanes: 4, damage: 40 },
  // effects (hazards/effects.js) — no extra settings needed
  wind: { hazard: 'wind' }, lowgravity: { hazard: 'lowgravity' }, darkness: { hazard: 'darkness' }, magnet: { hazard: 'magnet' },
  gas: { hazard: 'gas' }, disco: { hazard: 'disco' }, slowmo: { hazard: 'slowmo' }, ufo: { hazard: 'ufo' }, blessing: { hazard: 'blessing' },
  // reuse a hand-made dictionary hazard
};

const brown = 0x8b5a2b, dark = 0x3d2b1f, gray = 0x8d8d99, white = 0xf2f2f2, black = 0x222222, green = 0x4caf50, pink = 0xffa6c9, orange = 0xf28c28;

// [words, emoji, template, extra]
const LEX = [
  // ---------------- pets & farm ----------------
  [['dog', 'puppy', 'doggo', 'hound', 'pup'], '🐕', 'pet', { color: 0xc68642, color2: dark }],
  [['cat', 'kitten', 'kitty', 'kitties'], '🐈', 'pet', { color: orange, color2: 0xffffff, speed: 6 }],
  [['pig', 'piggy', 'hog', 'boar'], '🐖', 'beast', { color: pink, color2: 0xff7aa2 }],
  [['sheep', 'lamb'], '🐑', 'pet', { color: white, color2: black }],
  [['goat'], '🐐', 'charger', { color: white, color2: gray, size: 1 }],
  [['horse', 'pony', 'stallion'], '🐎', 'charger', { color: brown, color2: dark, speed: 6 }],
  [['unicorn'], '🦄', 'charger', { color: white, color2: 0xc77dff, speed: 6 }],
  [['chicken', 'hen', 'chick', 'rooster'], '🐔', 'walker', { color: white, color2: 0xff3b3b }],
  [['duck', 'duckling'], '🦆', 'walker', { color: 0xffe066, color2: 0x3a7d44 }],
  [['goose', 'geese'], '🪿', 'walker', { color: white, color2: gray, damage: 18, speed: 5.6 }],
  [['turkey'], '🦃', 'walker', { color: brown, color2: 0xd62828 }],
  [['penguin'], '🐧', 'walker', { color: black, color2: white }],
  [['ostrich', 'emu'], '🐦', 'walker', { color: dark, color2: pink, speed: 7, size: 1.4, count: 2 }],
  [['flamingo'], '🦩', 'walker', { color: pink, color2: 0xff70a6 }],
  // ---------------- wild animals ----------------
  [['lion', 'lioness'], '🦁', 'charger', { color: 0xd9a441, color2: 0x8b5a2b, mane: true }],
  [['tiger'], '🐅', 'charger', { color: orange, color2: black, speed: 5.5 }],
  [['wolf', 'wolves'], '🐺', 'beast', { color: gray, color2: 0x555555, count: 3, speed: 5.6 }],
  [['fox', 'foxes'], '🦊', 'pet', { color: orange, color2: white }],
  [['bear', 'grizzly'], '🐻', 'beast', { color: brown, color2: dark, size: 1.8, count: 1, damage: 35 }],
  [['polar bear'], '🐻‍❄️', 'beast', { color: white, color2: 0xdddddd, size: 1.8, count: 1, damage: 35 }],
  [['panda'], '🐼', 'beast', { color: white, color2: black, size: 1.5 }],
  [['koala'], '🐨', 'pet', { color: gray, color2: white }],
  [['monkey', 'chimp', 'ape'], '🐒', 'hopper', { color: brown, color2: 0xf1c27d }],
  [['gorilla', 'kong'], '🦍', 'charger', { color: black, color2: gray, size: 2 }],
  [['elephant'], '🐘', 'charger', { color: gray, color2: 0x6d6a75, size: 2.6, count: 1, damage: 40, speed: 3.6 }],
  [['rhino', 'rhinoceros'], '🦏', 'charger', { color: gray, color2: 0x6d6a75, size: 1.8 }],
  [['hippo', 'hippopotamus'], '🦛', 'charger', { color: 0x9a8fa8, color2: pink, size: 2 }],
  [['giraffe'], '🦒', 'beast', { color: 0xf4c542, color2: brown, neck: 1.6 }],
  [['zebra'], '🦓', 'charger', { color: white, color2: black, speed: 6 }],
  [['deer', 'reindeer', 'moose', 'elk'], '🦌', 'charger', { color: brown, color2: 0xd2b48c }],
  [['camel', 'llama', 'alpaca'], '🐪', 'beast', { color: 0xd2b48c, color2: brown, neck: 0.8 }],
  [['kangaroo', 'wallaby'], '🦘', 'hopper', { color: 0xc68642, color2: 0xf1c27d, size: 1.3 }],
  [['frog', 'frogs', 'toad'], '🐸', 'hopper', { color: green, color2: 0x2e7d32, size: 0.7, count: 4 }],
  [['rabbit', 'bunny', 'bunnies', 'hare'], '🐇', 'hopper', { color: white, color2: pink, size: 0.6, count: 5 }],
  [['crocodile', 'alligator', 'croc', 'gator'], '🐊', 'beast', { color: 0x3a7d44, color2: 0x2e5d32, speed: 5.5, damage: 30 }],
  [['lizard', 'gecko', 'iguana', 'chameleon'], '🦎', 'critter', { color: green, color2: 0xffd23f, size: 0.5, count: 6 }],
  [['snake', 'snakes', 'python', 'cobra', 'viper'], '🐍', 'crawler', { color: green, color2: 0xffd23f, count: 4, speed: 5 }],
  [['turtle', 'tortoise'], '🐢', 'beast', { color: 0x2e7d32, color2: 0x8b5a2b, speed: 1.8, count: 4, damage: 10 }],
  [['sloth'], '🦥', 'beast', { color: brown, color2: 0xd2b48c, speed: 1.2, count: 4, damage: 8 }],
  [['hedgehog', 'porcupine'], '🦔', 'critter', { color: brown, color2: dark, damage: 16 }],
  [['skunk'], '🦨', 'gas'],
  // ---------------- tiny critters & bugs ----------------
  [['mouse', 'mice', 'rat', 'rats', 'hamster', 'gerbil'], '🐭', 'critter', { color: gray, color2: pink }],
  [['squirrel', 'chipmunk', 'raccoon'], '🐿️', 'critter', { color: brown, color2: 0xd2b48c, size: 0.55 }],
  [['ant', 'ants', 'termite', 'termites'], '🐜', 'bug', { color: 0x5d2e0f, color2: black, size: 0.5, count: 12 }],
  [['spider', 'spiders', 'tarantula'], '🕷️', 'crawler', { color: black, color2: 0xd62828, count: 4, speed: 5.4 }],
  [['beetle', 'bug', 'bugs', 'cockroach', 'roach', 'ladybug'], '🪲', 'bug', { color: 0x2e2e3a, color2: 0x3fa9ff }],
  [['mosquito', 'mosquitoes', 'fly', 'flies', 'gnat'], '🦟', 'bug', { color: 0x444444, color2: 0x999999, size: 0.45, speed: 6.5 }],
  [['butterfly', 'butterflies', 'moth'], '🦋', 'bug', { color: 0x3fa9ff, color2: 0xffd23f, damage: 3, speed: 4 }],
  [['scorpion'], '🦂', 'crawler', { color: 0xc68642, color2: dark, damage: 24 }],
  [['worm', 'worms', 'caterpillar', 'slug', 'snail'], '🐛', 'crawler', { color: 0x8bc34a, color2: 0xffd23f, speed: 2, count: 6, damage: 8 }],
  // ---------------- birds that dive ----------------
  [['eagle', 'hawk', 'falcon', 'vulture', 'condor'], '🦅', 'flyer', { color: brown, color2: white }],
  [['bat', 'bats'], '🦇', 'flyer', { color: black, color2: 0x444444, size: 0.7, count: 5, damage: 14 }],
  [['owl'], '🦉', 'flyer', { color: brown, color2: 0xd2b48c }],
  [['crow', 'raven', 'pigeon', 'pigeons', 'seagull', 'bird', 'birds'], '🐦‍⬛', 'flyer', { color: 0x333333, color2: 0x555555, size: 0.7, count: 5, damage: 12 }],
  [['parrot', 'parrots'], '🦜', 'flyer', { color: 0xd62828, color2: 0x3ddc84, size: 0.8, count: 4 }],
  [['pterodactyl', 'pteranodon'], '🦖', 'flyer', { color: 0x6b8e23, color2: 0x556b2f, size: 1.8, count: 2, damage: 30 }],
  // ---------------- sea creatures ----------------
  [['whale', 'whales', 'orca', 'killer whale'], '🐋', 'sea', { color: 0x3a6ea5, color2: white, size: 2.8, count: 1, damage: 50 }],
  [['dolphin', 'dolphins'], '🐬', 'sea', { color: 0x7fb3d5, color2: white }],
  [['octopus', 'squid', 'kraken'], '🐙', 'sea', { color: 0xc0392b, color2: 0xff8fa3, size: 1.5 }],
  [['fish', 'fishes', 'salmon', 'tuna', 'goldfish', 'cod'], '🐟', 'sea', { color: 0x3fa9ff, color2: 0xffd23f, size: 0.8, count: 5, damage: 14 }],
  [['piranha', 'piranhas'], '🐠', 'sea', { color: 0xd62828, color2: gray, size: 0.6, count: 7, damage: 12 }],
  [['jellyfish', 'jelly'], '🪼', 'sea', { color: 0xc77dff, color2: pink, size: 1, damage: 20 }],
  [['crab', 'crabs', 'lobster'], '🦀', 'crawler', { color: 0xd62828, color2: 0xff8a65, count: 4 }],
  [['seal', 'walrus', 'sea lion'], '🦭', 'sea', { color: gray, color2: 0x6d6a75, size: 1.4 }],
  [['eel', 'eels'], '🐍', 'sea', { color: 0x556b2f, color2: 0x8bc34a, size: 0.9, count: 4 }],
  // ---------------- people ----------------
  [['pirate', 'pirates'], '🏴‍☠️', 'person', { color: 0x7b1e1e, color2: black, hat: black, hatStyle: 'tophat' }],
  [['ninja', 'ninjas'], '🥷', 'person', { color: black, color2: black, speed: 6.4, hat: black, hatStyle: 'cap' }],
  [['knight', 'knights'], '🛡️', 'person', { color: gray, color2: gray, skin: 0xb0b0b8, hat: gray, hatStyle: 'cap', damage: 24 }],
  [['clown', 'clowns'], '🤡', 'person', { color: 0xff3b4f, color2: 0xffd23f, hat: 0x3fa9ff, hatStyle: 'party' }],
  [['cowboy', 'cowgirl', 'sheriff'], '🤠', 'caster', { color: 0xc68642, color2: 0x1d3557, hat: brown, hatStyle: 'tophat', shot: 0xffe066 }],
  [['police', 'cop', 'cops', 'policeman', 'officer'], '👮', 'person', { color: 0x1d3557, color2: 0x1d3557, hat: 0x1d3557, speed: 5.6 }],
  [['teacher', 'teachers', 'principal'], '🧑‍🏫', 'caster', { color: 0x6a4c93, color2: 0x333333, shot: 0xffffff }],
  [['grandma', 'granny', 'grandmother', 'nana'], '👵', 'person', { color: 0xc77dff, color2: 0x8d6e63, hair: 0xdddddd, speed: 4 }],
  [['grandpa', 'grandfather', 'old man'], '👴', 'person', { color: 0x795548, color2: 0x5d4037, hair: 0xdddddd, speed: 3.8 }],
  [['mom', 'mum', 'mother', 'dad', 'father', 'parents'], '🧑', 'person', { color: 0x3fa9ff, color2: 0x1d3557 }],
  [['baby', 'babies', 'toddler', 'kid', 'kids', 'child', 'children'], '👶', 'person', { color: 0xa0e7e5, color2: white, size: 0.6, count: 5, damage: 8, speed: 4.2 }],
  [['chef', 'cook'], '👨‍🍳', 'caster', { color: white, color2: 0x333333, hat: white, hatStyle: 'chef', shot: 0xffa31a }],
  [['doctor', 'nurse', 'surgeon'], '🧑‍⚕️', 'caster', { color: white, color2: 0x8fd3ff, shot: 0x3ddc84, damage: 16 }],
  [['king', 'kings'], '🤴', 'person', { color: 0x8338ec, color2: 0xffd23f, hat: 0xffc300, hatStyle: 'crown' }],
  [['queen', 'princess', 'prince'], '👸', 'caster', { color: pink, color2: 0xffd23f, hat: 0xffc300, hatStyle: 'crown', shot: 0xff70a6 }],
  [['vampire', 'dracula', 'vampires'], '🧛', 'person', { color: black, color2: 0x7b1e1e, skin: 0xdcdcdc, speed: 6.2, damage: 22 }],
  [['mummy', 'mummies'], '🧟', 'person', { color: 0xe8dcc4, color2: 0xe8dcc4, skin: 0xe8dcc4, hair: null, speed: 3, zombieArms: true }],
  [['skeleton', 'skeletons', 'skull'], '💀', 'person', { color: white, color2: white, skin: white, hair: null, speed: 5 }],
  [['werewolf', 'wolfman'], '🐺', 'person', { color: 0x5d4037, color2: 0x3e2723, skin: 0x795548, speed: 6.4, damage: 26 }],
  [['caveman', 'cavemen'], '🦴', 'person', { color: 0xc68642, color2: 0x8b5a2b, hair: dark }],
  [['viking', 'vikings', 'barbarian'], '🪓', 'person', { color: 0x795548, color2: 0x3e2723, hat: gray, hatStyle: 'horns', damage: 24 }],
  [['farmer', 'farmers'], '👨‍🌾', 'person', { color: 0x3fa9ff, color2: 0x1d3557, hat: 0xffd23f, hatStyle: 'cap' }],
  [['mailman', 'postman', 'delivery'], '📬', 'caster', { color: 0x3a86ff, color2: 0x1d3557, hat: 0x3a86ff, shot: 0xd2b48c }],
  [['santa', 'santa claus'], '🎅', 'caster', { color: 0xd62828, color2: 0xd62828, hat: 0xd62828, hatStyle: 'party', hair: white, shot: 0x3ddc84 }],
  [['elf', 'elves', 'gnome', 'gnomes'], '🧝', 'person', { color: 0x3ddc84, color2: 0xd62828, hat: 0x3ddc84, hatStyle: 'party', size: 0.7, count: 4 }],
  [['troll', 'trolls', 'ogre', 'ogres'], '🧌', 'brute', { color: 0x6b8e23, color2: 0x5d4037, skin: 0x7c9a3a }],
  [['goblin', 'goblins', 'imp', 'imps'], '👺', 'person', { color: 0x556b2f, color2: 0x3e2723, skin: 0x8bc34a, size: 0.75, count: 4, speed: 5.8 }],
  [['orc', 'orcs'], '👹', 'person', { color: 0x3e2723, color2: black, skin: 0x6b8e23, size: 1.3, damage: 26 }],
  [['yeti', 'bigfoot', 'sasquatch', 'abominable snowman'], '🦶', 'brute', { color: white, color2: white, skin: 0xdddddd, hair: white }],
  [['monster', 'monsters', 'beast', 'creature'], '👾', 'brute', { color: 0x6a4c93, color2: 0x3ddc84, skin: 0x9b5de5 }],
  [['thief', 'robber', 'burglar', 'bandit', 'bandits'], '🦹', 'person', { color: black, color2: 0x333333, speed: 6.5, damage: 14 }],
  [['boxer', 'wrestler', 'fighter', 'karate'], '🥊', 'person', { color: 0xd62828, color2: 0xffffff, damage: 28 }],
  [['sumo'], '🤼', 'brute', { color: 0xf1c27d, color2: 0xffffff, size: 2 }],
  [['wizard', 'wizards', 'sorcerer', 'mage', 'magician'], '🧙', 'caster', { color: 0x3a0ca3, color2: 0x3a0ca3, hat: 0x3a0ca3, hatStyle: 'party', hair: white, shot: 0xc77dff }],
  [['witch', 'witches'], '🧙‍♀️', 'caster', { color: black, color2: 0x6a4c93, hat: black, hatStyle: 'party', skin: 0x9be564, shot: 0x3ddc84 }],
  [['alien', 'aliens', 'martian'], '👽', 'caster', { color: 0x9be564, color2: 0x6a4c93, skin: 0x9be564, hair: null, shot: 0x3ddc84 }],
  [['robot', 'robots', 'cyborg', 'android', 'terminator'], '🤖', 'caster', { color: gray, color2: 0x555555, skin: 0xb0b0b8, hair: null, shot: 0xff3b4f }],
  [['soldier', 'soldiers', 'army', 'sniper', 'archer', 'archers'], '🎖️', 'caster', { color: 0x556b2f, color2: 0x3e4a2b, hat: 0x556b2f, shot: 0xffe066 }],
  [['scientist', 'scientists', 'professor'], '🧪', 'caster', { color: white, color2: 0x333333, shot: 0x3ddc84 }],
  [['astronaut', 'astronauts', 'spaceman'], '🧑‍🚀', 'caster', { color: white, color2: white, hat: white, hatStyle: 'cap', shot: 0x7fd4ff }],
  [['snowman', 'snowmen'], '⛄', 'caster', { color: white, color2: white, skin: white, hat: black, hatStyle: 'tophat', shot: white }],
  [['cupid'], '💘', 'caster', { color: pink, color2: white, size: 0.8, shot: 0xff70a6, damage: 12 }],
  [['superhero', 'hero', 'batman', 'superman'], '🦸', 'person', { color: 0x3a86ff, color2: 0xd62828, speed: 6.8, damage: 24 }],
  [['villain', 'supervillain'], '🦹', 'caster', { color: 0x6a4c93, color2: black, shot: 0xd62828 }],
  // ---------------- things that fall ----------------
  [['piano', 'pianos'], '🎹', 'heavy'],
  [['anvil', 'anvils', 'weight'], '🏋️', 'heavy'],
  [['rock', 'rocks', 'stone', 'stones', 'pebble'], '🪨', 'thing', { damage: 28 }],
  [['brick', 'bricks'], '🧱', 'thing', { damage: 26 }],
  [['tree', 'trees', 'log', 'logs'], '🌳', 'heavy', { total: 10 }],
  [['cactus', 'cacti'], '🌵', 'thing', { damage: 26 }],
  [['toilet', 'toilets'], '🚽', 'heavy', { damage: 40 }],
  [['chair', 'chairs', 'bench'], '🪑', 'thing'],
  [['couch', 'sofa', 'bed'], '🛋️', 'heavy', { damage: 40 }],
  [['tv', 'television', 'computer', 'laptop'], '📺', 'thing', { damage: 26 }],
  [['phone', 'phones', 'iphone', 'tablet'], '📱', 'thing', { damage: 15, size: 1.2 }],
  [['book', 'books', 'dictionary', 'homework'], '📚', 'thing', { damage: 15 }],
  [['pencil', 'pencils', 'pen', 'crayon', 'crayons'], '✏️', 'thing', { damage: 15, size: 1.2 }],
  [['sock', 'socks'], '🧦', 'soft'],
  [['shoe', 'shoes', 'boot', 'boots', 'sneaker'], '👟', 'thing', { damage: 15 }],
  [['lamp', 'lightbulb', 'bulb'], '💡', 'thing'],
  [['clock', 'clocks', 'alarm'], '⏰', 'thing'],
  [['bell', 'bells'], '🔔', 'thing'],
  [['gift', 'gifts', 'present', 'presents', 'christmas'], '🎁', 'food', { damage: 10 }],
  [['balloon', 'balloons'], '🎈', 'soft', { damage: 0 }],
  [['basketball', 'football', 'soccer', 'baseball', 'tennis', 'volleyball'], '🏀', 'thing', { damage: 18 }],
  [['bowling', 'bowling ball'], '🎳', 'heavy'],
  [['dice', 'die'], '🎲', 'thing'],
  [['key', 'keys'], '🔑', 'thing', { damage: 15, size: 1.1 }],
  [['umbrella', 'umbrellas'], '☂️', 'thing'],
  [['sword', 'swords', 'dagger'], '🗡️', 'thing', { damage: 32 }],
  [['axe', 'hammer', 'hammers', 'wrench', 'tool', 'tools'], '🔨', 'thing', { damage: 28 }],
  [['dynamite', 'tnt', 'grenade', 'explosion', 'explosive'], '🧨', 'boom'],
  [['firework', 'fireworks'], '🎆', 'boom', { damage: 20 }],
  [['printer', 'printers', 'microwave', 'oven', 'washing machine'], '🖨️', 'heavy', { damage: 40 }],
  [['toaster', 'toasters'], '🍞', 'thing', { damage: 24 }],
  [['fridge', 'fridges', 'refrigerator', 'freezer'], '🧊', 'heavy', { damage: 40 }],
  [['trash', 'garbage', 'rubbish', 'bin', 'trashcan'], '🗑️', 'thing'],
  [['poop', 'poo', 'dung'], '💩', 'soft', { damage: 10 }],
  [['star', 'stars', 'shooting star'], '⭐', 'boom', { damage: 26 }],
  [['snowball', 'snowballs', 'hail'], '❄️', 'thing', { damage: 15 }],
  [['coconut', 'coconuts'], '🥥', 'thing', { damage: 26 }],
  [['anchor', 'anchors'], '⚓', 'heavy'],
  [['skateboard', 'scooter'], '🛹', 'thing'],
  [['guitar', 'drum', 'drums', 'trumpet', 'violin'], '🎸', 'thing'],
  [['crown', 'crowns', 'trophy', 'trophies'], '🏆', 'money', { total: 20 }],
  [['tooth', 'teeth'], '🦷', 'thing', { damage: 15 }],
  [['flower', 'flowers', 'rose', 'roses', 'tulip'], '🌸', 'love'],
  [['mushroom', 'mushrooms'], '🍄', 'food'],
  // ---------------- food (rains, then you can eat it) ----------------
  [['pizza', 'pizzas'], '🍕', 'food'], [['burger', 'burgers', 'hamburger', 'cheeseburger'], '🍔', 'food'],
  [['hotdog', 'hot dog', 'hotdogs', 'sausage'], '🌭', 'food'], [['fries', 'chips', 'french fries'], '🍟', 'food'],
  [['cake', 'cakes', 'birthday'], '🎂', 'food'], [['cupcake', 'cupcakes', 'muffin', 'muffins'], '🧁', 'food'],
  [['cookie', 'cookies', 'biscuit'], '🍪', 'food'], [['donut', 'donuts', 'doughnut'], '🍩', 'food'],
  [['ice cream', 'icecream', 'gelato'], '🍦', 'food'], [['candy', 'sweets', 'lollipop', 'gummy'], '🍭', 'food'],
  [['chocolate', 'chocolates'], '🍫', 'food'], [['apple', 'apples'], '🍎', 'food'], [['orange', 'oranges'], '🍊', 'food'],
  [['watermelon', 'watermelons', 'melon'], '🍉', 'food', { damage: 20, size: 1.8 }], [['grape', 'grapes'], '🍇', 'food'],
  [['strawberry', 'strawberries', 'berry', 'berries'], '🍓', 'food'], [['cherry', 'cherries'], '🍒', 'food'],
  [['pineapple', 'pineapples'], '🍍', 'food', { damage: 16 }], [['carrot', 'carrots', 'vegetable', 'vegetables'], '🥕', 'food'],
  [['broccoli'], '🥦', 'food'], [['corn', 'popcorn'], '🍿', 'food'], [['potato', 'potatoes'], '🥔', 'food'],
  [['cheese'], '🧀', 'food'], [['bread', 'toast', 'baguette'], '🍞', 'food'], [['egg', 'eggs'], '🥚', 'food'],
  [['bacon'], '🥓', 'food'], [['sandwich', 'sandwiches'], '🥪', 'food'], [['spaghetti', 'pasta', 'noodle', 'noodles', 'ramen'], '🍝', 'food'],
  [['sushi'], '🍣', 'food'], [['pancake', 'pancakes'], '🥞', 'food'], [['waffle', 'waffles'], '🧇', 'food'],
  [['milk'], '🥛', 'food'], [['juice', 'soda', 'cola', 'pop'], '🥤', 'food'], [['coffee', 'tea'], '☕', 'food'],
  [['pickle', 'pickles', 'cucumber'], '🥒', 'food'], [['pie', 'pies'], '🥧', 'food'], [['steak', 'meat', 'ham'], '🍖', 'food'],
  [['honey'], '🍯', 'food'], [['salad'], '🥗', 'food'], [['soup', 'stew'], '🍲', 'food'], [['lemon', 'lemons', 'lime'], '🍋', 'food'],
  [['peach', 'peaches', 'pear'], '🍑', 'food'], [['nugget', 'nuggets', 'chicken nugget'], '🍗', 'food'], [['jelly bean', 'jellybean', 'marshmallow'], '🍬', 'food'],
  // ---------------- money & love ----------------
  [['money', 'cash', 'coin', 'coins', 'dollar', 'dollars', 'rich', 'robux', 'gold'], '🪙', 'money'],
  [['treasure', 'diamond', 'diamonds', 'gem', 'gems', 'jewel', 'jewels', 'emerald', 'ruby'], '💎', 'money'],
  [['love', 'heart', 'hearts', 'hug', 'hugs', 'kiss', 'valentine', 'friend', 'friends', 'friendship', 'kindness'], '💖', 'love'],
  // ---------------- vehicles ----------------
  [['car', 'cars', 'racecar', 'race car', 'sports car'], '🏎️', 'car', { color: 0xd62828 }],
  [['taxi', 'cab'], '🚕', 'car', { color: 0xffd23f }],
  [['police car'], '🚓', 'car', { color: 0x1d3557 }],
  [['truck', 'trucks', 'lorry', 'monster truck'], '🚚', 'car', { kind: 'truck', color: 0x3a86ff, speed: 20, damage: 45 }],
  [['firetruck', 'fire truck', 'fire engine'], '🚒', 'car', { kind: 'truck', color: 0xd62828 }],
  [['ambulance'], '🚑', 'car', { kind: 'truck', color: white }],
  [['bus', 'buses', 'school bus'], '🚌', 'car', { kind: 'bus', color: 0xffc300, speed: 18, damage: 45 }],
  [['train', 'trains', 'subway', 'locomotive'], '🚂', 'car', { kind: 'train', color: 0x2b2d42, speed: 26, lanes: 3, damage: 55 }],
  [['tank', 'tanks'], '🪖', 'car', { kind: 'tank', color: 0x556b2f, speed: 12, damage: 50 }],
  [['tractor', 'lawnmower', 'bulldozer'], '🚜', 'car', { kind: 'truck', color: 0x3ddc84, speed: 12 }],
  [['motorcycle', 'motorbike', 'bike', 'bicycle', 'moped'], '🏍️', 'car', { kind: 'bike', color: black, speed: 26, lanes: 6, damage: 30 }],
  [['van', 'jeep', 'suv', 'limo', 'limousine'], '🚐', 'car', { kind: 'truck', color: white }],
  // ---------------- effects ----------------
  [['wind', 'windy', 'gust', 'breeze', 'fan', 'gale'], '💨', 'wind'],
  [['gravity', 'moon', 'space', 'zero gravity', 'float', 'floaty', 'planet'], '🌙', 'lowgravity'],
  [['dark', 'darkness', 'night', 'midnight', 'blackout', 'shadow', 'shadows'], '🌑', 'darkness'],
  [['magnet', 'magnets', 'magnetic'], '🧲', 'magnet'],
  [['poison', 'gas', 'toxic', 'fart', 'farts', 'stink', 'stinky', 'smoke', 'smog', 'germs', 'virus'], '☠️', 'gas'],
  [['party', 'disco', 'dance', 'dancing', 'music', 'song', 'rave', 'concert', 'rainbow'], '🪩', 'disco'],
  [['slow', 'slowmo', 'slow motion', 'time', 'sleep', 'sleepy', 'lazy', 'tired', 'boring'], '🐌', 'slowmo'],
  [['ufo', 'ufos', 'spaceship', 'flying saucer', 'abduction'], '🛸', 'ufo'],
  // only helps the Writer
  [['god', 'gods', 'goddess', 'angel', 'angels', 'immortal', 'invincible', 'superpower', 'superpowers', 'blessing', 'blessed', 'miracle', 'holy', 'heaven', 'divine', 'godmode', 'god mode'], '😇', 'blessing'],
];

// ---------- describing words (first word of a 2-word phrase) ----------
const MODS = {
  giant: { size: 1.8, count: 0.5, damage: 1.5, speed: 0.85 }, huge: 'giant', big: 'giant', mega: 'giant', massive: 'giant', enormous: 'giant', jumbo: 'giant', king: 'giant',
  tiny: { size: 0.55, count: 2.2, damage: 0.6 }, mini: 'tiny', baby: 'tiny', little: 'tiny', small: 'tiny', micro: 'tiny',
  fire: { fire: true, damage: 1.25, color: 0xff5a1f }, flaming: 'fire', fiery: 'fire', burning: 'fire', lava: 'fire', hot: 'fire', spicy: 'fire', fire_: 'fire',
  ice: { speed: 0.8, color: 0xa8e0ff }, frozen: 'ice', icy: 'ice', snow: 'ice', cold: 'ice',
  fast: { speed: 1.5 }, speedy: 'fast', turbo: 'fast', quick: 'fast', super: { speed: 1.3, damage: 1.3 }, ultra: 'super', hyper: 'super',
  angry: { damage: 1.4, speed: 1.15 }, evil: 'angry', mad: 'angry', killer: 'angry', scary: 'angry', crazy: 'angry', zombie: { color: 0x7bc46a, speed: 0.75, damage: 1.2 },
  cute: { damage: 0.4 }, friendly: 'cute', nice: 'cute', happy: 'cute', fluffy: 'cute', silly: 'cute',
  golden: { color: 0xffc300, golden: true }, gold: 'golden', shiny: 'golden',
  many: { count: 2 }, lots: 'many', double: 'many', two: 'many', three: { count: 3 }, million: { count: 3 }, army: 'many',
  robot: { color: 0x9aa0a8 }, mecha: 'robot', metal: 'robot', ghost: { color: 0xeeeeff, speed: 1.1 }, invisible: 'ghost', rainbow: { color: 0xc77dff }, flying: { flying: true },
  red: { color: 0xd62828 }, blue: { color: 0x3a86ff }, green: { color: 0x3ddc84 }, yellow: { color: 0xffd23f }, purple: { color: 0x8338ec },
  pink: { color: 0xff70a6 }, orange: { color: 0xf28c28 }, black: { color: 0x222222 }, white: { color: 0xf2f2f2 },
};
const modFor = (w) => { let m = MODS[w]; if (typeof m === 'string') m = MODS[m]; return m || null; };

// ---------- lookup tables ----------
const LOOKUP = new Map();
for (const [words, icon, tmpl, extra] of LEX) for (const w of words) LOOKUP.set(w, { icon, tmpl, extra: extra || {}, name: words[0] });
const DICT_KEYS = [];
for (const e of DICTIONARY) for (const f of [e.id, e.name.toLowerCase(), ...e.aliases]) DICT_KEYS.push(f.replace(/ /g, ''));
const LEX_KEYS = [...LOOKUP.keys()].filter((k) => !k.includes(' '));

const UPPER = new Set(['ufo', 'ufos', 'tv', 'tnt', 'suv']);
const cap = (s) => s.split(' ').map((w) => (UPPER.has(w) ? w.toUpperCase() : w.replace(/^\w/, (c) => c.toUpperCase()))).join(' ');

function singular(w) {
  if (LOOKUP.has(w)) return w;
  if (w.endsWith('ies') && LOOKUP.has(w.slice(0, -3) + 'y')) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && LOOKUP.has(w.slice(0, -2))) return w.slice(0, -2);
  if (w.endsWith('s') && LOOKUP.has(w.slice(0, -1))) return w.slice(0, -1);
  return null;
}

function buildSpec(hit, label, mod) {
  const spec = { ...T[hit.tmpl], ...hit.extra, icon: hit.icon, label };
  if (mod) applyMod(spec, mod);
  return spec;
}

function applyMod(spec, mod) {
  if (mod.size) spec.size = (spec.size ?? 1) * mod.size;
  if (mod.count) {
    if (spec.count) spec.count = Math.max(1, Math.min(10, Math.round(spec.count * mod.count)));
    if (spec.total) spec.total = Math.round(spec.total * Math.max(1, mod.count));
    if (spec.lanes) spec.lanes = Math.min(8, Math.round(spec.lanes * Math.max(1, mod.count)));
  }
  if (mod.damage && spec.damage !== undefined) spec.damage = Math.round(spec.damage * mod.damage);
  if (mod.speed && spec.speed) spec.speed *= mod.speed;
  if (mod.color !== undefined) { spec.color = mod.color; if (spec.body === 'human') spec.color2 = mod.color; }
  if (mod.fire) spec.fire = true;
  if (mod.flying && spec.hazard === 'creature') { spec.behavior = 'dive'; }
  if (mod.golden && spec.hazard === 'objectrain') spec.land = 'coin';
  if (mod.size && spec.hazard === 'objectrain') { spec.radius = (spec.radius ?? 1.4) * Math.sqrt(mod.size); if (mod.size > 1) spec.heavy = true; }
  return spec;
}

/** Hazard spec for a template-only word (effects). */
function fromHit(hit, label, mod) {
  return { hazard: T[hit.tmpl].hazard, spec: buildSpec(hit, label, mod), label, icon: hit.icon };
}

/**
 * Interpret a typed phrase. Returns one of:
 *   { entry, label }                       a dictionary hazard (maybe with a describing word in the label)
 *   { hazard, spec, label, icon }          a generic hazard built from the word
 *   null                                   unknown → Mystery Blob
 */
export function interpret(raw) {
  const phrase = normalizeWord(raw);
  if (!phrase) return null;
  const words = phrase.split(' ').slice(-2);
  const full = words.join(' ');
  const label = cap(full);

  // 1. hand-made dictionary word
  const entry = resolveWord(full);
  if (entry) return { entry, label: entry.name };

  // 2. whole phrase in the lexicon ("police car", "ice cream")
  const whole = LOOKUP.get(full) || LOOKUP.get(full.replace(/ /g, ''));
  if (whole) return fromHit(whole, label, null);

  // 3. describing word + noun
  let mod = null, noun = full;
  if (words.length === 2 && modFor(words[0])) { mod = modFor(words[0]); noun = words[1]; }
  const nounEntry = resolveWord(noun);
  if (nounEntry && mod) return { entry: nounEntry, label };
  const s = singular(noun);
  if (s) return fromHit(LOOKUP.get(s), label, mod);

  // 4. a known word hidden inside ("megashark", "zombiecat", "cheesestorm")
  const squashed = noun.replace(/ /g, '');
  let best = null;
  for (const k of LEX_KEYS) if (k.length >= 4 && squashed.includes(k) && (!best || k.length > best.length)) best = k;
  let bestDict = null;
  for (const k of DICT_KEYS) if (k.length >= 4 && squashed.includes(k) && (!bestDict || k.length > bestDict.length)) bestDict = k;
  if (bestDict && (!best || bestDict.length >= best.length)) return { entry: resolveWord(bestDict), label };
  if (best) {
    // prefixes like "mega"/"baby" inside the word still count
    const pre = squashed.slice(0, squashed.indexOf(best));
    return fromHit(LOOKUP.get(best), label, mod || modFor(pre));
  }

  // 5. word endings
  const h = hashString(squashed);
  if (/(er|or|ist|ian|man|men|woman|guy|girl|boy|lady|kid|bot)$/.test(squashed) && squashed.length > 3) {
    const shirts = [0xff595e, 0x3a86ff, 0x8ac926, 0x6a4c93, 0xff924c, 0xf15bb5];
    const hit = { icon: squashed.endsWith('bot') ? '🤖' : '🧑', tmpl: h % 3 === 0 ? 'caster' : 'person', extra: { color: shirts[h % shirts.length], color2: 0x1d3557 } };
    return fromHit(hit, label, mod);
  }
  if (/(ball|balls)$/.test(squashed)) return { entry: resolveWord('giant ball'), label };
  if (/(storm|rain|shower)$/.test(squashed)) return { entry: resolveWord('lightning'), label };
  if (/(saurus|zilla|raptor)$/.test(squashed)) return fromHit({ icon: '🦖', tmpl: 'charger', extra: { color: 0x4f8a3c, color2: 0x9ccc65, size: 2.6, count: 1, damage: 40 } }, label, mod);
  if (/(fish|shark|whale)$/.test(squashed)) return fromHit(LOOKUP.get('fish'), label, mod);
  if (/(bird|hawk|fly)$/.test(squashed)) return fromHit(LOOKUP.get('bird'), label, mod);
  if (/(cake|pie|bread|burger|cookie|candy)$/.test(squashed)) return fromHit(LOOKUP.get('cake'), label, mod);
  return null;
}

/** Short description for the writer box chips. */
export function describe(raw) {
  const r = interpret(raw);
  if (!r) return null;
  if (r.entry) return { icon: r.entry.icon, label: r.label };
  return { icon: r.icon, label: r.label };
}

/** Autocomplete from the extra words. */
export function suggestExtra(prefix, n = 6) {
  const p = normalizeWord(prefix);
  if (!p) return [];
  const out = [];
  const seen = new Set();
  for (const [k, v] of LOOKUP) {
    if (out.length >= n) break;
    if (!k.startsWith(p) || seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({ fill: k, icon: v.icon });
  }
  return out;
}

/** A random extra word for bots ("giant chicken", "pizza", "ninja"...). */
export function randomSmartWord() {
  const [words] = LEX[Math.floor(Math.random() * LEX.length)];
  const w = words[0];
  if (Math.random() < 0.25) {
    const mods = ['giant', 'tiny', 'fire', 'angry', 'golden', 'fast', 'baby', 'mega', 'ice', 'cute'];
    return `${mods[Math.floor(Math.random() * mods.length)]} ${w}`;
  }
  return w;
}

export const EXTRA_WORD_COUNT = LOOKUP.size;
