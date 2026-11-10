import { App } from './ui/App';
import atlasUrl from './assets/characters/bean-mascots.webp';
import './ui/styles.css';

const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('缺少游戏挂载节点 #app');
const app = new App(container, { atlasUrl });
if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
