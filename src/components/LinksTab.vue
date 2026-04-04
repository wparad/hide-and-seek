<template>
  <div class="links-tab">
    <section class="links-section">
      <h2 class="section-title">ZVV</h2>
      <a
        class="link-item"
        href="https://www.zvv.ch/content/dam/zvv/publikationen/zonen/zvv-tarifzonen.pdf"
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">ZVV Tarifzonen (PDF)</span>
        <span class="link-arrow">→</span>
      </a>
    </section>

    <section class="links-section">
      <h2 class="section-title">Tools</h2>
      <a class="link-item" href="https://overpass-turbo.osm.ch/#" target="_blank" rel="noopener">
        <span class="link-label">Overpass Turbo (OSM)</span>
        <span class="link-arrow">→</span>
      </a>
    </section>
  </div>
</template>

<style scoped>
.links-tab {
  padding: 16px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.links-section {
  margin-bottom: 24px;
}

.link-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  text-decoration: none;
  color: #1a1a1a;
  font-size: 15px;
  margin-bottom: 8px;
  -webkit-tap-highlight-color: transparent;
}

.link-item:active {
  background: #ebebeb;
}

.link-arrow {
  color: #999;
  font-size: 16px;
}
</style>
