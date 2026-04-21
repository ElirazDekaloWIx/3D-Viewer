// Shared navigation component for all doc pages
// All files are in the same directory - no relative path tricks needed

const phases = [
  { num: '1', title: 'יסודות', file: 'phase1.html', status: 'completed' },
  { num: '2', title: 'תאורה', file: 'phase2.html', status: 'completed' },
  { num: '3', title: 'חומרי PBR', file: 'phase3.html', status: 'completed' },
  { num: '4', title: 'צללים', file: 'phase4.html', status: 'completed' },
  { num: '5', title: 'Post-Processing', file: 'phase5.html', status: 'completed' },
  { num: '6', title: 'ביצועים', file: 'phase6.html', status: 'completed' },
  { num: '7', title: 'API', file: 'phase7.html', status: 'completed' },
  { num: '8', title: 'Path Tracing', file: 'phase8.html', status: 'completed' },
  { num: '9', title: 'אנימציה', file: 'phase9.html', status: 'completed' },
];

function isCurrentPage(file) {
  const path = window.location.pathname.replace(/\\/g, '/');
  return path.endsWith(file) || path.endsWith('/' + file);
}

function buildSidebar() {
  const sidebar = document.createElement('nav');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <a href="3D Viewer Wiki.html" style="text-decoration:none">
      <div class="sidebar-logo">
        <span class="logo-icon">&#9672;</span>
        <span>3D Viewer</span>
      </div>
    </a>
    <div class="sidebar-subtitle">מסמכי פיתוח ומחקר</div>

    <div class="nav-section">
      <div class="nav-section-title">כללי</div>
      <a href="3D Viewer Wiki.html" class="nav-link ${isCurrentPage('3D Viewer Wiki.html') ? 'active' : ''}">
        &#9776; סקירה כללית
      </a>
      <a href="architecture.html" class="nav-link ${isCurrentPage('architecture.html') ? 'active' : ''}">
        &#9881; ארכיטקטורה
      </a>
      <a href="materials-library.html" class="nav-link ${isCurrentPage('materials-library.html') ? 'active' : ''}">
        &#127912; ספריית חומרים
      </a>
      <a href="changelog.html" class="nav-link ${isCurrentPage('changelog.html') ? 'active' : ''}">
        &#128221; לוג שינויים
      </a>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">שלבי פיתוח</div>
      ${phases.map(p => `
        <a href="${p.file}" class="nav-link ${isCurrentPage(p.file) ? 'active' : ''}">
          <span class="phase-num ${p.status}">${p.num}</span>
          ${p.title}
        </a>
      `).join('')}
    </div>

    <div class="nav-section" style="margin-top: auto; padding-top: 1.5rem; border-top: 1px solid var(--border);">
      <div style="font-size: 0.75rem; color: var(--text-muted); direction: ltr; text-align: left;">
        v0.1.0 &middot; Last updated: ${new Date().toLocaleDateString('he-IL')}
      </div>
    </div>
  `;

  document.body.insertBefore(sidebar, document.body.firstChild);

  const mainContent = document.querySelector('.main-content');
  if (!mainContent) {
    const wrapper = document.createElement('div');
    wrapper.className = 'main-content';
    while (document.body.children.length > 1) {
      wrapper.appendChild(document.body.children[1]);
    }
    document.body.appendChild(wrapper);
  }

  document.body.classList.add('page-wrapper');
}

document.addEventListener('DOMContentLoaded', buildSidebar);
