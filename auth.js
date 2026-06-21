(() => {
  const state = {
    csrfToken: null,
    user: null,
    projects: []
  };

  const request = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const isJsonBody = options.body && !(options.body instanceof FormData);
    const headers = {
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    if (state.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['x-csrf-token'] = state.csrfToken;
    }

    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      method,
      headers
    });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    }

    return { response, payload };
  };

  const setMessage = (element, text, isError = false) => {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('error', isError);
  };

  const normalizeEmails = (raw) =>
    String(raw || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

  const refreshSession = async () => {
    const { response, payload } = await request('/api/auth/session');
    if (!response.ok || !payload?.authenticated) {
      state.user = null;
      state.csrfToken = null;
      return false;
    }

    state.user = payload.user;
    state.csrfToken = payload.csrfToken || null;
    return true;
  };

  const formatBytes = (size) => {
    if (!Number.isFinite(size) || size <= 0) return 'ukjent storrelse';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i += 1;
    }
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const message = document.getElementById('loginMessage');
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');

    refreshSession().then((authenticated) => {
      if (authenticated) {
        window.location.href = '/dashboard.html';
      }
    });

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      setMessage(message, 'Logger inn...');

      try {
        const { response, payload } = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
          setMessage(message, payload?.message || 'Innlogging feilet.', true);
          return;
        }

        state.csrfToken = payload?.csrfToken || null;

        setMessage(message, 'Innlogging vellykket. Sender deg til dashboard...');
        window.location.href = '/dashboard.html';
      } catch {
        setMessage(message, 'Nettverksfeil. Prov igjen.', true);
      }
    });

    registerForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');

      setMessage(registerMessage, 'Registrerer bruker...');

      try {
        const { response, payload } = await request('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password })
        });

        if (!response.ok) {
          setMessage(registerMessage, payload?.message || 'Registrering feilet.', true);
          return;
        }

        state.csrfToken = payload?.csrfToken || null;
        setMessage(registerMessage, 'Bruker registrert. Sender deg til dashboard...');
        window.location.href = '/dashboard.html';
      } catch {
        setMessage(registerMessage, 'Nettverksfeil. Prov igjen.', true);
      }
    });
  }

  const dashboardRoot = document.querySelector('.dashboard-page');
  if (dashboardRoot) {
    const userInfo = document.getElementById('userInfo');
    const adminPanel = document.getElementById('adminPanel');
    const adminMessage = document.getElementById('adminMessage');

    const projectList = document.getElementById('projectList');
    const assetList = document.getElementById('assetList');
    const assetHint = document.getElementById('assetHint');
    const logoutButton = document.getElementById('logoutButton');

    const createUserForm = document.getElementById('createUserForm');
    const createProjectForm = document.getElementById('createProjectForm');
    const addMemberForm = document.getElementById('addMemberForm');
    const uploadAssetForm = document.getElementById('uploadAssetForm');
    const adminProjectSelect = document.getElementById('adminProjectSelect');
    const assetProjectSelect = document.getElementById('assetProjectSelect');

    const clearAssets = () => {
      assetList.innerHTML = '';
    };

    const renderAssets = (assets) => {
      clearAssets();
      if (!assets.length) {
        assetHint.textContent = 'Ingen ressurser tilgjengelig i prosjektet.';
        return;
      }

      assetHint.textContent = 'Lenkene under er tidsbegrensede.';
      for (const asset of assets) {
        const li = document.createElement('li');
        li.className = 'asset-item';

        const label = document.createElement('p');
        label.textContent = `${asset.kind}: ${asset.title}`;
        label.style.margin = '0 0 .35rem';

        const link = document.createElement('a');
        link.href = asset.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `Aapne fil (${formatBytes(asset.sizeBytes)})`;

        li.append(label, link);
        assetList.appendChild(li);
      }
    };

    const loadAssets = async (projectId) => {
      assetHint.textContent = 'Laster ressurser...';
      clearAssets();

      const { response, payload } = await request(`/api/projects/${encodeURIComponent(projectId)}/assets`);
      if (!response.ok) {
        assetHint.textContent = payload?.message || 'Klarte ikke hente ressurser.';
        return;
      }

      renderAssets(payload.assets || []);
    };

    const renderProjects = (projects) => {
      state.projects = projects;
      projectList.innerHTML = '';
      if (!projects.length) {
        const empty = document.createElement('li');
        empty.className = 'project-item';
        empty.textContent = 'Du har forelopig ingen tildelte prosjekter.';
        projectList.appendChild(empty);
        assetHint.textContent = 'Ingen prosjekter tilgjengelig.';
        return;
      }

      for (const project of projects) {
        const li = document.createElement('li');
        li.className = 'project-item';

        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `<strong>${project.name}</strong><span>${project.description || ''}</span>`;
        button.addEventListener('click', () => loadAssets(project.id));

        li.appendChild(button);
        projectList.appendChild(li);
      }
    };

    const refreshAdminProjectSelects = () => {
      if (!adminProjectSelect || !assetProjectSelect) return;

      adminProjectSelect.innerHTML = '';
      assetProjectSelect.innerHTML = '';

      for (const project of state.projects) {
        const optionA = document.createElement('option');
        optionA.value = project.id;
        optionA.textContent = project.name;
        adminProjectSelect.appendChild(optionA);

        const optionB = document.createElement('option');
        optionB.value = project.id;
        optionB.textContent = project.name;
        assetProjectSelect.appendChild(optionB);
      }
    };

    const loadProjects = async () => {
      const projects = await request('/api/projects');
      if (!projects.response.ok) {
        userInfo.textContent = 'Klarte ikke hente prosjektoversikt.';
        return null;
      }

      renderProjects(projects.payload.projects || []);
      refreshAdminProjectSelects();

      const firstProject = (projects.payload.projects || [])[0];
      if (firstProject) {
        loadAssets(firstProject.id);
      }

      return projects.payload.projects || [];
    };

    const bootAdmin = () => {
      if (state.user?.role !== 'admin' || !adminPanel) {
        return;
      }

      adminPanel.hidden = false;

      createUserForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(createUserForm);
        const payload = {
          name: String(data.get('name') || '').trim(),
          email: String(data.get('email') || '').trim(),
          password: String(data.get('password') || ''),
          role: String(data.get('role') || 'client')
        };

        const result = await request('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!result.response.ok) {
          setMessage(adminMessage, result.payload?.message || 'Klarte ikke opprette bruker.', true);
          return;
        }

        createUserForm.reset();
        setMessage(adminMessage, `Bruker opprettet: ${result.payload.user.email}`);
      });

      createProjectForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(createProjectForm);
        const payload = {
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
          memberEmails: normalizeEmails(data.get('memberEmails'))
        };

        const result = await request('/api/admin/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!result.response.ok) {
          setMessage(adminMessage, result.payload?.message || 'Klarte ikke opprette prosjekt.', true);
          return;
        }

        createProjectForm.reset();
        await loadProjects();
        setMessage(adminMessage, `Prosjekt opprettet: ${result.payload.project.name}`);
      });

      addMemberForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(addMemberForm);
        const projectId = String(data.get('projectId') || '');
        const email = String(data.get('email') || '').trim();

        const result = await request(`/api/admin/projects/${encodeURIComponent(projectId)}/members`, {
          method: 'POST',
          body: JSON.stringify({ email })
        });

        if (!result.response.ok) {
          setMessage(adminMessage, result.payload?.message || 'Klarte ikke legge til medlem.', true);
          return;
        }

        addMemberForm.reset();
        setMessage(adminMessage, `Medlem lagt til: ${result.payload.member.email}`);
      });

      uploadAssetForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(uploadAssetForm);
        const projectId = String(data.get('projectId') || '');
        const result = await request(`/api/admin/projects/${encodeURIComponent(projectId)}/assets`, {
          method: 'POST',
          body: data
        });

        if (!result.response.ok) {
          setMessage(adminMessage, result.payload?.message || 'Klarte ikke laste opp fil.', true);
          return;
        }

        uploadAssetForm.reset();
        await loadAssets(projectId);
        setMessage(adminMessage, `Fil lastet opp: ${result.payload.asset.fileName}`);
      });
    };

    const bootDashboard = async () => {
      const authenticated = await refreshSession();
      if (!authenticated) {
        window.location.href = '/innlogging.html';
        return;
      }

      userInfo.textContent = `Innlogget som ${state.user.email} (${state.user.role})`;
      await loadProjects();
      bootAdmin();
    };

    logoutButton?.addEventListener('click', async () => {
      await request('/api/auth/logout', { method: 'POST' });
      window.location.href = '/innlogging.html';
    });

    bootDashboard().catch(() => {
      window.location.href = '/innlogging.html';
    });
  }
})();
