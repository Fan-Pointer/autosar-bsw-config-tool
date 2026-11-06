import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useConfigStore } from '@/stores/configStore';

/** Open saved projects with visible progress and errors, including route-resource failures.
 * @returns Navigation actions and transient display state; does not alter stored configurations.
 */
export function useProjectNavigation() {
  const store = useConfigStore(),
    router = useRouter();
  const opening = ref(false),
    navigationError = ref('');
  async function navigate(activate?: () => Promise<boolean>): Promise<void> {
    if (opening.value) return;
    opening.value = true;
    navigationError.value = '';
    try {
      if (!(await store.initialize())) throw new Error(store.error ?? '工程库读取失败');
      if (activate && !(await activate()))
        throw new Error(store.projectError ?? store.error ?? '工程暂时无法打开，请重试');
      await router.push('/workspace');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      navigationError.value = /fetch dynamically imported|module script|Loading chunk/i.test(
        message
      )
        ? '配置页面加载失败，请刷新页面后重试。已保存的工程数据仍然保留。'
        : `打开失败：${message}`;
    } finally {
      opening.value = false;
    }
  }
  return {
    opening,
    navigationError,
    enterWorkspace: () => navigate(),
    openProject: (uuid: string) => navigate(() => store.openProject(uuid)),
    openSet: (uuid: string) => navigate(() => store.switchConfigSet(uuid)),
  };
}
