import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import ElementPlus from 'element-plus';
import localforage from 'localforage';
import 'element-plus/dist/index.css';
import '../src/ui/Theme/theme.css';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';

if (location.origin !== 'http://localhost:3001') throw new Error('Isolated test origin only');
const memory = new Map();
localforage.createInstance = () => ({
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: unknown) => { memory.set(key, structuredClone(value)); return value; },
}) as LocalForage;
const { default: WorkspaceView } = await import('../src/views/WorkspaceView.vue');
const { useConfigStore } = await import('../src/stores/configStore');
function definition(): BswmdModule {
  const leaf = (name: string, lower = 1): BswmdContainer => ({
    uuid: name,
    shortName: name,
    definitionPath: `/AUTOSAR/EcucDefs/Edit/${name}`,
    multiplicity: { lower, upper: 1 },
    parameters: [],
    references: [],
    subContainers: [],
  });
  const root = leaf('Root');
  root.multiplicity.upper = 'unbounded';
  root.parameters = [
    {
      uuid: 'flag',
      shortName: 'Enabled',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
      description: 'False is an explicit, valid configured value.',
    },
    {
      uuid: 'count',
      shortName: 'Count',
      type: 'INTEGER',
      defaultValue: 0,
      min: 0,
      max: 100,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
    {
      uuid: 'optional',
      shortName: 'OptionalText',
      type: 'STRING',
      isOptional: true,
      configClass: 'PRE_COMPILE',
    },
  ];
  root.references = [
    {
      uuid: 'memory',
      shortName: 'MemoryRef',
      destinationContainerType: 'First',
      destinationRefs: ['/AUTOSAR/EcucDefs/Edit/First', '/AUTOSAR/EcucDefs/Edit/Second'],
      kind: 'choice',
      isOptional: true,
    },
    {
      uuid: 'create',
      shortName: 'NewTargetRef',
      destinationContainerType: 'NewTarget',
      isOptional: true,
    },
    { uuid: 'inbound', shortName: 'CandidateRef', destinationContainerType: 'A', isOptional: true },
  ];
  const a = leaf('A', 0),
    b = leaf('B', 0);
  a.parameters = [
    {
      uuid: 'a-value',
      shortName: 'CandidateFlag',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
  ];
  a.references = [
    {
      uuid: 'a-ref',
      shortName: 'CandidateMemoryRef',
      destinationContainerType: 'First',
      isOptional: true,
    },
  ];
  b.parameters = [
    {
      uuid: 'b-value',
      shortName: 'OtherFlag',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
  ];
  const group = leaf('Choice');
  group.choice = { candidateRefs: ['A', 'B'] };
  group.subContainers = [a, b];
  root.subContainers = [group];
  return {
    shortName: 'Edit',
    version: '4.4.0',
    containers: [root, leaf('First'), leaf('Second'), leaf('NewTarget', 0)],
  };
}

const pinia=createPinia();
const store=useConfigStore(pinia);
await store.initialize();
await store.importModuleDefinitions([definition()]);
await store.createConfigSet('TASK-017 隔离内存验收','Edit');
const configRoot=store.config!.containers[0];
const group=configRoot.subContainers[0];
store.selectChoice(group.uuid,'A');
const candidate=group.subContainers[0];
store.selectContainer(candidate.uuid);
store.setParameterValue('a-value',false);
store.setReferenceTarget('a-ref',store.config!.containers[1].uuid);
store.selectContainer(configRoot.uuid);
store.setParameterValue('count',20);
store.setReferenceTarget('memory',store.config!.containers[1].uuid);
store.setReferenceTarget('inbound',candidate.uuid);
await store.saveConfig();
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:WorkspaceView}]});
const app=createApp({render:()=>h(RouterView)});app.use(pinia);app.use(router);app.use(ElementPlus);
await router.push('/');await router.isReady();app.mount('#app');