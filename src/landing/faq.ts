/** Questions on the marketing page, also published as search data (see seo.ts). */
import { PASS } from '../product/plans'

export const FAQ: Array<[string, string]> = [
  ['Do I need to install anything?', 'No. Threshold runs in your web browser on a computer, tablet or phone. Your designs save automatically.'],
  ['Where are my designs stored?', 'In your browser on this device. On Pro and Studio they also follow your license to every device you use. You can always save a design file as your own copy.'],
  ['What happens to my designs if I stop paying?', 'Nothing is lost. Every design stays and still opens; only the paid features pause.'],
  ['Can I cancel anytime?', 'Yes. Monthly plans end at the end of the month you cancel in; yearly plans at the end of the year.'],
  ['I only need it for one house. Do I have to subscribe?', `No. The ${PASS.name} is one payment of $${PASS.price} for 6 months of Pro. Nothing renews, and your designs stay when it ends.`],
  ['Can I use the plans with my builder or architect?', 'Yes. Export a PDF plan set (cover, every floor plan, room schedule and shopping list), a DXF drawing their CAD program opens, floor plan sheets, 3D images and a 3D model. For a permit, a licensed professional still needs to prepare the construction drawings.'],
  ['Can I use Threshold for client work?', 'Yes, on the Studio plan: your brand on every sheet, a guided 3D presentation, client links that open straight into it (no account needed), and commercial use of everything you export.'],
]
