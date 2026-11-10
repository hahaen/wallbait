import { getSDK } from '@discourse-mini-app/sdk';
import type { MiniAppSDK } from '@discourse-mini-app/sdk';
import { App } from '../src/ui/App';
import { readSave, SAVE_KEY } from '../src/storage/save';
import type { Save } from '../src/storage/save';
import '../src/ui/styles.css';

async function start(root: HTMLElement): Promise<void> {
  let atlasUrl: string | undefined;
  try {
    const host: MiniAppSDK = getSDK();
    await host.ready;
    // HTML 已有加载提示，先让宿主显示它，再读取图集和存档。
    await host.lifecycle.ready();
    const [atlas, rawSave] = await Promise.all([
      host.assets.readBytes('images/bean-mascots.webp', { timeoutMs: 10000 }),
      host.permissions.has('storage.read')
        ? host.localStorage.getItem(SAVE_KEY).catch(() => undefined)
        : undefined,
    ]);
    atlasUrl = URL.createObjectURL(new Blob([atlas], { type: 'image/webp' }));
    // 读取失败时保留已有数据，避免用默认值覆盖旧纪录。
    const canSave =
      rawSave !== undefined && host.permissions.has('storage.write');
    let pendingSave = Promise.resolve(true);
    const persist = (save: Save): Promise<boolean> => {
      if (!canSave) return Promise.resolve(false);
      const snapshot = JSON.stringify(save);
      pendingSave = pendingSave
        .then(() => host.localStorage.setItem(SAVE_KEY, snapshot))
        .then(
          () => true,
          () => false,
        );
      return pendingSave;
    };
    const app = new App(root, {
      atlasUrl,
      initialSave: readSave({ getItem: () => rawSave ?? null }),
      persist,
      audioEnabled: host.permissions.has('audio.webAudio'),
    });
    const objectUrl = atlasUrl;
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) return;
      app.destroy();
      URL.revokeObjectURL(objectUrl);
    });
  } catch (error) {
    if (atlasUrl) URL.revokeObjectURL(atlasUrl);
    root.textContent = '游戏还没准备好，请关闭后重新打开。';
    console.error(error);
  }
}

const root = document.querySelector<HTMLElement>('#app');
if (root) void start(root);
