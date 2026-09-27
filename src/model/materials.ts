/** Floor finishes, paint colours and furniture swatches. Prices are rough US installed-cost estimates per sq ft. */

export type FloorPattern =
  | 'planks'
  | 'parquet'
  | 'tiles'
  | 'hex'
  | 'marble'
  | 'concrete'
  | 'carpet'
  | 'terrazzo'
  | 'grass'
  | 'brick'
  | 'deck'
  | 'solid'

export interface FloorMaterial {
  id: string
  name: string
  pattern: FloorPattern
  base: string
  accent: string
  /** Pattern module size in cm (plank width, tile size...). */
  module: number
  pricePerSqFt: number
  outdoor?: boolean
}

export const FLOORS: FloorMaterial[] = [
  { id: 'oak', name: 'White oak planks', pattern: 'planks', base: '#C9A57A', accent: '#A9835A', module: 18, pricePerSqFt: 11 },
  { id: 'walnut', name: 'Walnut planks', pattern: 'planks', base: '#6E4B33', accent: '#553825', module: 18, pricePerSqFt: 14 },
  { id: 'ash', name: 'Pale ash planks', pattern: 'planks', base: '#DCC9A8', accent: '#C3AD88', module: 20, pricePerSqFt: 12 },
  { id: 'greywood', name: 'Grey vinyl planks', pattern: 'planks', base: '#9D9790', accent: '#85807A', module: 18, pricePerSqFt: 6 },
  { id: 'parquet', name: 'Oak parquet', pattern: 'parquet', base: '#BE9366', accent: '#9C7249', module: 9, pricePerSqFt: 17 },
  { id: 'tile-white', name: 'White porcelain 12"', pattern: 'tiles', base: '#ECEBE6', accent: '#CFCDC6', module: 30.48, pricePerSqFt: 9 },
  { id: 'tile-grey', name: 'Grey porcelain 24"', pattern: 'tiles', base: '#A7A9A6', accent: '#8C8E8B', module: 60.96, pricePerSqFt: 10 },
  { id: 'tile-black', name: 'Slate tile 16"', pattern: 'tiles', base: '#45484A', accent: '#2F3133', module: 40.64, pricePerSqFt: 12 },
  { id: 'hex', name: 'Hex mosaic', pattern: 'hex', base: '#F1F0EB', accent: '#BDBBB4', module: 8, pricePerSqFt: 15 },
  { id: 'marble', name: 'Carrara marble', pattern: 'marble', base: '#EEEDEA', accent: '#A9ACB0', module: 60, pricePerSqFt: 25 },
  { id: 'terrazzo', name: 'Terrazzo', pattern: 'terrazzo', base: '#E4DFD6', accent: '#8F8A82', module: 40, pricePerSqFt: 22 },
  { id: 'concrete', name: 'Polished concrete', pattern: 'concrete', base: '#B4B2AD', accent: '#9B9994', module: 120, pricePerSqFt: 7 },
  { id: 'carpet-oat', name: 'Oatmeal carpet', pattern: 'carpet', base: '#CDBFA8', accent: '#BBAC93', module: 4, pricePerSqFt: 5 },
  { id: 'carpet-grey', name: 'Charcoal carpet', pattern: 'carpet', base: '#5E6166', accent: '#50535A', module: 4, pricePerSqFt: 5 },
  { id: 'solid', name: 'Painted / solid', pattern: 'solid', base: '#D8D4CC', accent: '#D8D4CC', module: 100, pricePerSqFt: 3 },
  { id: 'deck', name: 'Timber deck', pattern: 'deck', base: '#8C6A4E', accent: '#6D5039', module: 14, pricePerSqFt: 30, outdoor: true },
  { id: 'pavers', name: 'Brick pavers', pattern: 'brick', base: '#A45B44', accent: '#7E4331', module: 20, pricePerSqFt: 18, outdoor: true },
  { id: 'grass', name: 'Lawn', pattern: 'grass', base: '#6E9A4F', accent: '#5B8540', module: 50, pricePerSqFt: 1, outdoor: true },
]

export const FLOOR_BY_ID: Record<string, FloorMaterial> = Object.fromEntries(FLOORS.map((f) => [f.id, f]))

export function floorMaterial(id: string): FloorMaterial {
  return FLOOR_BY_ID[id] ?? FLOORS[0]
}

export interface Swatch {
  name: string
  hex: string
}

/** Interior/exterior paint. Grouped so the picker reads light→dark within each family. */
export const PAINTS: Swatch[] = [
  { name: 'Chalk', hex: '#F4F2EC' },
  { name: 'Paper white', hex: '#FAFAF7' },
  { name: 'Linen', hex: '#EDE6D8' },
  { name: 'Greige', hex: '#CFC8BB' },
  { name: 'Stone', hex: '#B4AEA3' },
  { name: 'Pewter', hex: '#8D8F8C' },
  { name: 'Graphite', hex: '#4A4E52' },
  { name: 'Ink', hex: '#23272B' },
  { name: 'Mist blue', hex: '#C9D6DE' },
  { name: 'Harbor blue', hex: '#6F8FA6' },
  { name: 'Navy', hex: '#27394F' },
  { name: 'Sage', hex: '#B3BFA6' },
  { name: 'Olive', hex: '#7D7F57' },
  { name: 'Forest', hex: '#2F4A3A' },
  { name: 'Blush', hex: '#E9D2C9' },
  { name: 'Clay', hex: '#C2876A' },
  { name: 'Brick red', hex: '#8E3B2E' },
  { name: 'Ochre', hex: '#D0A14C' },
  { name: 'Butter', hex: '#F1E3A9' },
  { name: 'Lavender', hex: '#CFC6DC' },
]

/** Fabric, wood and metal tones for furniture. */
export const FINISHES: Swatch[] = [
  { name: 'Natural oak', hex: '#C29A6B' },
  { name: 'Walnut', hex: '#6A4630' },
  { name: 'Ebony', hex: '#2B2724' },
  { name: 'White lacquer', hex: '#F1F0EC' },
  { name: 'Matte black', hex: '#2A2B2D' },
  { name: 'Brushed steel', hex: '#A8ABAD' },
  { name: 'Brass', hex: '#B89457' },
  { name: 'Linen fabric', hex: '#D9CFBE' },
  { name: 'Charcoal fabric', hex: '#4D5055' },
  { name: 'Cognac leather', hex: '#8A5A36' },
  { name: 'Velvet green', hex: '#355E4B' },
  { name: 'Velvet blue', hex: '#2E4A6B' },
  { name: 'Rust', hex: '#A5532F' },
  { name: 'Mustard', hex: '#C99A2E' },
  { name: 'Blush fabric', hex: '#D9AFA2' },
  { name: 'Porcelain', hex: '#F7F7F5' },
]

/** Wall paint cost per sq ft of wall face (materials + labour estimate). */
export const PAINT_PRICE_PER_SQFT = 2.5
/** Drywall/framing estimate per sq ft of wall (one face). */
export const WALL_BUILD_PRICE_PER_SQFT = 9
