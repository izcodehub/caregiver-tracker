// Utility for managing caregiver colors

export type CaregiverColor = {
  id: string;
  name: string;
  color: string;
};

// Default colors if database lookup fails (excludes red/green used for check-in/out)
// Each color is visually distinct for easy caregiver identification
const DEFAULT_COLORS = [
  '#3B82F6', // bright blue
  '#8B5CF6', // violet
  '#EC4899', // hot pink
  '#F59E0B', // amber/orange
  '#06B6D4', // cyan (turquoise)
  '#A855F7', // purple
  '#6366F1', // indigo
  '#D946EF', // fuchsia/magenta
  '#EAB308', // yellow
  '#F97316', // dark orange
  '#0EA5E9', // sky blue
  '#7C3AED', // deep purple
  '#FB923C', // coral
  '#C026D3', // magenta/pink
  '#A78BFA', // lavender
  '#F472B6', // light pink
];

// Create a consistent color map from caregiver names (fallback)
export function getColorForCaregiver(name: string, allNames: string[]): string {
  const sortedNames = [...allNames].sort();
  const index = sortedNames.indexOf(name);
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

// Get color map from caregiver records
export function createColorMap(caregivers: CaregiverColor[]): Map<string, string> {
  const colorMap = new Map<string, string>();
  caregivers.forEach(c => {
    colorMap.set(c.name, c.color);
  });
  return colorMap;
}

// Get color for a name, with fallback
export function getColor(
  name: string,
  colorMap: Map<string, string> | null,
  allNames: string[]
): string {
  if (colorMap && colorMap.has(name)) {
    return colorMap.get(name)!;
  }
  return getColorForCaregiver(name, allNames);
}

// Convert hex color to lighter shade for backgrounds
export function hexToRgba(hex: string, alpha: number = 0.1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
