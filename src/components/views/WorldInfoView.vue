<template>
  <div class="gf-view">
    <!-- 生成上下文开关：控制任务/商品生成提示词里的「世界观背景」块 -->
    <GfSectionCard :title="t`生成上下文`" icon="fa-solid fa-sliders">
      <div class="gf-setting-desc">
        {{ t`控制生成任务/商品时携带的世界观背景，影响产出与剧情、世界观的贴合度。` }}
      </div>
      <label class="checkbox_label">
        <input v-model="settings.useCharCard" type="checkbox" />
        <span>{{ t`生成时包含角色卡（描述/性格/场景）` }}</span>
      </label>
      <label class="checkbox_label">
        <input v-model="settings.useWorldInfo" type="checkbox" />
        <span>{{ t`生成时包含已激活的世界书条目` }}</span>
      </label>
      <div class="gf-setting-row">
        <span class="gf-setting-label">{{ t`剧情上下文模式` }}</span>
        <select v-model="settings.contextMode" class="gf-setting-control">
          <option value="rounds">{{ t`轮数（最近 N 轮）` }}</option>
          <option value="visible_only">{{ t`可见消息（全部可见楼层）` }}</option>
        </select>
      </div>
      <div v-if="settings.contextMode === 'rounds'" class="gf-setting-row">
        <span class="gf-setting-label">{{ t`轮数（每轮=用户+助手 2 层）` }}</span>
        <input v-model.number="settings.contextRounds" class="text_input gf-number" type="number" min="1" max="30" />
      </div>
      <div class="gf-setting-desc">{{ t`任务生成参考最近剧情的取景：可见消息=全部可见楼层，轮数=最近 N 轮（剔除隐藏楼层），不逐条截断。` }}</div>
    </GfSectionCard>

    <!-- 世界书控制：逐书 关闭/默认/强制，直接用酒馆已配置的书，不必手动重录 -->
    <GfSectionCard :title="t`世界书控制`" icon="fa-solid fa-book">
      <template #extra>
        <button class="gf-link-btn" :title="t`刷新列表`" @click="refreshBooks">
          <i class="fa-solid fa-rotate"></i>
        </button>
      </template>
      <div class="gf-setting-desc">
        {{ t`逐书控制生成时携带的世界书：关闭=从生成排除，默认=跟随酒馆激活，强制=无视酒馆开关始终纳入。` }}
      </div>
      <div v-if="books.length === 0" class="gf-empty-small">
        {{ t`当前没有任何世界书。可在酒馆的世界书面板新建或导入。` }}
      </div>
      <div v-else class="gf-wi-list">
        <div
          v-for="book in sortedBooks"
          :key="book.name"
          class="gf-wi-row"
          :class="{ 'gf-wi-row--dim': !book.active && modeOf(book.name) !== 'force' }"
        >
          <i class="fa-solid fa-book-bookmark gf-wi-icon"></i>
          <span class="gf-wi-name" :title="book.name">{{ book.name }}</span>
          <span v-for="source in book.sources" :key="source" class="gf-wi-badge" :class="`gf-wi-badge--${source}`">
            {{ sourceLabel(source) }}
          </span>
          <span class="gf-flex"></span>
          <div class="gf-wi-mode">
            <button
              class="gf-wi-mode-btn"
              :class="{ active: modeOf(book.name) === 'off' }"
              :title="t`关闭：此书不参与生成`"
              @click="setMode(book.name, 'off')"
            >
              {{ t`关闭` }}
            </button>
            <button
              class="gf-wi-mode-btn"
              :class="{ active: modeOf(book.name) === 'default' }"
              :title="t`默认：跟随酒馆激活`"
              @click="setMode(book.name, 'default')"
            >
              {{ t`默认` }}
            </button>
            <button
              class="gf-wi-mode-btn"
              :class="{ active: modeOf(book.name) === 'force' }"
              :title="t`强制：始终纳入`"
              @click="setMode(book.name, 'force')"
            >
              {{ t`强制` }}
            </button>
          </div>
        </div>
      </div>
      <div class="gf-setting-desc">
        {{
          t`全部为「默认」时生成完全走酒馆原生激活；任一设为关闭/强制后，按所选书集手动组装（不读写酒馆缓存，不影响正文主生成）。`
        }}
      </div>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, watch } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { listAllWorldBooks, type WorldBookRow, type WorldBookSource } from '@/core/context-builder';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import type { WorldBookMode } from '@/type/settings';

const game = useGameStore();
const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

const books = ref<WorldBookRow[]>([]);

function refreshBooks(): void {
  books.value = listAllWorldBooks();
}

// 挂载时枚举一次；换聊天（state 整体替换）时重取；其余靠手动刷新按钮
onMounted(refreshBooks);
watch(
  () => game.state,
  () => refreshBooks(),
);

/** 当前模式：未设置即为默认 */
function modeOf(name: string): WorldBookMode {
  return settings.value.worldBookOverrides[name] ?? 'default';
}

/** 设置书模式：默认时删除键保持记录干净 */
function setMode(name: string, mode: WorldBookMode): void {
  if (mode === 'default') {
    delete settings.value.worldBookOverrides[name];
  } else {
    settings.value.worldBookOverrides[name] = mode;
  }
}

/** 参与生成的书置顶（激活中且未关闭、或被强制），其余按原序排后 */
const sortedBooks = computed<WorldBookRow[]>(() => {
  const participating = (book: WorldBookRow) =>
    (book.active && modeOf(book.name) !== 'off') || modeOf(book.name) === 'force';
  return [...books.value].sort((a, b) => Number(participating(b)) - Number(participating(a)));
});

function sourceLabel(source: WorldBookSource): string {
  if (source === 'global') {
    return t`全局`;
  }
  if (source === 'character') {
    return t`角色`;
  }
  return t`聊天`;
}
</script>

<style scoped>
.gf-wi-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.gf-wi-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: var(--gf-bg-1);
}

.gf-wi-row--dim {
  opacity: 0.5;
}

.gf-wi-icon {
  font-size: 11px;
  color: var(--gf-text-2);
  flex: none;
}

.gf-wi-name {
  font-size: 12.5px;
  color: var(--gf-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.gf-wi-badge {
  font-size: 10px;
  line-height: 1;
  padding: 3px 7px;
  border: 1px solid var(--gf-border);
  border-radius: 999px;
  color: var(--gf-text-2);
  flex: none;
}

.gf-wi-badge--global {
  color: var(--gf-accent);
  border-color: color-mix(in srgb, var(--gf-accent) 45%, transparent);
}

.gf-wi-badge--character {
  color: var(--gf-rarity-2);
  border-color: color-mix(in srgb, var(--gf-rarity-2) 45%, transparent);
}

.gf-wi-badge--chat {
  color: var(--gf-rarity-3);
  border-color: color-mix(in srgb, var(--gf-rarity-3) 45%, transparent);
}

.gf-wi-mode {
  display: flex;
  gap: 2px;
  flex: none;
}

.gf-wi-mode-btn {
  padding: 2px 7px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--gf-border);
  border-radius: 4px;
  background: none;
  color: var(--gf-text-2);
  cursor: pointer;
  white-space: nowrap;
}

.gf-wi-mode-btn:hover {
  color: var(--gf-text-1);
}

.gf-wi-mode-btn.active {
  color: #fff;
  background: var(--gf-accent);
  border-color: var(--gf-accent);
}
</style>
