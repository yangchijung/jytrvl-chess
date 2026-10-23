// Color Doodle V2 picture templates (C2): six original line drawings, 32 fillable regions, one 400×300 viewBox.
// Data from the product handoff (docs/design/doodle-workbench-v2/templates.json). Regions are drawn in list order;
// fixed details (eyes, lines) are drawn on top and are never fillable.
import data from './templates.json';

export interface TemplateRegion {
  id: string;
  name: { zh: string; en: string };
  d: string;
}
export interface Template {
  id: string;
  name: { zh: string; en: string };
  regions: TemplateRegion[];
  /** static SVG markup drawn above the regions (stroke/fill set by the caller) */
  details: string;
  accessibleOrder: string[];
}
export const VIEWBOX = data.viewBox as { width: number; height: number };
export const TEMPLATES = data.templates as Template[];
export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const templateOf = (id: string): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
/** Region ids per template, in drawing order. */
export const REGIONS_OF: Record<string, string[]> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.regions.map((r) => r.id)]));
export const LINE = '#253A35';
