import type { UtilitySkill } from '../core/types';
const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const utilityIcons: Record<UtilitySkill, string> = {
  dodge: svg('<path d="m5 12 7-6 7 6M5 20l7-6 7 6"/>'),
  pulse: svg(
    '<circle cx="12" cy="12" r="6"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
  ),
  magnet: svg('<path d="M6 4v10a6 6 0 0 0 12 0V4M6 8h3m6 0h3"/>'),
};
export const beaconIcon = svg(
  '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
);
