import { createGame } from './game/createGame';
import './ui/styles.css';

const container = document.querySelector<HTMLElement>('#app');

if (!container) {
  throw new Error('缺少游戏挂载节点 #app');
}

const game = createGame(container);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
