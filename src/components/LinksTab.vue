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
      <a
        class="link-item"
        href="https://github.com/wparad/hide-and-seek/blob/main/data/zvv.pdf?raw=true"
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">ZVV Map (repo backup)</span>
        <span class="link-arrow">→</span>
      </a>
    </section>

    <section class="links-section">
      <h2 class="section-title">Tools</h2>
      <a class="link-item" href="https://overpass-turbo.osm.ch/#" target="_blank" rel="noopener">
        <span class="link-label">Overpass Turbo (OSM)</span>
        <span class="link-arrow">→</span>
      </a>
      <a
        class="link-item"
        href="https://online.fahrplaninfo.zvv.ch/frame_hst3.php?lang=en&hstNr=11347&hstName="
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">Line/Station Validator</span>
        <span class="link-arrow">→</span>
      </a>
    </section>

    <footer class="attribution">
      Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.
      Tiles by <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>.
    </footer>
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

.attribution {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
  font-size: 11px;
  color: #999;
  line-height: 1.6;
}

.attribution a {
  color: #666;
  text-decoration: underline;
}
</style>
