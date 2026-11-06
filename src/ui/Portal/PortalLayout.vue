<template>
  <div class="portal">
    <a class="skip-link" href="#portal-main">跳到主要内容</a>
    <header class="portal-header">
      <div class="portal-wrap header-inner">
        <RouterLink to="/" class="portal-brand" aria-label="航海科技首页">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <path d="M18 4 6 24h12V4Zm3 6v14h10L21 10Z" fill="currentColor" />
            <path
              d="M5 28c4 4 22 4 26 0"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>
          <strong>航海科技</strong><span>OneSAR</span>
        </RouterLink>
        <nav aria-label="主导航">
          <RouterLink to="/" exact-active-class="selected">首页</RouterLink
          ><RouterLink to="/knowledge">知识库</RouterLink
          ><RouterLink to="/subscription">订阅中心</RouterLink>
        </nav>
      </div>
    </header>
    <main id="portal-main" class="portal-wrap portal-main"><slot /></main>
    <footer>
      <div class="portal-wrap footer-inner">
        <div><strong>OneSAR</strong><span>航海科技 · 汽车软件开发工具</span></div>
        <p>专注配置，让开发更从容。</p>
      </div>
    </footer>
  </div>
</template>
<style scoped>
.portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #142a47;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --portal-blue: #1558c4;
}
.portal-wrap {
  width: min(1240px, calc(100% - 88px));
  margin-inline: auto;
}
.portal-header {
  background: #fff;
  border-bottom: 1px solid #e5ebf3;
}
.header-inner {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.portal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: #184f9d;
}
.portal-brand svg {
  width: 30px;
  height: 30px;
}
.portal-brand strong {
  font-size: 19px;
  letter-spacing: 0.06em;
}
.portal-brand span {
  font-size: 16px;
  border-left: 1px solid #dce4ef;
  padding-left: 18px;
  margin-left: 8px;
  color: #203853;
  font-weight: 650;
}
nav {
  display: flex;
  gap: 28px;
}
nav a {
  color: #5b6c83;
  text-decoration: none;
  font-size: 14px;
  padding: 12px 0;
}
nav a.selected,
nav a:hover,
nav a.router-link-active {
  color: #1558c4;
}
.portal-main {
  flex: 1;
  padding-top: 24px;
  padding-bottom: 44px;
}
footer {
  background: #f8fafd;
  border-top: 1px solid #e0e8f1;
}
.footer-inner {
  min-height: 90px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  color: #64748b;
  font-size: 12px;
}
.footer-inner strong {
  color: #163654;
  font-size: 22px;
  margin-right: 20px;
}
.footer-inner p {
  margin: 0;
}
.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  padding: 10px;
  background: white;
  z-index: 10;
  transform: translateY(-200%);
}
.skip-link:focus {
  transform: none;
}
a:focus-visible {
  outline: 2px solid #1558c4;
  outline-offset: 4px;
  border-radius: 3px;
}
@media (max-width: 700px) {
  .portal-wrap {
    width: calc(100% - 36px);
  }
  .header-inner {
    min-height: 68px;
    gap: 12px;
    flex-wrap: wrap;
    padding-block: 12px;
  }
  .portal-brand span {
    display: none;
  }
  .portal-brand strong {
    font-size: 18px;
  }
  nav {
    gap: 18px;
  }
  nav a {
    font-size: 13px;
  }
  .portal-main {
    padding-block: 28px;
  }
  .footer-inner {
    align-items: flex-start;
    flex-direction: column;
    padding-block: 20px;
    gap: 8px;
  }
  .footer-inner span {
    display: block;
    margin-top: 6px;
  }
}
</style>
