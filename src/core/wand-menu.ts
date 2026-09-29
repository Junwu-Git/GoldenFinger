import { useSettingsStore } from '@/store/settings';

const MAX_POLLS = 30;
const POLL_INTERVAL = 200;

/** 魔棒菜单容器由酒馆在启动流程中动态注入，可能晚于扩展加载；轮询等待后幂等注入入口 */
export function initWandMenu(): void {
  let pollCount = 0;
  const interval = setInterval(() => {
    pollCount++;
    const $menu = $('#extensionsMenu');
    if ($menu.length) {
      clearInterval(interval);
      createWandEntry($menu);
    } else if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      console.warn(
        '[GoldenFinger] 魔法棒菜单容器 #extensionsMenu 未在 %d 秒内出现，已放弃注入',
        (MAX_POLLS * POLL_INTERVAL) / 1000,
      );
    }
  }, POLL_INTERVAL);
}

function createWandEntry($menu: JQuery<HTMLElement>): void {
  if ($menu.find('#golden_finger_wand_container').length) {
    return;
  }
  const $container = $('<div id="golden_finger_wand_container" class="extension_container">').appendTo($menu);
  const $entry = $(`
    <div class="list-group-item flex-container flexGap5">
      <div class="fa-solid fa-microchip extensionsMenuExtensionButton"></div>
      <span>${t`金手指`}</span>
    </div>
  `);
  $entry.on('click', () => {
    const settings = useSettingsStore().settings;
    settings.panelVisible = !settings.panelVisible;
    $('#extensionsMenu').hide();
  });
  $container.append($entry);
}
