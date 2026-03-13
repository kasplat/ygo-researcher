/**
 * Card category definitions and localStorage persistence.
 * A category is a named set of card IDs applied to a deck zone (main/side).
 */

const STORAGE_KEY = 'ygo-card-categories';
const CURRENT_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  {
    id: 'hand-traps',
    name: 'Hand Traps',
    zone: 'main',
    cardIds: [
      '14558127',  // Ash Blossom & Joyous Spring
      '73642296',  // Effect Veiler
      '23434538',  // Ghost Ogre & Snow Rabbit
      '27204311',  // Maxx "C"
      '48905153',  // Nibiru, the Primal Being
      '94145683',  // Droll & Lock Bird
      '24508238',  // D.D. Crow
      '70368879',  // Ghost Mourner & Moonlit Chill
      '59438930',  // Infinite Impermanence
      '32807846',  // Dimension Shifter
      '15693423',  // Bystial Druiswurm
      '33854624',  // Bystial Magnamhut
      '52038441',  // Mulcharmy Fuwalos
      '80225522',  // Mulcharmy Purulia
      '36553319',  // Ghost Belle & Haunted Mansion
      '43898403',  // PSY-Framegear Gamma
      '62015408',  // Contact "C"
    ]
  },
  {
    id: 'go-second-side',
    name: 'Go-Second Side Techs',
    zone: 'side',
    cardIds: [
      '12580477',  // Lightning Storm
      '15693423',  // Evenly Matched
      '18144506',  // Harpie's Feather Duster
      '65681983',  // Dark Ruler No More
      '24299458',  // Forbidden Droplet
      '53129443',  // Lava Golem
      '55063751',  // Gameciel, the Sea Turtle Kaiju
      '99330325',  // Gadarla, the Mystery Dust Kaiju
      '63845230',  // Raigeki
      '82732705',  // Cosmic Cyclone
    ]
  }
];

function buildDefaults() {
  return DEFAULT_CATEGORIES.map(cat => ({
    ...cat,
    cardIds: [...cat.cardIds],
    isDefault: true
  }));
}

export function getCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version === CURRENT_VERSION && Array.isArray(data.categories)) {
        return data.categories;
      }
    }
  } catch (e) {
    // Corrupted data — fall through to defaults
  }
  const defaults = buildDefaults();
  saveCategories(defaults);
  return defaults;
}

export function saveCategories(categories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: CURRENT_VERSION,
    categories
  }));
}

export function resetToDefaults() {
  const defaults = buildDefaults();
  saveCategories(defaults);
  return defaults;
}
