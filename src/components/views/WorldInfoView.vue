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
        <span>{{ t`生成时包含世界书条目` }}</span>
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
      <div class="gf-setting-desc">
        {{ t`任务生成参考最近剧情的取景：可见消息=全部可见楼层，轮数=最近 N 轮（剔除隐藏楼层），不逐条截断。` }}
      </div>
    </GfSectionCard>

    <!-- 世界书控制：choice 式四区（设置 / 已启用 / 全局排除 / 未启用），逐书四态 + 逐条勾选 -->
    <GfSectionCard :title="t`世界书控制`" icon="fa-solid fa-book">
      <template #extra>
        <button class="gf-link-btn" :title="t`刷新列表`" @click="refreshBooks">
          <i class="fa-solid fa-rotate"></i>
        </button>
      </template>
      <div class="gf-setting-desc">
        {{
          t`逐书控制生成时携带的世界书。四态：关闭=整本排除，默认=跟随酒馆激活，强制=无视关闭态始终纳入，自定义=按条目手动勾选。`
        }}
      </div>

      <!-- 设置：总开关 -->
      <label class="checkbox_label">
        <input v-model="settings.useWorldInfo" type="checkbox" />
        <span>{{ t`启用世界书参与生成` }}</span>
      </label>

      <!-- 已启用的世界书（激活书 + 显式启用书），行可展开显示条目 -->
      <div class="gf-wi-subtitle">{{ t`已启用的世界书` }}（{{ activeBooks.length }}）</div>
      <div v-if="activeBooks.length === 0" class="gf-empty-small">
        {{ t`当前没有参与生成的世界书。在下方「未启用」列表启用，或到酒馆的世界书面板激活。` }}
      </div>
      <div v-else class="gf-wi-list">
        <template v-for="book in activeBooks" :key="book.name">
          <div
            class="gf-wi-row"
            :class="{ 'gf-wi-row--dim': !isParticipating(book.name) }"
            @click="toggleBookExpand(book.name)"
          >
            <i class="fa-solid" :class="expanded.has(book.name) ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
            <span class="gf-wi-light" :class="{ active: isParticipating(book.name) }"></span>
            <span class="gf-wi-name" :title="book.name">{{ book.name }}</span>
            <span v-for="source in book.sources" :key="source" class="gf-wi-badge" :class="`gf-wi-badge--${source}`">
              {{ sourceLabel(source) }}
            </span>
            <span v-if="isEnabled(book.name)" class="gf-wi-badge gf-wi-badge--enabled">{{ t`显式启用` }}</span>
            <span v-if="isGlobalExcluded(book.name)" class="gf-wi-badge gf-wi-badge--excluded">{{ t`全局排除` }}</span>
            <span class="gf-flex"></span>
            <!-- 四态循环钩：off → follow → force → custom → off -->
            <span
              class="gf-wi-mode"
              :class="[`mode-${modeOf(book.name)}`, { 'mode-disabled': isGlobalExcluded(book.name) }]"
              :title="modeTitle(book.name)"
              @click.stop="cycleMode(book.name)"
            >
              <i v-if="modeOf(book.name) === 'force'" class="fa-solid fa-check gf-wi-mode-check"></i>
              <span v-else-if="modeOf(book.name) !== 'off'" class="gf-wi-mode-block"></span>
            </span>
            <button
              v-if="isEnabled(book.name)"
              class="gf-wi-btn"
              :title="t`从显式启用列表移除，回到未启用区`"
              @click.stop="disableBook(book.name)"
            >
              {{ t`移除` }}
            </button>
          </div>
          <!-- 展开：逐条勾选 -->
          <div v-if="expanded.has(book.name) && entries[book.name]" class="gf-wi-entries">
            <div
              v-for="entry in entries[book.name]"
              :key="String(entry.uid)"
              class="gf-wi-entry"
              :class="{ 'gf-wi-entry--disabled': !isEntryOn(book.name, entry) }"
            >
              <span class="gf-wi-entry-state">{{ entryStateIcon(entry) }}</span>
              <span class="gf-wi-entry-name">{{ entry.comment || entry.key?.[0] || `#${entry.uid}` }}</span>
              <input
                type="checkbox"
                :checked="isEntryOn(book.name, entry)"
                :title="t`点击开启/关闭该条目（进入自定义模式）`"
                @change="toggleEntry(book.name, entry)"
              />
            </div>
            <div v-if="entries[book.name].length === 0" class="gf-empty-small">
              {{ t`此书没有条目。` }}
            </div>
          </div>
        </template>
      </div>

      <!-- 全局排除 -->
      <div class="gf-wi-subtitle">{{ t`全局排除` }}</div>
      <div v-if="globalExcludedBooks.length === 0" class="gf-empty-small">
        {{ t`未设置全局排除。全局排除的世界书在所有聊天中永久不参与生成。` }}
      </div>
      <div v-else class="gf-wi-list">
        <div v-for="name in globalExcludedBooks" :key="name" class="gf-wi-row gf-wi-row--excluded-global">
          <i class="fa-solid fa-ban gf-wi-icon"></i>
          <span class="gf-wi-name">{{ name }}</span>
          <span class="gf-flex"></span>
          <button class="gf-wi-btn" @click.stop="removeGlobalExcl(name)">{{ t`移除` }}</button>
        </div>
      </div>
      <input v-model="globalExclSearch" class="text_input gf-wi-search" :placeholder="t`搜索要全局排除的世界书名`" />
      <div class="gf-wi-list gf-wi-scroll">
        <div v-if="availableGlobalExclBooks.length === 0" class="gf-empty-small">{{ t`无可排除的世界书` }}</div>
        <div
          v-for="name in availableGlobalExclBooks"
          :key="name"
          class="gf-wi-row gf-wi-row--available"
          @click.stop="addGlobalExcl(name)"
        >
          <i class="fa-solid fa-book-bookmark gf-wi-icon"></i>
          <span class="gf-wi-name">{{ name }}</span>
          <span class="gf-flex"></span>
          <button class="gf-wi-btn" @click.stop="addGlobalExcl(name)">{{ t`添加` }}</button>
        </div>
      </div>

      <!-- 未启用的世界书 -->
      <div class="gf-wi-subtitle">{{ t`未启用的世界书` }}</div>
      <div v-if="inactiveBooks.length === 0" class="gf-empty-small">
        {{ t`所有世界书都已启用。` }}
      </div>
      <input v-model="inactiveSearch" class="text_input gf-wi-search" :placeholder="t`搜索世界书名`" />
      <div class="gf-wi-list gf-wi-scroll">
        <div v-if="filteredInactiveBooks.length === 0" class="gf-empty-small">{{ t`无匹配的世界书` }}</div>
        <div
          v-for="book in filteredInactiveBooks"
          :key="book.name"
          class="gf-wi-row gf-wi-row--inactive"
          @click.stop="enableBook(book.name)"
        >
          <span class="gf-wi-light"></span>
          <span class="gf-wi-name">{{ book.name }}</span>
          <span class="gf-flex"></span>
          <button class="gf-wi-btn" @click.stop="enableBook(book.name)">{{ t`启用` }}</button>
        </div>
      </div>

      <div class="gf-setting-desc">
        {{
          t`钩子循环条目模式：全关 → 默认（跟随酒馆）→ 全启用 → 自定义；直接勾选条目进入自定义模式逐条开关。全部为「默认」时生成完全走酒馆原生激活。`
        }}
      </div>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, watch } from 'vue';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import {
  listAllWorldBooks,
  loadWorldBookEntries,
  type WorldBookEntry,
  type WorldBookRow,
  type WorldBookSource,
} from '@/core/context-builder';
import { useGameStore } from '@/store/game';
import { useSettingsStore } from '@/store/settings';
import type { WorldBookMode } from '@/type/settings';

const game = useGameStore();
const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

const books = ref<WorldBookRow[]>([]);
const entries = ref<Record<string, WorldBookEntry[]>>({});
const expanded = ref<Set<string>>(new Set());
const globalExclSearch = ref('');
const inactiveSearch = ref('');

function refreshBooks(): void {
  books.value = listAllWorldBooks();
  // 重新枚举书后，展开中的书条目可能已变化，重载之
  void loadEntriesForExpanded();
}

async function loadEntriesForExpanded(): Promise<void> {
  for (const name of expanded.value) {
    const data = await loadWorldBookEntries(name);
    if (data) {
      entries.value = { ...entries.value, [name]: data };
    }
  }
}

async function loadEntries(name: string): Promise<void> {
  const data = await loadWorldBookEntries(name);
  if (data) {
    entries.value = { ...entries.value, [name]: data };
  }
}

// 挂载时枚举一次；换聊天（state 整体替换）时重取；其余靠手动刷新按钮
onMounted(refreshBooks);
watch(
  () => game.state,
  () => refreshBooks(),
);

const allBooks = computed(() => books.value);

/** 参与生成的书 = active（激活中且未 off 且未全局排除）或 enabled 或 force */
const activeBooks = computed<WorldBookRow[]>(() => {
  const participating = (book: WorldBookRow) =>
    (book.active || isEnabled(book.name)) && !isGlobalExcluded(book.name) && modeOf(book.name) !== 'off';
  return [...allBooks.value].filter(participating).sort((a, b) => Number(participating(b)) - Number(participating(a)));
});

const inactiveBooks = computed<WorldBookRow[]>(() => {
  const participating = (book: WorldBookRow) =>
    (book.active || isEnabled(book.name)) && !isGlobalExcluded(book.name) && modeOf(book.name) !== 'off';
  return allBooks.value.filter(book => !participating(book));
});

const globalExcludedBooks = computed(() => settings.value.worldBookGlobalExcluded);

const availableGlobalExclBooks = computed(() => {
  const excluded = new Set(globalExcludedBooks.value);
  const kw = globalExclSearch.value.trim().toLowerCase();
  return allBooks.value
    .map(book => book.name)
    .filter(name => !excluded.has(name) && (!kw || name.toLowerCase().includes(kw)));
});

const filteredInactiveBooks = computed(() => {
  const kw = inactiveSearch.value.trim().toLowerCase();
  if (!kw) return inactiveBooks.value;
  return inactiveBooks.value.filter(book => book.name.toLowerCase().includes(kw));
});

/** 当前模式：未设置即为 follow（默认） */
function modeOf(name: string): WorldBookMode {
  return settings.value.worldBookModes[name] ?? 'follow';
}

/** 设置书模式：follow 时删除键保持记录干净 */
function setMode(name: string, mode: WorldBookMode): void {
  if (mode === 'follow') {
    delete settings.value.worldBookModes[name];
  } else {
    settings.value.worldBookModes[name] = mode;
  }
}

const isEnabled = (name: string) => settings.value.worldBookEnabled.includes(name);
const isGlobalExcluded = (name: string) => settings.value.worldBookGlobalExcluded.includes(name);

/** 参与生成（点亮状态灯）：激活中且未 off/未全局排除，或 force，或显式启用 */
function isParticipating(name: string): boolean {
  if (isGlobalExcluded(name) || modeOf(name) === 'off') {
    return false;
  }
  const row = books.value.find(book => book.name === name);
  return !!row?.active || isEnabled(name) || modeOf(name) === 'force';
}

/** 四态循环：off → follow → force → custom → off（同 choice） */
function cycleMode(name: string): void {
  if (isGlobalExcluded(name)) {
    return;
  }
  const next: WorldBookMode =
    modeOf(name) === 'off'
      ? 'follow'
      : modeOf(name) === 'follow'
        ? 'force'
        : modeOf(name) === 'force'
          ? 'custom'
          : 'off';
  setMode(name, next);
}

function modeTitle(name: string): string {
  const mode = modeOf(name);
  if (mode === 'off') return t`关闭：此书不参与生成（点击：默认）`;
  if (mode === 'force') return t`强制：无视关闭态始终纳入（点击：自定义）`;
  if (mode === 'custom') return t`自定义：按条目手动勾选（点击：关闭）`;
  return t`默认：跟随酒馆激活（点击：强制）`;
}

const toggleBookExpand = (name: string) => {
  if (expanded.value.has(name)) {
    expanded.value.delete(name);
  } else {
    expanded.value.add(name);
    void loadEntries(name);
  }
};

/** 逐条勾选态：off=全空；follow=酒馆原生 disable；force=全勾；custom=按覆盖逐条（快照未覆盖保持酒馆原状） */
function isEntryOn(bookName: string, entry: WorldBookEntry): boolean {
  const mode = modeOf(bookName);
  if (mode === 'off') return false;
  if (mode === 'force') return true;
  if (mode === 'custom') {
    const ov = settings.value.worldBookEntryOverrides[bookName]?.[String(entry.uid)];
    return typeof ov === 'boolean' ? ov : !entry.disable;
  }
  return !entry.disable;
}

/** 任意模式下勾选条目：非 custom 先快照当前显示态进 overrides 并切入 custom，再翻转所点条目 */
function toggleEntry(bookName: string, entry: WorldBookEntry): void {
  if (modeOf(bookName) !== 'custom') {
    const snap: Record<string, boolean> = {};
    for (const e of entries.value[bookName] ?? []) {
      snap[String(e.uid)] = isEntryOn(bookName, e);
    }
    settings.value.worldBookEntryOverrides[bookName] = snap;
    settings.value.worldBookModes[bookName] = 'custom';
  }
  const uid = String(entry.uid);
  const overrides = settings.value.worldBookEntryOverrides[bookName] ?? {};
  const cur = overrides[uid] ?? isEntryOn(bookName, entry);
  settings.value.worldBookEntryOverrides[bookName] = { ...overrides, [uid]: !cur };
}

const enableBook = (name: string) => {
  const enabled = settings.value.worldBookEnabled;
  if (!enabled.includes(name)) enabled.push(name);
  void loadEntries(name);
  expanded.value.add(name);
};

const disableBook = (name: string) => {
  const enabled = settings.value.worldBookEnabled;
  const xi = enabled.indexOf(name);
  if (xi !== -1) enabled.splice(xi, 1);
};

const addGlobalExcl = (name: string) => {
  if (!name) return;
  const list = settings.value.worldBookGlobalExcluded;
  if (!list.includes(name)) list.push(name);
};

const removeGlobalExcl = (name: string) => {
  const list = settings.value.worldBookGlobalExcluded;
  const idx = list.indexOf(name);
  if (idx !== -1) list.splice(idx, 1);
};

function sourceLabel(source: WorldBookSource): string {
  if (source === 'global') return t`全局`;
  if (source === 'character') return t`角色`;
  return t`聊天`;
}

function entryStateIcon(entry: WorldBookEntry): string {
  if (entry.constant) return '🔵';
  if (entry.vectorized) return '🔗';
  return '🟢';
}
</script>

<style scoped>
.gf-wi-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.gf-wi-subtitle {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gf-text-1);
  margin: 12px 0 6px;
}

.gf-wi-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: var(--gf-bg-1);
  cursor: pointer;
}

.gf-wi-row:hover {
  background: var(--gf-bg-2);
}

.gf-wi-row--dim {
  opacity: 0.5;
}

.gf-wi-row--inactive {
  opacity: 0.6;
}

.gf-wi-row--excluded-global {
  background: color-mix(in srgb, var(--gf-rarity-3) 8%, var(--gf-bg-1));
  border-color: color-mix(in srgb, var(--gf-rarity-3) 40%, var(--gf-border));
}

.gf-wi-row--available {
  cursor: pointer;
}

.gf-wi-icon {
  font-size: 11px;
  color: var(--gf-text-2);
  flex: none;
}

.gf-wi-light {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--gf-bg-2);
  flex: none;
  border: 1px solid var(--gf-border);
}

.gf-wi-light.active {
  background: var(--gf-accent);
  box-shadow: 0 0 6px var(--gf-accent);
  border-color: var(--gf-accent);
}

.gf-wi-name {
  font-size: 12.5px;
  color: var(--gf-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
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

.gf-wi-badge--enabled {
  color: var(--gf-accent);
  border-color: color-mix(in srgb, var(--gf-accent) 45%, transparent);
}

.gf-wi-badge--excluded {
  color: var(--gf-rarity-3);
  border-color: color-mix(in srgb, var(--gf-rarity-3) 45%, transparent);
}

/* 四态钩：空框（off）→ 内嵌块（follow，默认）→ ☑️（force）→ 横杠（custom） */
.gf-wi-mode {
  width: 14px;
  height: 14px;
  border: 1px solid var(--gf-border);
  border-radius: 3px;
  background: var(--gf-bg-1);
  position: relative;
  flex: none;
  cursor: pointer;
}

.gf-wi-mode.mode-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.gf-wi-mode-block {
  position: absolute;
  display: none;
}

.gf-wi-mode.mode-follow .gf-wi-mode-block {
  display: block;
  inset: 3px;
  background: var(--gf-text-2);
}

.gf-wi-mode.mode-custom .gf-wi-mode-block {
  display: block;
  inset: 5px 3px;
  background: var(--gf-text-2);
}

.gf-wi-mode-check {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--gf-text-1);
}

.gf-wi-btn {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.4;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: var(--gf-bg-2);
  color: var(--gf-text-2);
  cursor: pointer;
  flex: none;
  white-space: nowrap;
}

.gf-wi-btn:hover {
  color: var(--gf-text-1);
  border-color: var(--gf-accent);
}

.gf-wi-entries {
  margin-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 4px 10px;
  border-left: 1px solid var(--gf-border);
}

.gf-wi-entry {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 8px;
  font-size: 11.5px;
}

.gf-wi-entry--disabled {
  opacity: 0.4;
}

.gf-wi-entry-state {
  font-size: 12px;
  flex: none;
  width: 14px;
  text-align: center;
}

.gf-wi-entry-name {
  flex: 1;
  color: var(--gf-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gf-wi-entry input[type='checkbox'] {
  flex: none;
}

.gf-wi-search {
  width: 100%;
  margin-bottom: 6px;
}

.gf-wi-scroll {
  max-height: 180px;
  overflow-y: auto;
}

.gf-wi-scroll .gf-wi-row {
  flex-shrink: 0;
}
</style>
