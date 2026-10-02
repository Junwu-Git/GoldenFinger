import toastr from 'toastr';
import '@/global.css';
import App from '@/App.vue';
import { handleMessageMarkers, refreshInjection } from '@/core/injector';
import { initWandMenu } from '@/core/wand-menu';
import { pinia } from '@/pinia';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { eventSource, event_types } from '@sillytavern/scripts/events';

$(() => {
  try {
    setActivePinia(pinia);
    useGameStore(pinia);
    useSettingsStore(pinia);

    const host = $('<div id="golden_finger_app">').appendTo(document.body);
    const app = createApp(App);
    app.use(pinia);
    app.config.globalProperties.t = t;
    app.mount(host[0]);

    const game = useGameStore(pinia);
    const settingsStore = useSettingsStore(pinia);

    // 状态或设置变化 → 刷新提示词注入（store 内部只管数据，注入统一在这里触发）。
    // 必须用 getter 做源：reload/activateSystem 会整体替换 state.value，
    // 直接传 game.state 会把旧对象固化成监听目标，替换后失联
    watch(
      () => game.state,
      () => refreshInjection(),
      { deep: true },
    );
    watch(settingsStore.settings, () => refreshInjection(), { deep: true });

    // 切换聊天 → 重载该聊天的游玩状态（state 替换会触发上面的 watch 顺带刷新注入）
    eventSource.on(event_types.CHAT_CHANGED, () => game.reload());

    // AI 回复 → 判定标记结算（同步）+ 自动发布任务（脱钩）。
    // ST 的 eventSource.emit 串行 await 监听器，把异步生成的 await 留在监听器里会推迟
    // MESSAGE_RECEIVED 之后的 CHARACTER_MESSAGE_RENDERED（酒馆助手楼层渲染挂在它上面）
    eventSource.on(event_types.MESSAGE_RECEIVED, (messageIndex: number, type: string) => {
      try {
        handleMessageMarkers(messageIndex);
      } catch (error) {
        console.error('[GoldenFinger] 判定标记处理失败', error);
      }
      if (type === 'quiet') {
        return;
      }
      try {
        if (game.noteAutoIssue()) {
          void game
            .issueTasks()
            .then(tasks => {
              // 自动发布是「系统主动找上门」的核心交互感来源，成功时必须可感知
              toastr.info(t`叮！系统主动派发了 ${tasks.length} 个新任务`, t`金手指系统`);
            })
            .catch((error: unknown) => {
              console.error('[GoldenFinger] 自动发布任务失败', error);
              toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
            });
        }
        if (game.noteAutoJudge()) {
          void game
            .judgeTasks()
            .then(settled => {
              if (settled > 0) {
                toastr.success(t`叮！系统自动判定结算了 ${settled} 个任务`, t`金手指系统`);
              }
            })
            .catch((error: unknown) => {
              console.error('[GoldenFinger] 自动判定失败', error);
              toastr.error(error instanceof Error ? error.message : String(error), t`金手指系统`);
            });
        }
      } catch (error) {
        console.error('[GoldenFinger] 自动发布判定失败', error);
      }
    });

    // 消息编辑/滑动重生成 → 只做判定标记解析（对已结算任务幂等）
    eventSource.on(event_types.MESSAGE_UPDATED, (messageIndex: number) => {
      try {
        handleMessageMarkers(messageIndex);
      } catch (error) {
        console.error('[GoldenFinger] 判定标记处理失败', error);
      }
    });

    initWandMenu();
    refreshInjection();
  } catch (error) {
    console.error('[GoldenFinger] init failed', error);
    toastr.error(`金手指系统初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
});
