// src/web/public/app.js - Complete Fixed Version
class PropertyBrowser {
  constructor() {
    this.properties = [];
    this.allProperties = [];
    this.currentIndex = 0;
    this.cache = new Map();
    this.bindUI();
    this.enhanceExistingUI();
  }

  bindUI() {
    // Bind to your existing HTML elements
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

    // Keep your existing event listeners
    this.$load.addEventListener("click", () => this.loadProperties());
    this.$prev.addEventListener("click", () => this.previous());
    this.$next.addEventListener("click", () => this.next());
    this.$jump.addEventListener("click", () => this.jump());
    this.$jumpInput.addEventListener("keypress", (e) => e.key === "Enter" && this.jump());
    this.$download.addEventListener("click", () => this.downloadCSV());
  }

  enhanceExistingUI() {
    // Add enhanced styles
    const styles = document.createElement('style');
    styles.textContent = `
      /* Property Dropdown Styles */
      .property-dropdown-container {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 6px;
        margin-bottom: 16px;
        border: 1px solid #dee2e6;
      }

      .property-dropdown {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        background: white;
        font-size: 14px;
        color: #495057;
        cursor: pointer;
        transition: border-color 0.2s;
      }

      .property-dropdown:focus {
        outline: none;
        border-color: #80bdff;
        box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
      }

      .dropdown-label {
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
        color: #495057;
        font-size: 14px;
      }

      .dropdown-helper {
        font-size: 12px;
        color: #6c757d;
        margin-top: 4px;
      }

      /* Enhanced Property Display */
      .property-stats {
        background: #f8f9fa;
        padding: 12px 16px;
        border-radius: 6px;
        margin: 16px 0;
        border-left: 4px solid #007bff;
        font-size: 14px;
        color: #495057;
      }

      .success-indicator {
        background: #d4edda;
        color: #155724;
        padding: 8px 12px;
        border-radius: 4px;
        margin: 12px 0;
        border-left: 4px solid #28a745;
        font-size: 14px;
      }

      .description-field.has-content {
        border-left: 4px solid #28a745;
        background: #f8fff9;
      }

      .field-indicator {
        color: #28a745;
        font-size: 12px;
        margin-left: 8px;
      }

      .quick-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 12px;
        margin: 12px 0;
      }

      .stat-box {
        background: white;
        padding: 12px;
        border-radius: 4px;
        text-align: center;
        border: 1px solid #dee2e6;
      }

      .stat-number {
        font-size: 18px;
        font-weight: 700;
        color: #007bff;
        margin-bottom: 4px;
      }

      .stat-label {
        font-size: 12px;
        color: #6c757d;
        font-weight: 600;
      }

      /* Toast notifications */
      .success-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
      }

      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      /* Analytics Button */
      .analytics-btn {
        background: #6f42c1;
        margin-left: 8px;
      }

      .analytics-btn:hover {
        background: #5a2d91;
      }

      /* Modal for analytics - FIXED VERSION */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .modal-content {
        background: white;
        border-radius: 8px;
        padding: 0;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        position: relative;
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 25px;
        margin: 0;
        border-bottom: 1px solid #e0e0e0;
        background: #f8f9fa;
      }

      .modal-body {
        padding: 25px;
        overflow-y: auto;
        max-height: calc(80vh - 80px);
      }

      .modal-close {
        background: none;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        color: #666;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .modal-close:hover {
        background: #e9ecef;
        color: #000;
      }

      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .metric-box {
        text-align: center;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 6px;
        border: 1px solid #e0e0e0;
      }

      .metric-number {
        font-size: 24px;
        font-weight: 600;
        color: #333;
      }

      .metric-label {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    `;
    document.head.appendChild(styles);

    // Add analytics button to existing controls
    const analyticsBtn = document.createElement('button');
    analyticsBtn.id = 'analyticsBtn';
    analyticsBtn.className = 'btn analytics-btn';
    analyticsBtn.textContent = 'Analytics';
    analyticsBtn.addEventListener('click', () => this.showQuickAnalytics());
    
    const controls = document.querySelector('.controls');
    if (controls) {
      controls.appendChild(analyticsBtn);
    }

    // Add property dropdown after controls
    this.addPropertyDropdown();

    // Add global event listeners for modal functionality
    this.addGlobalEventListeners();
  }

  addGlobalEventListeners() {
    // Global escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.querySelector('.modal-overlay');
        if (modal) {
          this.closeModal(modal);
        }
      }
    });

    // Global click outside handler
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeModal(e.target);
      }
    });
  }

  closeModal(modalElement) {
    if (modalElement && modalElement.classList.contains('modal-overlay')) {
      modalElement.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        if (modalElement.parentNode) {
          modalElement.remove();
        }
      }, 200);
    }
  }

  addPropertyDropdown() {
    const dropdownHtml = `
      <div class="property-dropdown-container" id="propertyDropdownContainer" style="display: none;">
        <label class="dropdown-label" for="propertyDropdown">
          Quick Property Navigation
        </label>
        <select id="propertyDropdown" class="property-dropdown">
          <option value="">Select a property...</option>
        </select>
        <div class="dropdown-helper">
          Select any property to jump directly to it
        </div>
      </div>
    `;

    // Insert after controls
    const controls = document.querySelector('.controls');
    if (controls) {
      controls.insertAdjacentHTML('afterend', dropdownHtml);
      this.bindDropdownEvents();
    }
  }

  bindDropdownEvents() {
    this.$dropdown = document.getElementById("propertyDropdown");
    this.$dropdownContainer = document.getElementById("propertyDropdownContainer");

    // Dropdown selection
    this.$dropdown.addEventListener("change", (e) => {
      const selectedIndex = parseInt(e.target.value, 10);
      if (selectedIndex >= 0 && selectedIndex < this.properties.length) {
        this.currentIndex = selectedIndex;
        this.render();
        this.showSuccessToast(`Jumped to: ${this.properties[selectedIndex].name || 'Property ' + (selectedIndex + 1)}`);
      }
    });
  }

  populateDropdown() {
    if (!this.$dropdown || !this.properties.length) return;

    this.$dropdown.innerHTML = '<option value="">Select a property...</option>';

    this.properties.forEach((property, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      
      const name = property.name || `Property ${index + 1}`;
      const city = property.address?.city || 'Unknown';
      const state = property.address?.state || '';
      const status = property.isActive ? '✓' : '✗';
      
      option.textContent = `${status} ${name} - ${city}${state ? ', ' + state : ''}`;
      this.$dropdown.appendChild(option);
    });

    // Show the dropdown container
    this.$dropdownContainer.style.display = 'block';
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
      this.allProperties = [...this.properties];
      this.currentIndex = 0;
      
      if (this.properties.length === 0) throw new Error("No properties found");
      
      // Populate dropdown after loading properties
      this.populateDropdown();
      
      // Show success message based on count
      this.showPropertyStats();
      
      if (this.properties.length >= 89) {
        this.showSuccessToast(`Perfect! Loaded all ${this.properties.length} properties!`);
      } else if (this.properties.length >= 85) {
        this.showSuccessToast(`Great! Loaded ${this.properties.length} properties (close to expected 89)`);
      } else if (this.properties.length >= 50) {
        this.showSuccessToast(`Good! Loaded ${this.properties.length} properties`);
      }
      
      this.render();
    } catch (e) {
      this.showError(`Failed to load properties: ${e.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  showPropertyStats() {
    // Remove existing stats if any
    const existingStats = document.querySelector('.property-stats');
    if (existingStats) existingStats.remove();

    // Create stats display
    const active = this.properties.filter(p => p.isActive).length;
    const inactive = this.properties.length - active;
    const cities = new Set(this.properties.map(p => p.address?.city).filter(Boolean)).size;
    const states = new Set(this.properties.map(p => p.address?.state).filter(Boolean)).size;

    const statsHtml = `
      <div class="property-stats">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>Property Overview</strong>
          <button onclick="window.propertyBrowser.showQuickAnalytics()" style="background: #6f42c1; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 12px; cursor: pointer;">View Details</button>
        </div>
        <div class="quick-stats">
          <div class="stat-box">
            <div class="stat-number">${this.properties.length}</div>
            <div class="stat-label">Total</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${active}</div>
            <div class="stat-label">Active</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${cities}</div>
            <div class="stat-label">Cities</div>
          </div>
          <div class="stat-box">
            <div class="stat-number">${states}</div>
            <div class="stat-label">States</div>
          </div>
        </div>
      </div>
    `;

    // Insert after dropdown container
    const dropdownContainer = document.querySelector('.property-dropdown-container');
    if (dropdownContainer) {
      dropdownContainer.insertAdjacentHTML('afterend', statsHtml);
    } else {
      // Fallback: insert after controls
      const controls = document.querySelector('.controls');
      if (controls) {
        controls.insertAdjacentHTML('afterend', statsHtml);
      }
    }
  }

  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.render();
      this.updateDropdownSelection();
    }
  }

  next() {
    if (this.currentIndex < this.properties.length - 1) {
      this.currentIndex++;
      this.render();
      this.updateDropdownSelection();
    }
  }

  jump() {
    const n = parseInt(this.$jumpInput.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= this.properties.length) {
      this.currentIndex = n - 1;
      this.render();
      this.updateDropdownSelection();
    }
  }

  updateDropdownSelection() {
    if (this.$dropdown) {
      this.$dropdown.value = this.currentIndex.toString();
    }
  }

  async ensureDescriptions(uid) {
    if (this.cache.has(uid)) return this.cache.get(uid);
    
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(uid)}/descriptions`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to fetch descriptions");
      this.cache.set(uid, data);
      return data;
    } catch (e) {
      const errorData = { descriptions: {}, characterCounts: {}, error: e.message };
      this.cache.set(uid, errorData);
      return errorData;
    }
  }

  async render() {
    const p = this.properties[this.currentIndex];
    this.$display.style.display = "block";
    this.$title.textContent = p.name || "Unnamed Property";
    this.$counter.textContent = `${this.currentIndex + 1} of ${this.properties.length}`;

    const statusClass = p.isActive ? "status-active" : "status-inactive";
    const statusText = p.isActive ? "Active" : "Inactive";
    
    // Enhanced property info with more details
    this.$info.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px;">
        <div>
          <p><strong>UID:</strong> <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px;">${this.escape(p.uid)}</code></p>
          <p><strong>Status:</strong> <span class="status-badge ${statusClass}">${statusText}</span></p>
          <p><strong>Type:</strong> ${this.escape(p.propertyType || "Not specified")}</p>
        </div>
        <div>
          <p><strong>Location:</strong> ${this.escape(p.address?.city || "Unknown")}, ${this.escape(p.address?.state || "Unknown")}</p>
          <p><strong>Max Guests:</strong> ${p.availability?.maxGuests ?? "Not specified"}</p>
          <p><strong>Address:</strong> ${this.escape(p.address?.address || "Not specified")}</p>
        </div>
      </div>
    `;

    // Show success indicator if we have 89+ properties
    if (this.properties.length >= 89) {
      const successIndicator = `
        <div class="success-indicator">
          ✅ <strong>Full Access Confirmed:</strong> Successfully loaded all ${this.properties.length} properties!
        </div>
      `;
      this.$info.insertAdjacentHTML('beforeend', successIndicator);
    }

    // Pull descriptions on demand
    try {
      const { descriptions, characterCounts, error } = await this.ensureDescriptions(p.uid);
      this.renderDescriptions(descriptions || {}, characterCounts || {});
      
      if (error) {
        this.showError(`Could not load descriptions for this property: ${error}`);
      }
    } catch (e) {
      this.renderDescriptions({}, {});
      this.showError(`Could not load descriptions for this property: ${e.message}`);
    }

    this.updateControls();
    this.updateDropdownSelection();
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
        const hasContent = !empty && content.length > 0;
        
        return `
          <div class="description-field ${hasContent ? 'has-content' : ''}">
            <div class="field-label">
              ${label}
              ${hasContent ? '<span class="field-indicator">●</span>' : ''}
            </div>
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

      const res = await fetch("/api/export/properties.csv");
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const blob = await res.blob();
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
      
      this.showSuccessToast(`Downloaded ${filename} successfully!`);
      
    } catch (e) {
      this.$download.disabled = false;
      this.$download.textContent = "Download CSV";
      this.showError(`CSV download failed: ${e.message}`);
    }
  }

  showQuickAnalytics() {
    if (!this.properties.length) {
      this.showError("Load properties first to see analytics");
      return;
    }

    const analytics = this.calculateAnalytics();
    
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.animation = 'fadeIn 0.2s ease-out';
    
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 style="margin: 0; color: #333;">Property Analytics</h2>
          <button class="modal-close" type="button" aria-label="Close">×</button>
        </div>
        
        <div class="modal-body">
          <div class="analytics-grid">
            <div class="metric-box">
              <div class="metric-number">${analytics.total}</div>
              <div class="metric-label">Total</div>
            </div>
            <div class="metric-box">
              <div class="metric-number">${analytics.active}</div>
              <div class="metric-label">Active</div>
            </div>
            <div class="metric-box">
              <div class="metric-number">${analytics.cities}</div>
              <div class="metric-label">Cities</div>
            </div>
            <div class="metric-box">
              <div class="metric-number">${analytics.states}</div>
              <div class="metric-label">States</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
            <div>
              <h3 style="margin-bottom: 10px; font-size: 16px; color: #333;">Top Cities</h3>
              <div style="background: #f8f9fa; border-radius: 6px; padding: 15px;">
                ${analytics.topCities.map(([city, count]) => 
                  `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;">
                    <span>${this.escape(city)}</span>
                    <strong>${count}</strong>
                  </div>`
                ).join('')}
              </div>
            </div>
            
            <div>
              <h3 style="margin-bottom: 10px; font-size: 16px; color: #333;">By State</h3>
              <div style="background: #f8f9fa; border-radius: 6px; padding: 15px;">
                ${analytics.topStates.map(([state, count]) => 
                  `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px;">
                    <span>${this.escape(state)}</span>
                    <strong>${count}</strong>
                  </div>`
                ).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add close button event listener
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal(overlay));
    }
    
    // Add fade-in style
    const fadeStyle = document.createElement('style');
    fadeStyle.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(fadeStyle);
    
    document.body.appendChild(overlay);
  }

  calculateAnalytics() {
    const active = this.properties.filter(p => p.isActive).length;
    const cities = {};
    const states = {};
    
    this.properties.forEach(p => {
      const city = p.address?.city || 'Unknown';
      const state = p.address?.state || 'Unknown';
      cities[city] = (cities[city] || 0) + 1;
      states[state] = (states[state] || 0) + 1;
    });

    return {
      total: this.properties.length,
      active,
      inactive: this.properties.length - active,
      cities: Object.keys(cities).length,
      states: Object.keys(states).length,
      topCities: Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topStates: Object.entries(states).sort((a, b) => b[1] - a[1]).slice(0, 5)
    };
  }

  showLoading(b) {
    this.$loading.style.display = b ? "block" : "none";
  }

  showError(msg) {
    this.$error.textContent = msg;
    this.$error.style.display = "block";
    setTimeout(() => this.hideError(), 5000);
  }

  showSuccessToast(msg) {
    const existingToast = document.querySelector('.success-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = msg;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
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

// Initialize when DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  window.propertyBrowser = new PropertyBrowser();
});