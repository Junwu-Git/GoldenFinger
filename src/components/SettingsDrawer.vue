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
          {{ t`提示词、世界书、正则、API 配置等已移到游戏面板的「配置」标签页。` }}
        </div>

        <div class="gf-setting-row">
          <button class="menu_button" @click="togglePanel">
            <i class="fa-solid fa-table-columns"></i>&nbsp;{{ t`打开/关闭系统面板` }}
          </button>
        </div>

        <hr class="sysHR" />

        <div class="gf-section-title">{{ t`自定义系统（${settings.customSystems.length}）` }}</div>
        <div v-for="(system, index) in settings.customSystems" :key="system.id" class="gf-custom-item">
          <span class="gf-custom-name" :style="{ '--gf-accent': system.color }"
            >{{ system.icon }} {{ system.name }}</span
          >
          <span class="gf-flex"></span>
          <button
            class="menu_button menu_button_icon gf-copy"
            :title="t`复制系统定义`"
            @click="copySystem(index)"
          >
            <i class="fa-solid fa-copy"></i>
          </button>
          <button
            class="menu_button menu_button_icon gf-download"
            :title="t`导出为文件`"
            @click="downloadSystem(index)"
          >
            <i class="fa-solid fa-file-export"></i>
          </button>
          <button class="menu_button menu_button_icon gf-trash" :title="t`删除`" @click="removeCustomSystem(index)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
        <div class="gf-setting-row">
          <button class="menu_button" @click="openEditor(-1)">
            <i class="fa-solid fa-plus"></i>&nbsp;{{ t`新建自定义系统` }}
          </button>
          <button class="menu_button" @click="importOpen ? (importOpen = false) : openImport()">
            <i class="fa-solid fa-file-import"></i>&nbsp;{{ t`导入系统` }}
          </button>
        </div>

        <div v-if="importOpen" class="gf-import">
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`在这里粘贴他人分享的系统定义 JSON` }}</span>
            <textarea
              v-model="importText"
              class="text_input gf-textarea"
              rows="5"
              :placeholder="t`也可在上方选择 .json 文件导入`"
            ></textarea>
          </div>
          <div class="gf-setting-row">
            <input
              :key="fileInputKey"
              class="gf-import-file"
              type="file"
              accept=".json,application/json"
              @change="onImportFile"
            />
            <span class="gf-flex"></span>
            <button class="menu_button" @click="importFromText">
              <i class="fa-solid fa-file-import"></i>&nbsp;{{ t`导入` }}
            </button>
            <button class="menu_button" @click="importOpen = false">{{ t`取消` }}</button>
          </div>
        </div>

        <div v-if="editorOpen" class="gf-editor">
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`名称` }}</span>
            <input
              v-model="editor.name"
              class="text_input gf-flex-input"
              type="text"
              :placeholder="t`例如：赌徒系统`"
            />
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
            <input
              v-model="editor.shopName"
              class="text_input gf-flex-input"
              type="text"
              :placeholder="t`例如：黑市交易所`"
            />
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
            <input
              v-model="editor.levelNamesText"
              class="text_input gf-flex-input"
              type="text"
              :placeholder="t`例如：学徒,能手,宗师`"
            />
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`一句话卖点（显示在系统选择卡片上）` }}</span>
            <input
              v-model="editor.tagline"
              class="text_input gf-flex-input"
              type="text"
              :placeholder="t`例如：每个岔路口，都藏着命运的筹码`"
            />
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`系统设定（会注入提示词；以第三人称描述系统的性格与播报风格）` }}</span>
            <textarea v-model="editor.persona" class="text_input gf-textarea" rows="4"></textarea>
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`任务风格（该系统倾向发布什么类型的任务）` }}</span>
            <textarea v-model="editor.taskHint" class="text_input gf-textarea" rows="3"></textarea>
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`世界观（不随当前角色场景走的宏观设定，生成任务的取景来源）` }}</span>
            <textarea v-model="editor.worldview" class="text_input gf-textarea" rows="3"></textarea>
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`宿主长期目标（跨越单条剧情的追求，让生成内容更宽）` }}</span>
            <textarea v-model="editor.goal" class="text_input gf-textarea" rows="2"></textarea>
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`专属技能（Lv 到达自动觉醒；可配数值加成，每次任务结算时触发）` }}</span>
            <div v-for="(skill, skillIndex) in editor.skills" :key="skillIndex" class="gf-skill-editor">
              <input v-model="skill.name" class="text_input gf-flex-input" :placeholder="t`技能名`" />
              <div class="gf-setting-row">
                <span class="gf-setting-label">{{ t`觉醒等级` }}</span>
                <input v-model.number="skill.unlockLevel" class="text_input gf-number" type="number" min="1" max="99" />
                <span class="gf-setting-label">{{ t`加成` }}</span>
                <select v-model="skill.effectType" class="gf-setting-control">
                  <option value="none">{{ t`无` }}</option>
                  <option value="points">{{ t`货币` }}</option>
                  <option value="exp">{{ t`经验` }}</option>
                </select>
                <input
                  v-model.number="skill.effectAmount"
                  class="text_input gf-number"
                  type="number"
                  min="0"
                  max="9999"
                  :disabled="skill.effectType === 'none'"
                />
                <button class="menu_button gf-danger" @click="removeSkill(skillIndex)">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
              <textarea
                v-model="skill.description"
                class="text_input gf-textarea"
                rows="2"
                :placeholder="t`技能描述（给 AI 的剧情施展燃料）`"
              ></textarea>
            </div>
            <button class="menu_button" @click="addSkill">
              <i class="fa-solid fa-plus"></i>&nbsp;{{ t`添加技能` }}
            </button>
          </div>
          <div class="gf-editor-actions">
            <button class="menu_button" @click="saveCustomSystem">
              <i class="fa-solid fa-floppy-disk"></i>&nbsp;{{ t`保存` }}
            </button>
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
import { deserializeSystem, serializeSystem } from '@/util/system-exchange';

const game = useGameStore();
const { settings } = storeToRefs(useSettingsStore());

const editorOpen = ref(false);
const importOpen = ref(false);
const importText = ref('');
const fileInputKey = ref(0);
/** >=0 表示在编辑已有自定义系统的下标 */
const editorIndex = ref(-1);
const editor = reactive(emptyEditor());

interface SkillDraft {
  name: string;
  description: string;
  unlockLevel: number;
  effectType: 'points' | 'exp' | 'none';
  effectAmount: number;
}

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
    tagline: '',
    persona: '',
    taskHint: '',
    worldview: '',
    goal: '',
    skills: [] as SkillDraft[],
  };
}

function addSkill(): void {
  editor.skills.push({ name: '', description: '', unlockLevel: 1, effectType: 'none', effectAmount: 0 });
}

function removeSkill(index: number): void {
  editor.skills.splice(index, 1);
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
      tagline: system.tagline,
      persona: system.persona,
      taskHint: system.taskHint,
      worldview: system.worldview,
      goal: system.goal,
      skills: system.skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        unlockLevel: skill.unlockLevel,
        effectType: skill.effect?.type ?? 'none',
        effectAmount: skill.effect?.amount ?? 0,
      })),
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
  const skills = editor.skills
    .filter(skill => skill.name.trim())
    .map(skill => ({
      name: skill.name.trim(),
      description: skill.description.trim(),
      unlockLevel: _.clamp(Math.round(skill.unlockLevel) || 1, 1, 99),
      effect: {
        type: skill.effectType,
        amount: skill.effectType === 'none' ? 0 : Math.max(0, Math.round(skill.effectAmount) || 0),
      },
    }));
  const candidate: SystemDef = {
    id:
      editorIndex.value >= 0 ? settings.value.customSystems[editorIndex.value].id : `custom_${Date.now().toString(36)}`,
    name: editor.name.trim() || t`未命名系统`,
    icon: editor.icon.trim() || '✨',
    color: editor.color,
    currencyName: editor.currencyName.trim() || '积分',
    tagline: editor.tagline.trim(),
    persona: editor.persona.trim(),
    taskHint: editor.taskHint.trim(),
    worldview: editor.worldview.trim(),
    goal: editor.goal.trim(),
    skills,
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

async function removeCustomSystem(index: number): Promise<void> {
  const target = settings.value.customSystems[index];
  if (!target) {
    return;
  }
  // 自定义系统定义是用户手工打造的，误删无法找回，先确认
  const context = window.SillyTavern?.getContext?.();
  const result = await context?.callGenericPopup?.(
    t`确定删除自定义系统「${target.name}」？该操作不可恢复（已分享的 JSON 可重新导入）`,
    context.POPUP_TYPE.CONFIRM,
  );
  // 安全方向：弹窗不可用或未明确确认都不执行（防 context 缺失时 undefined === undefined 误判为确认）
  if (!context?.callGenericPopup || result !== context.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }
  const removed = settings.value.customSystems.splice(index, 1)[0];
  if (removed && game.state.activeSystemId === removed.id) {
    // 激活中的系统被删：保留游玩数据，仅断开绑定（面板会回到选择界面）
    game.state.activeSystemId = null;
    toastr.info(t`已解绑被删除的系统「${removed.name}」，游玩数据保留`, t`金手指系统`);
  }
}

/** 复制一个系统的可分享定义到剪贴板（导出主路径：JSON 文本可直接贴给他人） */
async function copySystem(index: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(serializeSystem(settings.value.customSystems[index]));
    toastr.success(t`系统定义已复制，可分享给他人导入`, t`金手指系统`);
  } catch {
    toastr.error(t`复制失败`, t`金手指系统`);
  }
}

/** 下载一个系统的可分享定义为一个 .json 文件（便于保存/分享） */
function downloadSystem(index: number): void {
  const system = settings.value.customSystems[index];
  const blob = new Blob([serializeSystem(system)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  // 系统名可能含路径/非法字符，净化后作为文件名，避免下载失败
  const safeName = system.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'system';
  anchor.download = `${safeName}.goldenfinger.json`;
  // 挂到 DOM 再 click：部分环境对游离节点 click 不触发下载
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toastr.success(t`系统定义已导出`, t`金手指系统`);
}

/** 打开导入区（清空上次残留） */
function openImport(): void {
  importText.value = '';
  fileInputKey.value++; // 重置文件选择框，避免选同一文件不触发 change
  importOpen.value = true;
}

function importFromText(): void {
  const text = importText.value.trim();
  if (!text) {
    toastr.error(t`请粘贴系统定义或选择文件`, t`金手指系统`);
    return;
  }
  try {
    const system = deserializeSystem(text, settings.value.customSystems);
    // 同名提醒：自定义系统可随意改名、多次导入，但同名卡在列表里易混淆，提示用户去编辑器改名
    const sameName = settings.value.customSystems.some(existing => existing.name === system.name);
    settings.value.customSystems.push(system);
    importOpen.value = false;
    importText.value = '';
    toastr.success(
      sameName ? t`已导入「${system.name}」（与已有系统同名，记得改名以免混淆）` : t`已导入「${system.name}」`,
      t`金手指系统`,
    );
  } catch (err) {
    toastr.error(`${t`导入失败，请检查 JSON 格式或字段`}\n${err instanceof Error ? err.message : String(err)}`, t`金手指系统`);
  }
}

function onImportFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }
  file
    .text()
    .then(text => {
      importText.value = text;
      importFromText();
    })
    .catch(() => toastr.error(t`读取文件失败`, t`金手指系统`));
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
  // 安全方向：弹窗不可用或未明确确认都不执行（防 context 缺失时 undefined === undefined 误判为确认）
  if (!context?.callGenericPopup || result !== context.POPUP_RESULT.AFFIRMATIVE) {
    return;
  }
  game.resetState();
  toastr.success(t`已清空`, t`金手指系统`);
}
</script>

<style scoped>
.goldenfinger-settings .checkbox_label {
  margin: 3px 0;
}

.gf-import {
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px dashed rgba(128, 128, 128, 0.35);
  border-radius: var(--gf-radius-md);
}

.gf-import-file {
  max-width: 220px;
}

.gf-skill-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px dashed rgba(128, 128, 128, 0.35);
  border-radius: var(--gf-radius-md);
}
</style>
