import { saveSettingsDebounced } from '@sillytavern/script';
import { extension_settings } from '@sillytavern/scripts/extensions';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { SCHEMA_VERSION, Settings, setting_field } from '@/type/settings';
import { validateInplace } from '@/util/zod';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(validateInplace(Settings, _.get(extension_settings, setting_field)));

  watch(
    settings,
    new_settings => {
      new_settings.schema_version = SCHEMA_VERSION;
      _.set(extension_settings, setting_field, klona(new_settings));
      saveSettingsDebounced();
    },
    { deep: true },
  );

  return { settings };
});
