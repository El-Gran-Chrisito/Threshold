/**
 * Furniture and fixture catalog. Dimensions are cm (width × depth × height).
 * `shape` selects the procedural 3D model and the plan symbol; many entries
 * share a shape at different sizes. Prices are rough US retail estimates.
 */

export type Category =
  | 'Living'
  | 'Bedroom'
  | 'Dining'
  | 'Kitchen'
  | 'Bath'
  | 'Office'
  | 'Laundry'
  | 'Lighting'
  | 'Electrical'
  | 'Decor'
  | 'Outdoor'
  | 'Structure'

export const CATEGORIES: Category[] = [
  'Living',
  'Bedroom',
  'Dining',
  'Kitchen',
  'Bath',
  'Office',
  'Laundry',
  'Lighting',
  'Electrical',
  'Decor',
  'Outdoor',
  'Structure',
]

export type Mount = 'floor' | 'wall' | 'ceiling'

export interface CatalogEntry {
  id: string
  name: string
  category: Category
  shape: string
  w: number
  d: number
  h: number
  elevation?: number
  mount?: Mount
  color: string
  color2: string
  price: number
  /** Height follows the level's ceiling height on placement (stairs, columns). */
  fitHeight?: boolean
  keywords?: string
}

const OAK = '#C29A6B'
const WALNUT = '#6A4630'
const LINEN = '#D9CFBE'
const CHARCOAL = '#4D5055'
const WHITE = '#F1F0EC'
const BLACK = '#2A2B2D'
const STEEL = '#A8ABAD'
const PORCELAIN = '#F7F7F5'
const STONE = '#E4E1DA'

export const CATALOG: CatalogEntry[] = [
  // Living
  { id: 'sofa-3', name: 'Sofa, 3-seat', category: 'Living', shape: 'sofa', w: 213, d: 92, h: 84, color: LINEN, color2: WALNUT, price: 1400, keywords: 'couch' },
  { id: 'sofa-2', name: 'Loveseat', category: 'Living', shape: 'sofa', w: 160, d: 90, h: 84, color: LINEN, color2: WALNUT, price: 1000, keywords: 'couch' },
  { id: 'sectional', name: 'Sectional sofa', category: 'Living', shape: 'sectional', w: 290, d: 210, h: 84, color: CHARCOAL, color2: BLACK, price: 2600, keywords: 'couch l-shape' },
  { id: 'armchair', name: 'Armchair', category: 'Living', shape: 'armchair', w: 86, d: 86, h: 84, color: '#8A5A36', color2: WALNUT, price: 700, keywords: 'chair' },
  { id: 'ottoman', name: 'Ottoman', category: 'Living', shape: 'ottoman', w: 80, d: 80, h: 42, color: LINEN, color2: WALNUT, price: 300 },
  { id: 'coffee-table', name: 'Coffee table', category: 'Living', shape: 'table-low', w: 120, d: 60, h: 44, color: OAK, color2: OAK, price: 400 },
  { id: 'side-table', name: 'Side table', category: 'Living', shape: 'side-table', w: 50, d: 50, h: 55, color: OAK, color2: BLACK, price: 150, keywords: 'end table' },
  { id: 'tv-stand', name: 'Media console', category: 'Living', shape: 'cabinet-low', w: 180, d: 45, h: 55, color: WALNUT, color2: BLACK, price: 500, keywords: 'tv stand' },
  { id: 'tv', name: 'TV, 65"', category: 'Living', shape: 'tv', w: 145, d: 8, h: 84, elevation: 55, color: BLACK, color2: '#111315', price: 800, keywords: 'television screen' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Living', shape: 'bookshelf', w: 90, d: 35, h: 200, color: OAK, color2: '#7E5E44', price: 350, keywords: 'shelves books' },
  { id: 'rug', name: 'Area rug 8×5.5', category: 'Living', shape: 'rug', w: 244, d: 168, h: 1, color: '#B9A58C', color2: '#8E7B63', price: 400, keywords: 'carpet' },
  { id: 'rug-large', name: 'Area rug 10×8', category: 'Living', shape: 'rug', w: 305, d: 244, h: 1, color: '#9DA6A9', color2: '#6F787B', price: 700, keywords: 'carpet' },
  { id: 'bench', name: 'Bench', category: 'Living', shape: 'bench', w: 150, d: 42, h: 46, color: '#8C6A4E', color2: '#2A2B2D', price: 250, keywords: 'entry seat' },
  { id: 'console', name: 'Console table', category: 'Living', shape: 'table', w: 120, d: 35, h: 78, color: '#6A4630', color2: '#2A2B2D', price: 300, keywords: 'entry hall' },
  { id: 'fireplace', name: 'Fireplace', category: 'Living', shape: 'fireplace', w: 150, d: 45, h: 110, color: STONE, color2: '#222', price: 3000 },
  { id: 'piano', name: 'Upright piano', category: 'Living', shape: 'piano', w: 150, d: 60, h: 125, color: '#1D1C1B', color2: WHITE, price: 4000 },

  // Bedroom
  { id: 'bed-king', name: 'Bed, king', category: 'Bedroom', shape: 'bed', w: 193, d: 213, h: 105, color: WHITE, color2: OAK, price: 1800 },
  { id: 'bed-queen', name: 'Bed, queen', category: 'Bedroom', shape: 'bed', w: 152, d: 203, h: 100, color: WHITE, color2: OAK, price: 1300 },
  { id: 'bed-full', name: 'Bed, full', category: 'Bedroom', shape: 'bed', w: 137, d: 191, h: 95, color: WHITE, color2: WALNUT, price: 900, keywords: 'double' },
  { id: 'bed-twin', name: 'Bed, twin', category: 'Bedroom', shape: 'bed', w: 97, d: 191, h: 90, color: WHITE, color2: OAK, price: 600, keywords: 'single' },
  { id: 'bunk-bed', name: 'Bunk bed', category: 'Bedroom', shape: 'bunk', w: 105, d: 200, h: 165, color: WHITE, color2: OAK, price: 900 },
  { id: 'crib', name: 'Crib', category: 'Bedroom', shape: 'crib', w: 75, d: 135, h: 90, color: WHITE, color2: WHITE, price: 400, keywords: 'baby nursery' },
  { id: 'nightstand', name: 'Nightstand', category: 'Bedroom', shape: 'nightstand', w: 50, d: 40, h: 55, color: OAK, color2: BLACK, price: 200, keywords: 'bedside' },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', shape: 'dresser', w: 150, d: 50, h: 80, color: OAK, color2: BLACK, price: 900, keywords: 'drawers chest' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', shape: 'wardrobe', w: 120, d: 60, h: 210, color: WHITE, color2: STEEL, price: 1000, keywords: 'closet armoire' },
  { id: 'closet', name: 'Closet (built-in)', category: 'Bedroom', shape: 'wardrobe', w: 180, d: 65, h: 240, color: WHITE, color2: STEEL, price: 2000, keywords: 'reach-in' },

  // Dining
  { id: 'table-6', name: 'Dining table, 6', category: 'Dining', shape: 'table', w: 183, d: 92, h: 76, color: OAK, color2: OAK, price: 900 },
  { id: 'table-4', name: 'Dining table, 4', category: 'Dining', shape: 'table', w: 122, d: 80, h: 76, color: WALNUT, color2: WALNUT, price: 600 },
  { id: 'table-round', name: 'Round table', category: 'Dining', shape: 'round-table', w: 110, d: 110, h: 76, color: WHITE, color2: OAK, price: 600 },
  { id: 'chair', name: 'Dining chair', category: 'Dining', shape: 'chair', w: 46, d: 52, h: 88, color: OAK, color2: LINEN, price: 150 },
  { id: 'stool', name: 'Bar stool', category: 'Dining', shape: 'stool', w: 42, d: 42, h: 76, color: BLACK, color2: OAK, price: 120, keywords: 'counter' },
  { id: 'sideboard', name: 'Sideboard', category: 'Dining', shape: 'cabinet-low', w: 160, d: 45, h: 80, color: WALNUT, color2: BLACK, price: 800, keywords: 'buffet credenza' },

  // Kitchen
  { id: 'base-60', name: 'Base cabinet 24"', category: 'Kitchen', shape: 'base-cabinet', w: 61, d: 61, h: 91, color: WHITE, color2: STONE, price: 450, keywords: 'counter countertop' },
  { id: 'base-90', name: 'Base cabinet 36"', category: 'Kitchen', shape: 'base-cabinet', w: 91, d: 61, h: 91, color: WHITE, color2: STONE, price: 600, keywords: 'counter countertop' },
  { id: 'corner-base', name: 'Corner cabinet', category: 'Kitchen', shape: 'base-cabinet', w: 91, d: 91, h: 91, color: WHITE, color2: STONE, price: 700, keywords: 'counter' },
  { id: 'wall-cab', name: 'Wall cabinet 24"', category: 'Kitchen', shape: 'wall-cabinet', w: 61, d: 33, h: 76, elevation: 137, mount: 'wall', color: WHITE, color2: STEEL, price: 300, keywords: 'upper' },
  { id: 'wall-cab-36', name: 'Wall cabinet 36"', category: 'Kitchen', shape: 'wall-cabinet', w: 91, d: 33, h: 76, elevation: 137, mount: 'wall', color: WHITE, color2: STEEL, price: 380, keywords: 'upper' },
  { id: 'pantry', name: 'Pantry cabinet', category: 'Kitchen', shape: 'tall-cabinet', w: 61, d: 61, h: 213, color: WHITE, color2: STEEL, price: 900, keywords: 'tall' },
  { id: 'island', name: 'Kitchen island', category: 'Kitchen', shape: 'island', w: 244, d: 107, h: 92, color: '#3F5A55', color2: STONE, price: 3500 },
  { id: 'sink-cab', name: 'Sink cabinet', category: 'Kitchen', shape: 'sink-cabinet', w: 91, d: 61, h: 91, color: WHITE, color2: STONE, price: 800 },
  { id: 'range', name: 'Range / oven', category: 'Kitchen', shape: 'range', w: 76, d: 66, h: 92, color: STEEL, color2: BLACK, price: 1500, keywords: 'stove cooktop' },
  { id: 'hood', name: 'Range hood', category: 'Kitchen', shape: 'hood', w: 76, d: 50, h: 70, elevation: 150, mount: 'wall', color: STEEL, color2: STEEL, price: 500 },
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen', shape: 'fridge', w: 91, d: 76, h: 178, color: STEEL, color2: BLACK, price: 2500, keywords: 'fridge freezer' },
  { id: 'dishwasher', name: 'Dishwasher', category: 'Kitchen', shape: 'dishwasher', w: 61, d: 61, h: 87, color: STEEL, color2: BLACK, price: 900 },

  // Bath
  { id: 'toilet', name: 'Toilet', category: 'Bath', shape: 'toilet', w: 40, d: 70, h: 78, color: PORCELAIN, color2: PORCELAIN, price: 400, keywords: 'wc' },
  { id: 'vanity', name: 'Vanity, single', category: 'Bath', shape: 'vanity', w: 76, d: 53, h: 86, color: OAK, color2: PORCELAIN, price: 900, keywords: 'sink basin' },
  { id: 'vanity-double', name: 'Vanity, double', category: 'Bath', shape: 'vanity', w: 152, d: 56, h: 86, color: '#2F4A3A', color2: PORCELAIN, price: 1800, keywords: 'sink basin' },
  { id: 'bathtub', name: 'Bathtub, alcove', category: 'Bath', shape: 'bathtub', w: 152, d: 76, h: 55, color: PORCELAIN, color2: WHITE, price: 1200, keywords: 'bath tub' },
  { id: 'tub-free', name: 'Bathtub, freestanding', category: 'Bath', shape: 'tub-free', w: 170, d: 80, h: 60, color: PORCELAIN, color2: PORCELAIN, price: 2200, keywords: 'bath tub' },
  { id: 'shower', name: 'Shower, 36"', category: 'Bath', shape: 'shower', w: 91, d: 91, h: 200, color: '#DDE6EA', color2: STEEL, price: 2500 },
  { id: 'shower-large', name: 'Walk-in shower', category: 'Bath', shape: 'shower', w: 152, d: 91, h: 200, color: '#DDE6EA', color2: STEEL, price: 4500 },
  { id: 'towel-rack', name: 'Towel rail', category: 'Bath', shape: 'towel-rack', w: 60, d: 8, h: 60, elevation: 100, mount: 'wall', color: '#A8ABAD', color2: '#E3DCCF', price: 60 },
  { id: 'mirror', name: 'Mirror', category: 'Bath', shape: 'mirror', w: 70, d: 3, h: 90, elevation: 105, mount: 'wall', color: '#CFE0E6', color2: BLACK, price: 150 },

  // Office
  { id: 'desk', name: 'Desk', category: 'Office', shape: 'desk', w: 140, d: 70, h: 75, color: OAK, color2: BLACK, price: 500 },
  { id: 'desk-l', name: 'L-desk', category: 'Office', shape: 'desk-l', w: 160, d: 160, h: 75, color: WHITE, color2: BLACK, price: 700, keywords: 'corner' },
  { id: 'office-chair', name: 'Office chair', category: 'Office', shape: 'office-chair', w: 65, d: 65, h: 110, color: BLACK, color2: STEEL, price: 300 },
  { id: 'file-cabinet', name: 'File cabinet', category: 'Office', shape: 'dresser', w: 40, d: 60, h: 70, color: STEEL, color2: BLACK, price: 180 },

  // Laundry / utility
  { id: 'washer', name: 'Washer', category: 'Laundry', shape: 'washer', w: 69, d: 71, h: 99, color: WHITE, color2: '#9DB2BD', price: 900, keywords: 'laundry' },
  { id: 'dryer', name: 'Dryer', category: 'Laundry', shape: 'washer', w: 69, d: 71, h: 99, color: WHITE, color2: '#9DB2BD', price: 800, keywords: 'laundry' },
  { id: 'water-heater', name: 'Water heater', category: 'Laundry', shape: 'cylinder', w: 56, d: 56, h: 150, color: WHITE, color2: STEEL, price: 1400, keywords: 'utility' },
  { id: 'furnace', name: 'Furnace / AC', category: 'Laundry', shape: 'appliance-box', w: 60, d: 75, h: 120, color: '#C8CBCD', color2: STEEL, price: 4000, keywords: 'hvac utility' },
  { id: 'utility-sink', name: 'Utility sink', category: 'Laundry', shape: 'sink-cabinet', w: 61, d: 56, h: 91, color: WHITE, color2: WHITE, price: 350 },

  // Lighting
  { id: 'floor-lamp', name: 'Floor lamp', category: 'Lighting', shape: 'floor-lamp', w: 40, d: 40, h: 165, color: '#F2E8D5', color2: BLACK, price: 150 },
  { id: 'table-lamp', name: 'Table lamp', category: 'Lighting', shape: 'table-lamp', w: 35, d: 35, h: 55, elevation: 55, color: '#F2E8D5', color2: '#B89457', price: 90 },
  { id: 'pendant', name: 'Pendant light', category: 'Lighting', shape: 'pendant', w: 45, d: 45, h: 70, mount: 'ceiling', color: BLACK, color2: '#FFE7B0', price: 200 },
  { id: 'chandelier', name: 'Chandelier', category: 'Lighting', shape: 'chandelier', w: 80, d: 80, h: 70, mount: 'ceiling', color: '#B89457', color2: '#FFE7B0', price: 600 },
  { id: 'sconce', name: 'Wall sconce', category: 'Lighting', shape: 'sconce', w: 18, d: 15, h: 28, elevation: 165, mount: 'wall', color: '#B89457', color2: '#FFE7B0', price: 120 },
  { id: 'recessed', name: 'Recessed light', category: 'Lighting', shape: 'ceiling-light', w: 15, d: 15, h: 2, mount: 'ceiling', color: '#F1F0EC', color2: '#FFE7B0', price: 90, keywords: 'downlight can pot' },
  { id: 'ceiling-light', name: 'Ceiling light', category: 'Lighting', shape: 'ceiling-light', w: 40, d: 40, h: 10, mount: 'ceiling', color: WHITE, color2: '#FFE7B0', price: 120, keywords: 'flush mount' },

  // Electrical
  { id: 'outlet', name: 'Outlet', category: 'Electrical', shape: 'plate', w: 7, d: 1, h: 12, elevation: 30, mount: 'wall', color: '#F4F2EC', color2: '#8C8F92', price: 150, keywords: 'socket receptacle plug' },
  { id: 'switch', name: 'Light switch', category: 'Electrical', shape: 'plate', w: 7, d: 1, h: 12, elevation: 120, mount: 'wall', color: '#F4F2EC', color2: '#8C8F92', price: 120 },
  { id: 'thermostat', name: 'Thermostat', category: 'Electrical', shape: 'plate', w: 10, d: 2.5, h: 10, elevation: 150, mount: 'wall', color: '#2A2B2D', color2: '#6FB6C8', price: 250 },
  { id: 'smoke-alarm', name: 'Smoke alarm', category: 'Electrical', shape: 'ceiling-light', w: 13, d: 13, h: 4, mount: 'ceiling', color: '#F4F2EC', color2: '#E0E0E0', price: 60, keywords: 'detector co' },
  { id: 'ceiling-fan', name: 'Ceiling fan', category: 'Electrical', shape: 'fan', w: 132, d: 132, h: 40, mount: 'ceiling', color: '#6A4630', color2: '#2A2B2D', price: 350 },
  { id: 'ev-charger', name: 'EV charger', category: 'Electrical', shape: 'plate', w: 25, d: 10, h: 38, elevation: 110, mount: 'wall', color: '#2A2B2D', color2: '#2BB3A9', price: 1200, keywords: 'car electric garage' },

  // Decor
  { id: 'plant', name: 'Floor plant', category: 'Decor', shape: 'plant', w: 55, d: 55, h: 130, color: '#4F7A45', color2: '#B9785A', price: 80, keywords: 'tree fiddle' },
  { id: 'plant-small', name: 'Small plant', category: 'Decor', shape: 'plant', w: 30, d: 30, h: 50, color: '#5C8A4E', color2: WHITE, price: 30 },
  { id: 'art', name: 'Wall art', category: 'Decor', shape: 'art', w: 90, d: 3, h: 60, elevation: 140, mount: 'wall', color: '#D9A36C', color2: BLACK, price: 200, keywords: 'painting frame picture' },
  { id: 'curtains', name: 'Curtains', category: 'Decor', shape: 'curtain', w: 200, d: 10, h: 240, mount: 'wall', color: '#E3DCCF', color2: STEEL, price: 150, keywords: 'drapes' },

  // Outdoor
  { id: 'tree', name: 'Tree', category: 'Outdoor', shape: 'tree', w: 350, d: 350, h: 650, color: '#557A3F', color2: '#6B4D35', price: 300 },
  { id: 'shrub', name: 'Shrub', category: 'Outdoor', shape: 'shrub', w: 110, d: 110, h: 90, color: '#5E8546', color2: '#5E8546', price: 60, keywords: 'bush hedge' },
  { id: 'car', name: 'Car', category: 'Outdoor', shape: 'car', w: 185, d: 470, h: 145, color: '#7B8A96', color2: '#1E2328', price: 0, keywords: 'vehicle garage' },
  { id: 'patio-table', name: 'Patio table', category: 'Outdoor', shape: 'round-table', w: 100, d: 100, h: 72, color: '#3C3F41', color2: '#3C3F41', price: 500 },
  { id: 'lounger', name: 'Lounger', category: 'Outdoor', shape: 'lounger', w: 70, d: 195, h: 40, color: '#E8E1D4', color2: '#6B4D35', price: 250, keywords: 'chaise' },
  { id: 'grill', name: 'Grill', category: 'Outdoor', shape: 'grill', w: 130, d: 60, h: 115, color: BLACK, color2: STEEL, price: 600, keywords: 'bbq' },
  { id: 'hot-tub', name: 'Hot tub', category: 'Outdoor', shape: 'hot-tub', w: 213, d: 213, h: 90, color: '#6B5846', color2: '#6FB6C8', price: 8000, keywords: 'spa jacuzzi' },
  { id: 'fence', name: 'Fence, 8 ft', category: 'Outdoor', shape: 'fence', w: 244, d: 8, h: 180, color: '#8C6A4E', color2: '#6B4D35', price: 320, keywords: 'privacy boundary' },
  { id: 'pergola', name: 'Pergola', category: 'Outdoor', shape: 'pergola', w: 366, d: 305, h: 260, color: '#6B4D35', color2: '#6B4D35', price: 4500, keywords: 'arbor shade' },
  { id: 'fire-pit', name: 'Fire pit', category: 'Outdoor', shape: 'fire-pit', w: 110, d: 110, h: 40, color: '#8A8580', color2: '#FF8A3D', price: 800 },
  { id: 'garden-bed', name: 'Garden bed', category: 'Outdoor', shape: 'garden-bed', w: 244, d: 91, h: 40, color: '#7A5A40', color2: '#5B8540', price: 250, keywords: 'planter vegetable raised' },
  { id: 'shed', name: 'Garden shed', category: 'Outdoor', shape: 'shed', w: 305, d: 244, h: 250, color: '#9DB2BD', color2: '#4A4E52', price: 4000, keywords: 'storage' },
  { id: 'umbrella', name: 'Patio umbrella', category: 'Outdoor', shape: 'umbrella', w: 270, d: 270, h: 240, color: '#E8E1D4', color2: '#6B4D35', price: 250, keywords: 'parasol shade' },
  { id: 'pool', name: 'Pool', category: 'Outdoor', shape: 'pool', w: 450, d: 900, h: 10, color: '#E7E3DA', color2: '#4FA7C9', price: 45000, keywords: 'swimming' },

  // Structure
  { id: 'stairs', name: 'Stairs, straight', category: 'Structure', shape: 'stairs', w: 100, d: 330, h: 270, color: OAK, color2: WHITE, price: 3500, fitHeight: true, keywords: 'staircase steps' },
  { id: 'stairs-wide', name: 'Stairs, wide', category: 'Structure', shape: 'stairs', w: 130, d: 360, h: 270, color: WALNUT, color2: WHITE, price: 4500, fitHeight: true, keywords: 'staircase steps' },
  { id: 'column', name: 'Column', category: 'Structure', shape: 'column', w: 30, d: 30, h: 270, color: WHITE, color2: WHITE, price: 300, fitHeight: true, keywords: 'pillar post' },
  { id: 'railing', name: 'Railing', category: 'Structure', shape: 'railing', w: 200, d: 5, h: 100, color: '#2A2B2D', color2: '#C29A6B', price: 400, keywords: 'balustrade guard' },
  { id: 'shelf', name: 'Open shelf', category: 'Structure', shape: 'shelf', w: 91, d: 25, h: 4, elevation: 150, mount: 'wall', color: '#C29A6B', color2: '#2A2B2D', price: 90, keywords: 'floating wall shelf' },
  { id: 'beam', name: 'Ceiling beam', category: 'Structure', shape: 'box', w: 400, d: 20, h: 25, mount: 'ceiling', color: WALNUT, color2: WALNUT, price: 600 },
  { id: 'counter', name: 'Countertop run', category: 'Structure', shape: 'base-cabinet', w: 244, d: 61, h: 91, color: WHITE, color2: STONE, price: 2400, keywords: 'kitchen cabinets' },
  { id: 'box', name: 'Custom box', category: 'Structure', shape: 'box', w: 100, d: 100, h: 100, color: '#C8C2B6', color2: '#C8C2B6', price: 0, keywords: 'block generic' },
]

export const CATALOG_BY_ID: Record<string, CatalogEntry> = Object.fromEntries(CATALOG.map((c) => [c.id, c]))

export function catalogEntry(type: string): CatalogEntry {
  return CATALOG_BY_ID[type] ?? CATALOG_BY_ID['box']
}

export function searchCatalog(q: string, category?: Category | 'All'): CatalogEntry[] {
  const needle = q.trim().toLowerCase()
  return CATALOG.filter((c) => {
    if (category && category !== 'All' && c.category !== category) return false
    if (!needle) return true
    return `${c.name} ${c.category} ${c.keywords ?? ''}`.toLowerCase().includes(needle)
  })
}
