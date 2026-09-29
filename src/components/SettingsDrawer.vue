<template>
  <div class="goldenfinger-settings">
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>{{ t`金手指系统` }}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label">
          <input v-model="settings.enabled" type="checkbox" />
          <span>{{ t`启用金手指（注入提示词给正文 AI）` }}</span>
        </label>
        <div class="gf-setting-desc">
          {{ t`API 配置、注入位置、提示词预览等已移到游戏面板的「设置」标签页。` }}
        </div>

        <div class="gf-setting-row">
          <button class="menu_button" @click="togglePanel">
            <i class="fa-solid fa-table-columns"></i>&nbsp;{{ t`打开/关闭系统面板` }}
          </button>
        </div>

        <hr class="sysHR" />

        <div class="gf-section-title">{{ t`自定义系统（${settings.customSystems.length}）` }}</div>
        <div v-for="(system, index) in settings.customSystems" :key="system.id" class="gf-custom-item">
          <span class="gf-custom-name" :style="{ '--gf-accent': system.color }">{{ system.icon }} {{ system.name }}</span>
          <span class="gf-flex"></span>
          <button class="menu_button menu_button_icon gf-trash" :title="t`删除`" @click="removeCustomSystem(index)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
        <button class="menu_button" @click="openEditor(-1)">
          <i class="fa-solid fa-plus"></i>&nbsp;{{ t`新建自定义系统` }}
        </button>

        <div v-if="editorOpen" class="gf-editor">
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`名称` }}</span>
            <input v-model="editor.name" class="text_input gf-flex-input" type="text" :placeholder="t`例如：赌徒系统`" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`图标（emoji）` }}</span>
            <input v-model="editor.icon" class="text_input gf-flex-input gf-icon-input" type="text" maxlength="4" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`主题色` }}</span>
            <input v-model="editor.color" class="gf-color" type="color" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`货币名称` }}</span>
            <input v-model="editor.currencyName" class="text_input gf-flex-input" type="text" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`商店名称` }}</span>
            <input v-model="editor.shopName" class="text_input gf-flex-input" type="text" :placeholder="t`例如：黑市交易所`" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`换一批价格` }}</span>
            <input v-model.number="editor.refreshCost" class="text_input gf-number" type="number" min="0" max="99999" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`同时进行的任务上限` }}</span>
            <input v-model.number="editor.maxActiveTasks" class="text_input gf-number" type="number" min="1" max="5" />
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`等级称号（逗号分隔，可留空）` }}</span>
            <input v-model="editor.levelNamesText" class="text_input gf-flex-input" type="text" :placeholder="t`例如：学徒,能手,宗师`" />
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`系统设定（会注入提示词；以第三人称描述系统的性格与播报风格）` }}</span>
            <textarea v-model="editor.persona" class="text_input gf-textarea" rows="4"></textarea>
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`任务风格（该系统倾向发布什么类型的任务）` }}</span>
            <textarea v-model="editor.taskHint" class="text_input gf-textarea" rows="3"></textarea>
          </div>
          <div class="gf-editor-actions">
            <button class="menu_button" @click="saveCustomSystem"><i class="fa-solid fa-floppy-disk"></i>&nbsp;{{ t`保存` }}</button>
            <button class="menu_button" @click="editorOpen = false">{{ t`取消` }}</button>
          </div>
        </div>

        <hr class="sysHR" />

        <div class="gf-setting-row">
          <button class="menu_button gf-danger" @click="resetChatState">
            <i class="fa-solid fa-trash-can"></i>&nbsp;{{ t`清空本聊天的金手指数据` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import toastr from 'toastr';
import { reactive, ref } from 'vue';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import { SystemDef } from '@/type/game';

const game = useGameStore();
const { settings } = storeToRefs(useSettingsStore());

const editorOpen = ref(false);
/** >=0 表示在编辑已有自定义系统的下标 */
const editorIndex = ref(-1);
const editor = reactive(emptyEditor());

function emptyEditor() {
  return {
    name: '',
    icon: '✨',
    color: '#8b5cf6',
    currencyName: '积分',
    shopName: '系统商店',
    refreshCost: 50,
    maxActiveTasks: 2,
    levelNamesText: '',
    persona: '',
    taskHint: '',
  };
}

function openEditor(index: number): void {
  editorIndex.value = index;
  if (index >= 0) {
    const system = settings.value.customSystems[index];
    Object.assign(editor, {
      name: system.name,
      icon: system.icon,
      color: system.color,
      currencyName: system.currencyName,
      shopName: system.shopName,
      refreshCost: system.refreshCost,
      maxActiveTasks: system.maxActiveTasks,
      levelNamesText: system.levelNames.join(','),
      persona: system.persona,
      taskHint: system.taskHint,
    });
  } else {
    Object.assign(editor, emptyEditor());
  }
  editorOpen.value = true;
}

function saveCustomSystem(): void {
  const levelNames = editor.levelNamesText
    .split(/[,，、]/)
    .map(name => name.trim())
    .filter(Boolean);
  const candidate: SystemDef = {
    id: editorIndex.value >= 0 ? settings.value.customSystems[editorIndex.value].id : `custom_${Date.now().toString(36)}`,
    name: editor.name.trim() || t`未命名系统`,
    icon: editor.icon.trim() || '✨',
    color: editor.color,
    currencyName: editor.currencyName.trim() || '积分',
    tagline: '',
    persona: editor.persona.trim(),
    taskHint: editor.taskHint.trim(),
    levelNames,
    maxActiveTasks: _.clamp(Math.round(editor.maxActiveTasks) || 2, 1, 5),
    shopName: editor.shopName.trim() || '系统商店',
    refreshCost: _.clamp(Math.round(editor.refreshCost) || 0, 0, 99999),
    builtin: false,
  };
  const result = SystemDef.safeParse(candidate);
  if (!result.success) {
    toastr.error(z.prettifyError(result.error), t`金手指系统`);
    return;
  }
  if (editorIndex.value >= 0) {
    settings.value.customSystems.splice(editorIndex.value, 1, result.data);
  } else {
    settings.value.customSystems.push(result.data);
  }
  editorOpen.value = false;
  toastr.success(t`自定义系统已保存`, t`金手指系统`);
}

function removeCustomSystem(index: number): void {
  const removed = settings.value.customSystems.splice(index, 1)[0];
  if (removed && game.state.activeSystemId === removed.id) {
    // 激活中的系统被删：保留游玩数据，仅断开绑定（面板会回到选择界面）
    game.state.activeSystemId = null;
    toastr.info(t`已解绑被删除的系统「${removed.name}」，游玩数据保留`, t`金手指系统`);
  }
}

function togglePanel(): void {
  settings.value.panelVisible = !settings.value.panelVisible;
}

async function resetChatState(): Promise<void> {
  const context = window.SillyTavern?.getContext?.();
  const result = await context?.callGenericPopup?.(
    t`确定清空本聊天的全部金手指数据（等级、货币、任务、背包、日志）？`,
    context.POPUP_TYPE.CONFIRM,
  );
  if (result === context?.POPUP_RESULT?.AFFIRMATIVE) {
    game.resetState();
    toastr.success(t`已清空`, t`金手指系统`);
  }
}
</script>

<style scoped>
.goldenfinger-settings .checkbox_label {
  margin: 3px 0;
}
</style>
