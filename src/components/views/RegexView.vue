<template>
  <div class="gf-view">
    <!-- 楼层过滤正则：规则存在全局 settings.storyFilterRules，与绑定系统无关 -->
    <GfSectionCard :title="t`楼层过滤正则`" icon="fa-solid fa-filter">
      <!-- 走酒馆正则开关：直接用酒馆已配置的全局/预设/角色卡正则脚本，不必手动重录 -->
      <label
        class="checkbox_label gf-stregex-row"
        :title="t`开：每条参考楼层先过酒馆已配置的正则，再走本页规则；关：跳过酒馆正则，只用本页规则`"
      >
        <input v-model="settings.stRegexEnabled" type="checkbox" />
        <span>{{ t`走酒馆正则` }}</span>
      </label>
      <div class="gf-setting-desc">
        {{ t`开：生成前每条参考楼层先过酒馆全局/预设/角色卡正则，再走本页规则；关：跳过酒馆正则，只用本页规则` }}
      </div>
      <div class="gf-setting-desc">
        {{
          t`生成任务/商品前对参考楼层执行：tag 剥成对标签、regex 正则替换、extract 只保留指定标签内容（仅 AI 楼层）。`
        }}
      </div>
      <div v-for="(rule, index) in settings.storyFilterRules" :key="index" class="gf-rule-card">
        <div class="gf-rule-head">
          <select class="gf-rule-type" :value="rule.type" @change="changeFilterRuleType(index, $event)">
            <option value="tag">tag</option>
            <option value="regex">regex</option>
            <option value="extract">extract</option>
          </select>
          <span class="gf-flex"></span>
          <button class="gf-link-btn" :title="t`删除`" @click="settings.storyFilterRules.splice(index, 1)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
        <template v-if="rule.type === 'tag'">
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`起始标签` }}</span>
            <input v-model="rule.start" class="text_input gf-flex-input" type="text" placeholder="&lt;think&gt;" />
          </div>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`结束标签` }}</span>
            <input v-model="rule.end" class="text_input gf-flex-input" type="text" placeholder="&lt;/think&gt;" />
          </div>
        </template>
        <template v-else-if="rule.type === 'regex'">
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`正则（自动挂 gs 标志）` }}</span>
            <input
              v-model="rule.pattern"
              class="text_input gf-flex-input"
              type="text"
              placeholder="&lt;Status&gt;[\s\S]*?&lt;/Status&gt;"
            />
          </div>
          <div class="gf-setting-col">
            <span class="gf-setting-label">{{ t`替换为（留空 = 删除）` }}</span>
            <input v-model="rule.replace" class="text_input gf-flex-input" type="text" />
          </div>
        </template>
        <template v-else>
          <div class="gf-setting-row">
            <span class="gf-setting-label">{{ t`标签名` }}</span>
            <input v-model="rule.tagName" class="text_input gf-flex-input" type="text" placeholder="thinking" />
          </div>
        </template>
      </div>
      <div v-if="settings.storyFilterRules.length === 0" class="gf-empty-small">
        {{ t`暂无过滤规则，参考楼层会原样进入生成上下文。` }}
      </div>
      <button class="menu_button" @click="addFilterRule">
        <i class="fa-solid fa-plus"></i>&nbsp;{{ t`添加规则` }}
      </button>
    </GfSectionCard>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import GfSectionCard from '@/components/shared/GfSectionCard.vue';
import { useSettingsStore } from '@/store/settings';

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);

// 类型切换必须整体替换规则对象：discriminatedUnion 缺字段会让存档 zod 解析失败
function addFilterRule(): void {
  settings.value.storyFilterRules.push({ type: 'regex', pattern: '', replace: '' });
}

function changeFilterRuleType(index: number, event: Event): void {
  const type = (event.target as HTMLSelectElement).value;
  const rules = settings.value.storyFilterRules;
  rules[index] =
    type === 'tag'
      ? { type: 'tag', start: '', end: '' }
      : type === 'extract'
        ? { type: 'extract', tagName: '' }
        : { type: 'regex', pattern: '', replace: '' };
}
</script>

<style scoped>
.gf-stregex-row {
  margin: 0 0 6px;
  font-weight: 600;
}

.gf-rule-card {
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-radius-sm);
  background: var(--gf-bg-1);
}

.gf-rule-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.gf-rule-type {
  width: 100px;
}
</style>
