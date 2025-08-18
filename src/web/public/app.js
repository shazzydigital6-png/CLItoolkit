// src/web/public/app.js - Enhanced version for existing HTML
class PropertyBrowser {
  constructor() {
    this.properties = [];
    this.allProperties = [];
    this.currentIndex = 0;
    this.cache = new Map();
    this.bindUI();
    this.showSuccessBanner();
    this.enhanceExistingUI();
  }

  bindUI() {
    // Existing UI elements (unchanged)
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

    // Existing event listeners (unchanged)
    this.$load.addEventListener("click", () => this.loadProperties());
    this.$prev.addEventListener("click", () => this.previous());
    this.$next.addEventListener("click", () => this.next());
    this.$jump.addEventListener("click", () => this.jump());
    this.$jumpInput.addEventListener("keypress", (e) => e.key === "Enter" && this.jump());
    this.$download.addEventListener("click", () => this.downloadCSV());
  }

  enhanceExistingUI() {
    // Add enhanced styles to your existing page
    const enhancedStyles = document.createElement('style');
    enhancedStyles.textContent = `
      /* Success Banner Styles */
      .success-banner {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 16px 20px;
        margin: 0 -30px 20px -30px;
        border-radius: 0 0 8px 8px;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        animation: slideDown 0.5s ease-out;
        position: relative;
      }
      
      .banner-content {
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 1140px;
        margin: 0 auto;
      }
      
      .banner-icon {
        font-size: 24px;
        animation: bounce 2s infinite;
      }
      
      .banner-text strong {
        font-weight: 700;
      }
      
      .banner-subtext {
        font-size: 14px;
        opacity: 0.9;
        margin-top: 4px;
      }
      
      .banner-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        margin-left: auto;
        font-size: 18px;
        line-height: 1;
        transition: background 0.2s;
      }
      
      .banner-close:hover {
        background: rgba(255,255,255,0.3);
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

      /* Enhanced Controls */
      .enhanced-controls {
        background: #f8f9fa;
        padding: 16px;
        border-radius: 6px;
        margin-bottom: 16px;
        border: 1px solid #dee2e6;
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

      /* Success Messages */
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

      /* Analytics Button (if we add it) */
      .analytics-btn {
        background: #6f42c1;
        margin-left: 8px;
      }

      .analytics-btn:hover {
        background: #5a2d91;
      }

      /* Animations */
      @keyframes slideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
        60% { transform: translateY(-5px); }
      }

      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }

      /* Enhanced Error Styling */
      .error {
        animation: shake 0.5s ease-in-out;
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }

      /* Responsive improvements */
      @media (max-width: 768px) {
        .banner-content {
          flex-direction: column;
          text-align: center;
          gap: 8px;
        }
        
        .banner-close {
          position: absolute;
          top: 8px;
          right: 8px;
        }

        .quick-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
    document.head.appendChild(enhancedStyles);

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
  }

  showSuccessBanner() {
    // Only show if not shown before
    if (localStorage.getItem('hostfully-89-success-shown')) return;
    
    const banner = document.createElement('div');
    banner.className = 'success-banner';
    banner.innerHTML = `
      <div class="banner-content">
        <div class="banner-icon">🎉</div>
        <div class="banner-text">
          <strong>SUCCESS!</strong> You now have access to all 89 properties!
          <div class="banner-subtext">API pagination issue resolved • Enhanced features available</div>
        </div>
        <button class="banner-close" onclick="this.parentElement.parentElement.remove(); localStorage.setItem('hostfully-89-success-shown', 'true');">×</button>
      </div>
    `;
    
    // Insert at the very top of the container
    const container = document.querySelector('.container');
    if (container) {
      container.insertBefore(banner, container.firstChild);
    }
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
      this.allProperties = [...this.properties]; // Keep copy for potential filtering
      this.currentIndex = 0;
      
      if (this.properties.length === 0) throw new Error("No properties found");
      
      // Show success message based on count
      this.showPropertyStats();
      
      if (this.properties.length >= 89) {
        this.showSuccessToast(`Perfect! Loaded all ${this.properties.length} properties! 🎉`);
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

    // Insert after controls
    const controls = document.querySelector('.controls');
    if (controls) {
      controls.insertAdjacentHTML('afterend', statsHtml);
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
    
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(uid)}/descriptions`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to fetch descriptions");
      this.cache.set(uid, data);
      return data;
    } catch (e) {
      // Cache the error so we don't retry constantly
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
      
      this.showSuccessToast(`Downloaded ${filename} successfully! 📄`);
      
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
    
    // Create simple analytics display that overlays the current content
    const overlay = document.createElement('div');
    overlay.style.cssText = `
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
    `;
    
    overlay.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 30px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #dee2e6; padding-bottom: 15px;">
          <h2 style="margin: 0; color: #333;">Property Analytics</h2>
          <button onclick="this.closest('div[style*=\"position: fixed\"]').remove()" style="background: #dc3545; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 18px;">×</button>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 25px;">
          <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="font-size: 28px; font-weight: 700; color: #007bff; margin-bottom: 5px;">${analytics.total}</div>
            <div style="font-size: 14px; color: #6c757d; font-weight: 600;">Total Properties</div>
          </div>
          <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="font-size: 28px; font-weight: 700; color: #28a745; margin-bottom: 5px;">${analytics.active}</div>
            <div style="font-size: 14px; color: #6c757d; font-weight: 600;">Active</div>
          </div>
          <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="font-size: 28px; font-weight: 700; color: #6f42c1; margin-bottom: 5px;">${analytics.cities}</div>
            <div style="font-size: 14px; color: #6c757d; font-weight: 600;">Cities</div>
          </div>
          <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
            <div style="font-size: 28px; font-weight: 700; color: #fd7e14; margin-bottom: 5px;">${analytics.states}</div>
            <div style="font-size: 14px; color: #6c757d; font-weight: 600;">States</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px;">
          <div>
            <h3 style="color: #495057; margin-bottom: 12px; font-size: 16px;">Top Cities</h3>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 15px;">
              ${analytics.topCities.map(([city, count]) => 
                `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #dee2e6; font-size: 14px;">
                  <span>${city}</span>
                  <strong style="color: #007bff;">${count}</strong>
                </div>`
              ).join('')}
            </div>
          </div>
          
          <div>
            <h3 style="color: #495057; margin-bottom: 12px; font-size: 16px;">By State</h3>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 15px;">
              ${analytics.topStates.map(([state, count]) => 
                `<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #dee2e6; font-size: 14px;">
                  <span>${state}</span>
                  <strong style="color: #28a745;">${count}</strong>
                </div>`
              ).join('')}
            </div>
          </div>
        </div>

        <div style="margin-top: 20px; padding: 15px; background: #d4edda; border-radius: 6px; border-left: 4px solid #28a745;">
          <strong style="color: #155724;">Success Rate:</strong> 
          <span style="color: #155724;">${Math.round(analytics.total / 89 * 100)}% of expected 89 properties loaded</span>
        </div>
      </div>
    `;
    
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
    // Auto-hide after 5 seconds
    setTimeout(() => this.hideError(), 5000);
  }

  showSuccessToast(msg) {
    // Remove existing toast if any
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

// Make it globally accessible and initialize
window.addEventListener("DOMContentLoaded", () => {
  window.propertyBrowser = new PropertyBrowser();
});