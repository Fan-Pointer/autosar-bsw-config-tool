<template>
  <PortalLayout
    ><section class="pending">
      <span class="pending-mark" aria-hidden="true">{{ title === '知识库' ? '▤' : '◇' }}</span>
      <p class="eyebrow">OneSAR · {{ title }}</p>
      <h1>待更新</h1>
      <p>{{ title }}正在准备中，欢迎稍后再来。</p>
      <RouterLink to="/">← 返回首页</RouterLink>
    </section></PortalLayout
  >
</template>
<script setup lang="ts">
import PortalLayout from '@/ui/Portal/PortalLayout.vue';
defineProps<{ title: string }>();
</script>
<style scoped>
.pending {
  text-align: center;
  padding: 80px 16px 110px;
}
.pending-mark {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  margin: 0 auto 28px;
  border-radius: 20px;
  color: #1558c4;
  background: #eef5ff;
  font-size: 34px;
}
.eyebrow {
  font-size: 14px;
  color: #1558c4 !important;
}
h1 {
  font-size: 42px;
  margin: 14px 0;
  font-weight: 650;
}
.pending p {
  color: #64748b;
  line-height: 1.8;
}
.pending a {
  display: inline-block;
  margin-top: 22px;
  padding: 12px 22px;
  border-radius: 8px;
  background: #1558c4;
  color: white;
  text-decoration: none;
}
</style>
