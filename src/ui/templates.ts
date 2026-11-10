import { ATLAS_SIZE, characterFrame } from '../game/characters';

export function cloneTemplate(name: string): DocumentFragment {
  const template = document.querySelector<HTMLTemplateElement>(
    `#wallbait-${name}`,
  )!;
  return template.content.cloneNode(true) as DocumentFragment;
}

/** 首页、帮助和结算沿用对局使用的角色图集。 */
export function cloneArt(
  name: 'hero-art' | 'apple-art',
  atlasUrl: string,
): DocumentFragment {
  const content = cloneTemplate(name);
  for (const sprite of content.querySelectorAll('svg[data-frame]')) {
    const { x, y, width, height } = characterFrame(
      Number(sprite.getAttribute('data-frame')),
    );
    sprite.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    const image = sprite.querySelector('image')!;
    image.setAttribute('width', String(ATLAS_SIZE));
    image.setAttribute('height', String(ATLAS_SIZE));
    image.setAttribute('href', atlasUrl);
  }
  return content;
}
