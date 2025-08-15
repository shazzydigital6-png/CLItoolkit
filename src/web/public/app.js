// src/web/public/app.js
class PropertyBrowser {
  constructor() {
    this.properties = [];
    this.currentIndex = 0;
    this.cache = new Map(); // uid -> { descriptions, characterCounts }
    this.bindUI();
  }

  bindUI() {
    this.$load = document.getElementById("loadBtn");
    this.$prev = document.getElementById("prevBtn");
    this.$next = document.getElementById("nextBtn");
    this.$jump = document.getElementById("jumpBtn");
    this.$jumpInput = document.getElementById("jumpInput");
    this.$display = document.getElementById("propertyDisplay");
    this.$loading = document.getElementById("loadingMsg");
    this.$error = document.getElementById("errorMsg");
    this.$title = document.getElementById("propertyTitle");
    this.$counter = document.getElementById("propertyCounter");
    this.$info = document.getElementById("propertyInfo");
    this.$grid = document.getElementById("descriptionsGrid");

    this.$load.addEventListener("click", () => this.loadProperties());
    this.$prev.addEventListener("click", () => this.previous());
    this.$next.addEventListener("click", () => this.next());
    this.$jump.addEventListener("click", () => this.jump());
    this.$jumpInput.addEventListener("keypress", (e) => e.key === "Enter" && this.jump());
  }

  async loadProperties() {
    this.showLoading(true);
    this.hideError();
    try {
      const res = await fetch("/api/properties");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load properties");
      this.properties = data.properties || [];
      this.currentIndex = 0;
      if (this.properties.length === 0) throw new Error("No properties found");
      this.render();
    } catch (e) {
      this.showError(`Failed to load properties: ${e.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.render();
    }
  }
  next() {
    if (this.currentIndex < this.properties.length - 1) {
      this.currentIndex++;
      this.render();
    }
  }
  jump() {
    const n = parseInt(this.$jumpInput.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= this.properties.length) {
      this.currentIndex = n - 1;
      this.render();
    }
  }

  async render() {
    const p = this.properties[this.currentIndex];
    if (!p) return;

    this.$display.style.display = "block";
    this.$title.textContent = p.name || "Unnamed Property";
    this.$counter.textContent = `${this.currentIndex + 1} of ${this.properties.length}`;

    const statusClass = p.isActive ? "status-active" : "status-inactive";
    const statusText = p.isActive ? "Active" : "Inactive";
    this.$info.innerHTML = `
      <p><strong>UID:</strong> ${this.escape(p.uid)}</p>
      <p><strong>Location:</strong> ${this.escape(p.address?.city || "Unknown")}, ${this.escape(p.address?.state || "Unknown")}</p>
      <p><strong>Max Guests:</strong> ${p.availability?.maxGuests ?? "Not specified"}</p>
      <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${statusText}</span></p>
    `;

    // show a skeleton while we fetch descriptions
    this.$grid.innerHTML = `<div class="description-field"><div class="field-label">Loading descriptions…</div></div>`;

    let details = this.cache.get(p.uid);
    if (!details) {
      try {
        const res = await fetch(`/api/properties/${encodeURIComponent(p.uid)}/descriptions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to load descriptions");
        details = { descriptions: data.descriptions || {}, characterCounts: data.characterCounts || {} };
        this.cache.set(p.uid, details);
      } catch (e) {
        this.$grid.innerHTML = `
          <div class="description-field">
            <div class="field-label">Descriptions</div>
            <div class="field-content empty">Unable to load descriptions (${this.escape(e.message)})</div>
          </div>`;
        this.updateControls();
        return;
      }
    }

    this.renderDescriptions(details.descriptions, details.characterCounts);
    this.updateControls();
  }

  renderDescriptions(descriptions, counts) {
    const fields = [
      ["public_name", "Public Name"],
      ["short_description", "Short Description"],
      ["long_description", "Long Description"],
      ["neighbourhood", "Neighbourhood"],
      ["space", "Space Description"],
      ["access", "Access Instructions"],
      ["transit", "Transit Information"],
    ];

    this.$grid.innerHTML = fields
      .map(([k, label]) => {
        const content = (descriptions[k] || "").toString();
        const len = counts[k] ?? content.length ?? 0;
        const empty = content.trim() === "";
        return `
          <div class="description-field">
            <div class="field-label">${label}</div>
            <div class="field-content ${empty ? "empty" : ""}">
              ${empty ? "No content available" : this.escape(content)}
            </div>
            <div class="char-count">${len} characters</div>
          </div>
        `;
      })
      .join("");
  }

  updateControls() {
    this.$prev.disabled = this.currentIndex === 0;
    this.$next.disabled = this.currentIndex === this.properties.length - 1;
    this.$jumpInput.disabled = this.properties.length === 0;
    this.$jump.disabled = this.properties.length === 0;
    this.$jumpInput.max = this.properties.length;
    this.$jumpInput.value = this.currentIndex + 1;
  }

  showLoading(b) { this.$loading.style.display = b ? "block" : "none"; }
  showError(msg) { this.$error.textContent = msg; this.$error.style.display = "block"; }
  hideError() { this.$error.style.display = "none"; }
  escape(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
}

window.addEventListener("DOMContentLoaded", () => new PropertyBrowser());
