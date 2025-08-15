// src/web/public/app.js
class PropertyBrowser {
  constructor() {
    this.properties = [];
    this.currentIndex = 0;
    this.cache = new Map();
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
    this.$download = document.getElementById("downloadBtn");

    this.$load.addEventListener("click", () => this.loadProperties());
    this.$prev.addEventListener("click", () => this.previous());
    this.$next.addEventListener("click", () => this.next());
    this.$jump.addEventListener("click", () => this.jump());
    this.$jumpInput.addEventListener("keypress", (e) => e.key === "Enter" && this.jump());
    this.$download.addEventListener("click", () => this.downloadCSV());
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

  async ensureDescriptions(uid) {
    if (this.cache.has(uid)) return this.cache.get(uid);
    const res = await fetch(`/api/properties/${encodeURIComponent(uid)}/descriptions`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed to fetch descriptions");
    this.cache.set(uid, data);
    return data;
  }

  async render() {
    const p = this.properties[this.currentIndex];
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

    // Pull descriptions on demand
    try {
      const { descriptions, characterCounts } = await this.ensureDescriptions(p.uid);
      this.renderDescriptions(descriptions || {}, characterCounts || {});
    } catch (e) {
      this.renderDescriptions({}, {});
      this.showError(`Could not load descriptions for this property: ${e.message}`);
    }

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
        const len = counts[k] || content.length || 0;
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
    this.$jumpInput.max = this.properties.length || 1;
    this.$jumpInput.value = (this.currentIndex + 1).toString();
  }

  async downloadCSV() {
    try {
      this.$download.disabled = true;
      const original = this.$download.textContent;
      this.$download.textContent = "Preparing CSV…";

      // You can pass concurrency, e.g. ?concurrency=5
      const res = await fetch("/api/export/properties.csv");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const blob = await res.blob();
      // Try to read filename from header; default fallback
      const cd = res.headers.get("content-disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(cd);
      const filename = match?.[1] || "hostfully_properties.csv";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.$download.textContent = original;
      this.$download.disabled = false;
    } catch (e) {
      this.$download.disabled = false;
      this.$download.textContent = "Download CSV";
      this.showError(`CSV download failed: ${e.message}`);
    }
  }

  showLoading(b) {
    this.$loading.style.display = b ? "block" : "none";
  }
  showError(msg) {
    this.$error.textContent = msg;
    this.$error.style.display = "block";
  }
  hideError() {
    this.$error.style.display = "none";
  }
  escape(s) {
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }
}

window.addEventListener("DOMContentLoaded", () => new PropertyBrowser());
