import type { DropKind } from '../core/types';
const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const dropIcons: Record<DropKind, string> = {
  shield: svg(
    '<path d="M12 3 20 6v6c0 4-3 7-8 10-5-3-8-6-8-10V6z"/><path d="m8 12 3 3 5-6"/>',
  ),
  freeze: svg(
    '<path d="M12 3v18M4 7l16 10M4 17 20 7M9 5l3 3 3-3m-6 14 3-3 3 3"/>',
  ),
  lure: svg(
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  ),
};
