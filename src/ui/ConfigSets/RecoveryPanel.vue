<template>
  <section v-if="hasOwnershipIssues" class="recovery" aria-label="工程归属诊断">
    <strong>工程归属需要修复</strong>
    <p>共享 {{ store.ownershipDiagnosis.shared.length }} 项 · 未归属 {{ store.ownershipDiagnosis.orphan.length }} 项 · 缺失 {{ store.ownershipDiagnosis.missing.length }} 项。原数据已保留。</p>
    <p>共享模块须为各工程拆分独立副本，并同步更新容器标识与工程内引用；未归属模块须恢复工程归属。请先导出完整恢复包，勿直接删除或只修改工程名称。</p>
    <details>
      <summary>查看归属明细</summary>
      <ul>
        <li v-for="item in store.ownershipDiagnosis.shared" :key="'shared-' + item.uuid">共享：{{ item.name }}（{{ item.uuid }}）→ {{ item.projects.join('、') }}</li>
        <li v-for="item in store.ownershipDiagnosis.orphan" :key="'orphan-' + item.uuid">未归属：{{ item.name }}（{{ item.uuid }}）</li>
        <li v-for="item in store.ownershipDiagnosis.missing" :key="'missing-' + item.uuid">缺失：{{ item.uuid }} → {{ item.projects.join('、') }}</li>
      </ul>
    </details>
    <el-button @click="download">导出归属诊断与原始数据</el-button>
    <p v-if="message" role="status">{{ message }}</p>
    <a v-if="exportUrl" :href="exportUrl" :download="exportName">下载完整恢复包</a>
  </section>
  <section v-if="store.dataSafety.locked" class="recovery" aria-label="数据恢复保护">
    <div v-if="!collapsed" role="status">
      <strong>数据保护：检测到 {{ store.quarantinedSets.length }} 个不兼容条目</strong>
      <p>
        原配置库已锁定保存。可浏览兼容配置、取回原始数据，或新建独立草稿；本期不会自动迁移旧值。
      </p>
      <p v-if="store.recoveryWarning" role="alert">{{ store.recoveryWarning }}</p>
      <div class="actions">
        <el-button @click="download">导出原始数据</el-button>
        <el-button @click="details = true">查看隔离详情</el-button>
        <el-button @click="details = true">用旧版本定义只读打开</el-button>
        <el-button text @click="collapsed = true">暂时搁置</el-button>
      </div>
    </div>
    <el-button v-else text @click="collapsed = false">原库保存已锁定 · 展开恢复操作</el-button>
    <p v-if="message" role="alert">{{ message }}</p>
    <a v-if="exportUrl" :href="exportUrl" :download="exportName">下载原始恢复包 {{ exportName }}</a>
    <el-dialog v-model="details" title="隔离详情" width="min(960px, 96vw)" destroy-on-close>
      <p>原始记录仍保留在本机，未改写版本、字段或引用。</p>
      <p class="snapshot">
        永久快照：{{ store.dataSafety.snapshotKey ?? '尚无可用快照，请导出原始数据' }}
      </p>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>模块 / 版本</th>
              <th>原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in store.quarantinedSets" :key="index">
              <td>{{ entry.name }}</td>
              <td>{{ entry.moduleRef }} {{ entry.version }}</td>
              <td>{{ entry.reason }}</td>
              <td>
                <el-button v-if="entry.kind === 'configuration'" @click="openReadOnly(index)"
                  >只读查看</el-button
                >
                <span v-else>随原始数据取回</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="message" role="alert">{{ message }}</p>
      <template #footer>
        <el-button @click="download">导出原始数据</el-button>
        <el-button :disabled="!exported || !store.dataSafety.snapshotKey" @click="deleteSnapshot"
          >删除快照…</el-button
        >
        <el-button @click="details = false">关闭</el-button>
        <p class="hint">删除副本前需导出并自行确认文件可用；不会解锁或删除原配置库。</p>
      </template>
    </el-dialog>
    <el-dialog
      v-model="reading"
      title="历史配置 · 只读查看"
      width="min(1100px, 96vw)"
      destroy-on-close
    >
      <template v-if="readOnly">
        <p>
          {{ readOnly.config.name }} · {{ readOnly.module.shortName }} {{ readOnly.module.version }}
        </p>
        <p>
          使用项目 Git 历史中的原定义，仅用于取回旧值，不代表官方 4.4.0
          配置。编辑、保存和业务导出均不可用。
        </p>
        <div class="readonly-layout">
          <nav aria-label="历史容器树">
            <button
              v-for="entry in entries"
              :key="entry.container.uuid"
              :aria-current="entry.container.uuid === selected ? 'true' : undefined"
              @click="selected = entry.container.uuid"
            >
              {{ entry.path }}
            </button>
          </nav>
          <div v-if="selectedEntry" class="table-scroll" aria-label="历史参数原值">
            <h3>{{ selectedEntry.path }}</h3>
            <table>
              <thead>
                <tr>
                  <th>字段</th>
                  <th>原值</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="[key, value] in selectedEntry.container.parameters" :key="key">
                  <td>
                    {{
                      selectedEntry.definition.parameters.find((p) => p.uuid === key)?.shortName ??
                      key
                    }}
                  </td>
                  <td>{{ display(value.value) }}</td>
                  <td>{{ value.isConfigured ? '已配置' : '未确认' }}</td>
                </tr>
                <tr v-for="[key, value] in selectedEntry.container.references" :key="key">
                  <td>
                    {{
                      selectedEntry.definition.references.find((r) => r.uuid === key)?.shortName ??
                      key
                    }}
                  </td>
                  <td>
                    {{
                      entries.find((e) => e.container.uuid === value.targetUuid)?.path ??
                      value.targetUuid
                    }}
                  </td>
                  <td>引用原值</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button disabled>编辑</el-button><el-button disabled>保存</el-button
        ><el-button disabled>导出配置</el-button>
        <el-button @click="reading = false">关闭只读视图</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import { collectContainers } from '@/core/config/ConfigTraversal';

const store = useConfigStore();
const hasOwnershipIssues = computed(() => Object.values(store.ownershipDiagnosis).some((items) => items.length));
const collapsed = ref(false),
  details = ref(false),
  reading = ref(false),
  exported = ref(false);
const message = ref(''),
  selected = ref('');
const exportUrl = ref(''),
  exportName = ref('');
onUnmounted(() => {
  if (exportUrl.value) URL.revokeObjectURL(exportUrl.value);
});
const readOnly = ref<Awaited<ReturnType<typeof store.openQuarantinedReadOnly>>>();
const entries = computed(() =>
  readOnly.value ? collectContainers(readOnly.value.config, readOnly.value.module) : []
);
const selectedEntry = computed(() =>
  entries.value.find((entry) => entry.container.uuid === selected.value)
);
function display(value: unknown): string {
  return value === undefined ? '未设置' : typeof value === 'string' ? value : JSON.stringify(value);
}
async function download(): Promise<void> {
  message.value = '';
  try {
    const blob = await store.exportRawLibrary();
    if (exportUrl.value) URL.revokeObjectURL(exportUrl.value);
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a');
    exportUrl.value = url;
    exportName.value = `autosar-raw-recovery-${Date.now()}.json`;
    anchor.href = url;
    anchor.download = exportName.value;
    anchor.click();
    exported.value = true;
    message.value = '已发起原始数据下载，请确认文件已保存且可读取。原数据未改写。';
  } catch (reason) {
    message.value = String(reason);
  }
}
async function openReadOnly(index: number): Promise<void> {
  message.value = '';
  try {
    readOnly.value = await store.openQuarantinedReadOnly(index);
    selected.value = readOnly.value.config.containers[0]?.uuid ?? '';
    reading.value = true;
  } catch (reason) {
    message.value = String(reason);
  }
}
async function deleteSnapshot(): Promise<void> {
  const key = store.dataSafety.snapshotKey;
  if (!key || !exported.value) return;
  try {
    await ElMessageBox.confirm(
      '请先确认导出的原始数据文件已经保存在本机，且可以读取。是否已确认？',
      '确认已取回数据',
      { confirmButtonText: '已确认文件可用', cancelButtonText: '取消' }
    );
    await ElMessageBox.confirm(
      `永久删除恢复快照 ${key}？此操作无法撤销，原配置库保持锁定不变。`,
      '删除快照',
      { confirmButtonText: '永久删除此快照', cancelButtonText: '保留', type: 'warning' }
    );
    await store.deleteRecoverySnapshot(key);
    message.value = '快照副本已删除，原库仍锁定；下次启动检测到不兼容数据时会重新建立保护副本。';
  } catch (reason) {
    if (reason !== 'cancel' && reason !== 'close') message.value = String(reason);
  }
}
</script>

<style scoped>
.recovery {
  padding: 12px 18px;
  background: var(--color-panel);
  border-bottom: 2px solid #bc8628;
  font-size: 13px;
  line-height: 1.5;
}
.recovery p {
  margin: 6px 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions .el-button {
  margin-left: 0;
}
.snapshot,
.hint {
  overflow-wrap: anywhere;
  color: var(--color-muted);
}
.table-scroll {
  overflow: auto;
  max-height: 55vh;
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
td,
th {
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
  overflow-wrap: anywhere;
}
.readonly-layout {
  display: grid;
  grid-template-columns: minmax(180px, 30%) minmax(0, 1fr);
  gap: 16px;
}
.readonly-layout nav {
  max-height: 55vh;
  overflow: auto;
}
nav button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  overflow-wrap: anywhere;
  cursor: pointer;
}
nav button[aria-current='true'] {
  background: var(--color-selected);
}
@media (max-width: 768px) {
  .readonly-layout {
    grid-template-columns: 1fr;
  }
  .readonly-layout nav {
    max-height: 160px;
  }
}
</style>
