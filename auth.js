(() => {
  const state = {
    csrfToken: null,
    user: null,
    projects: [],
    activeProjectId: null,
    adminUsers: [],
    adminUsersLoaded: false,
    adminUsersLoading: false
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
    const authCard = document.querySelector('.auth-card');
    const message = document.getElementById('loginMessage');
    const registerForm = document.getElementById('registerForm');
    const registerMessage = document.getElementById('registerMessage');
    const registerSuccessBadge = document.getElementById('registerSuccessBadge');
    const toggleRegisterButton = document.getElementById('toggleRegisterButton');
    const registerWrap = document.getElementById('registerWrap');
    const registerNameInput = document.getElementById('registerName');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');
    const loginEmailInput = document.getElementById('email');
    const loginPasswordInput = document.getElementById('password');

    const wireEnterNavigation = (steps) => {
      for (let i = 0; i < steps.length - 1; i += 1) {
        const current = steps[i];
        const next = steps[i + 1];
        current?.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') {
            return;
          }

          event.preventDefault();
          next?.focus();
        });
      }
    };

    const setRegisterVisible = (visible) => {
      if (!registerWrap || !toggleRegisterButton) {
        return;
      }

      registerWrap.hidden = !visible;
      toggleRegisterButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
      toggleRegisterButton.textContent = visible ? 'Skjul registrering' : 'Registrer ny bruker';

      if (visible) {
        registerNameInput?.focus();

        if (window.matchMedia('(max-width: 860px)').matches) {
          window.setTimeout(() => {
            registerWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }
      }
    };

    const triggerErrorFeedback = () => {
      if (!(authCard instanceof HTMLElement)) {
        return;
      }

      authCard.classList.remove('shake');
      void authCard.offsetWidth;
      authCard.classList.add('shake');
    };

    setRegisterVisible(false);

    toggleRegisterButton?.addEventListener('click', () => {
      const nextVisible = registerWrap?.hidden;
      setRegisterVisible(Boolean(nextVisible));
    });

    wireEnterNavigation([loginEmailInput, loginPasswordInput]);
    wireEnterNavigation([registerNameInput, registerEmailInput, registerPasswordInput]);

    const passwordToggleButtons = document.querySelectorAll('.password-toggle');
    for (const button of passwordToggleButtons) {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        if (!targetId) {
          return;
        }

        const input = document.getElementById(targetId);
        if (!(input instanceof HTMLInputElement)) {
          return;
        }

        const shouldShow = input.type === 'password';
        input.type = shouldShow ? 'text' : 'password';
        button.textContent = shouldShow ? 'Skjul' : 'Vis';
        button.setAttribute('aria-label', shouldShow ? 'Skjul passord' : 'Vis passord');
      });
    }

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
          triggerErrorFeedback();
          return;
        }

        state.csrfToken = payload?.csrfToken || null;

        setMessage(message, 'Innlogging vellykket. Sender deg til dashboard...');
        window.location.href = '/dashboard.html';
      } catch {
        setMessage(message, 'Nettverksfeil. Prøv igjen.', true);
        triggerErrorFeedback();
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
          triggerErrorFeedback();
          return;
        }

        state.csrfToken = payload?.csrfToken || null;
        setMessage(registerMessage, 'Bruker registrert. Sender deg til dashboard...');
        if (registerSuccessBadge) {
          registerSuccessBadge.hidden = false;
          registerSuccessBadge.classList.remove('show');
          void registerSuccessBadge.offsetWidth;
          registerSuccessBadge.classList.add('show');
        }

        setTimeout(() => {
          window.location.href = '/dashboard.html';
        }, 650);
      } catch {
        setMessage(registerMessage, 'Nettverksfeil. Prøv igjen.', true);
        triggerErrorFeedback();
      }
    });
  }

  const dashboardRoot = document.querySelector('.dashboard-page');
  if (dashboardRoot) {
    const userInfo = document.getElementById('userInfo');
    const adminPanel = document.getElementById('adminPanel');
    const adminMessage = document.getElementById('adminMessage');

    const projectList = document.getElementById('projectList');
    const assetFolders = document.getElementById('assetFolders');
    const assetFolderContent = document.getElementById('assetFolderContent');
    const assetFolderTitle = document.getElementById('assetFolderTitle');
    const assetList = document.getElementById('assetList');
    const assetHint = document.getElementById('assetHint');
    const assetDownloadActions = document.getElementById('assetDownloadActions');
    const logoutButton = document.getElementById('logoutButton');

    const createUserForm = document.getElementById('createUserForm');
    const createProjectForm = document.getElementById('createProjectForm');
    const createProjectMembers = document.getElementById('createProjectMembers');
    const addMemberForm = document.getElementById('addMemberForm');
    const uploadAssetForm = document.getElementById('uploadAssetForm');
    const adminProjectSelect = document.getElementById('adminProjectSelect');
    const assetProjectSelect = document.getElementById('assetProjectSelect');

    const clearAssets = () => {
      assetList.innerHTML = '';
      if (assetFolderContent) {
        assetFolderContent.hidden = true;
      }
      if (assetFolderTitle) {
        assetFolderTitle.textContent = '';
      }
    };

    const clearAssetFolders = () => {
      if (!assetFolders) {
        return;
      }

      assetFolders.innerHTML = '';
    };

    const clearDownloadActions = () => {
      if (!assetDownloadActions) {
        return;
      }

      assetDownloadActions.innerHTML = '';
      assetDownloadActions.hidden = true;
    };

    const deleteAsset = async (projectId, asset) => {
      if (!projectId || !asset?.id) {
        return;
      }

      const confirmed = window.confirm(`Slette filen ${asset.fileName || asset.title}?`);
      if (!confirmed) {
        return;
      }

      const result = await request(
        `/api/admin/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        { method: 'DELETE' }
      );

      if (!result.response.ok) {
        setMessage(adminMessage, result.payload?.message || 'Klarte ikke slette filen.', true);
        return;
      }

      setMessage(adminMessage, `Fil slettet: ${asset.fileName || asset.title}`);
      await loadAssets(projectId);
    };

    const detectAssetFolder = (asset) => {
      const name = String(asset?.fileName || '').toLowerCase();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'Bilder';
      if (ext === '.pdf') return 'PDF';
      if (['.doc', '.docx', '.docs', '.txt'].includes(ext)) return 'Docs';
      if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'Excel';
      if (['.ppt', '.pptx'].includes(ext)) return 'PowerPoint';
      if (ext === '.xml') return 'XML';
      if (ext === '.zip') return 'ZIP';
      if (ext === '.json') return 'JSON';
      return 'Andre filer';
    };

    const folderSortOrder = ['Bilder', 'PDF', 'Docs', 'Excel', 'PowerPoint', 'XML', 'ZIP', 'JSON', 'Andre filer'];

    const folderKeyByName = {
      Bilder: 'bilder',
      PDF: 'pdf',
      Docs: 'docs',
      Excel: 'excel',
      PowerPoint: 'powerpoint',
      XML: 'xml',
      ZIP: 'zip',
      JSON: 'json',
      'Andre filer': 'andre-filer'
    };

    const renderDownloadActions = (projectId, orderedFolders) => {
      if (!assetDownloadActions || !projectId) {
        return;
      }

      assetDownloadActions.innerHTML = '';
      assetDownloadActions.hidden = false;

      const createDownloadButton = (label, folderKey = 'all') => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-small asset-download-btn';
        button.textContent = label;
        button.addEventListener('click', () => {
          const url = `/api/projects/${encodeURIComponent(projectId)}/download?folder=${encodeURIComponent(folderKey)}`;
          window.open(url, '_blank', 'noopener');
        });
        return button;
      };

      assetDownloadActions.appendChild(createDownloadButton('Last ned hele prosjektet (ZIP)', 'all'));

      for (const folderName of orderedFolders) {
        const folderKey = folderKeyByName[folderName] || 'andre-filer';
        assetDownloadActions.appendChild(createDownloadButton(`Last ned ${folderName} (ZIP)`, folderKey));
      }
    };

    const renderAssets = (assets) => {
      clearAssets();
      clearAssetFolders();
      clearDownloadActions();
      if (!assets.length) {
        assetHint.textContent = 'Ingen ressurser tilgjengelig i prosjektet.';
        return;
      }

      assetHint.textContent = 'Velg en mappe for å vise filer.';

      const groupedAssets = new Map();
      for (const asset of assets) {
        const folderName = detectAssetFolder(asset);
        if (!groupedAssets.has(folderName)) {
          groupedAssets.set(folderName, []);
        }
        groupedAssets.get(folderName).push(asset);
      }

      const orderedFolders = [...groupedAssets.keys()].sort((a, b) => {
        const aIndex = folderSortOrder.indexOf(a);
        const bIndex = folderSortOrder.indexOf(b);
        const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        return aRank - bRank;
      });

      renderDownloadActions(state.activeProjectId, orderedFolders);

      const renderFolderItems = (folderName) => {
        clearAssets();
        if (assetFolderContent) {
          assetFolderContent.hidden = false;
        }
        if (assetFolderTitle) {
          assetFolderTitle.textContent = `${folderName}`;
        }

        const selectedAssets = groupedAssets.get(folderName) || [];
        for (const asset of selectedAssets) {
          const li = document.createElement('li');
          li.className = 'asset-item';

          const label = document.createElement('p');
          label.textContent = asset.title;
          label.style.margin = '0 0 .35rem';

          const meta = document.createElement('p');
          meta.className = 'asset-item__meta';
          meta.textContent = asset.fileName;

          const link = document.createElement('a');
          link.href = asset.url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = `Åpne fil (${formatBytes(asset.sizeBytes)})`;

          const actions = document.createElement('div');
          actions.className = 'asset-item__actions';
          actions.appendChild(link);

          if (state.user?.role === 'admin' && state.activeProjectId) {
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn btn-small asset-delete-btn';
            deleteButton.textContent = 'Slett fil';
            deleteButton.addEventListener('click', () => {
              deleteAsset(state.activeProjectId, asset);
            });
            actions.appendChild(deleteButton);
          }

          li.append(label, meta, actions);
          assetList.appendChild(li);
        }
      };

      for (const folderName of orderedFolders) {
        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'asset-folder-tile';
        folderButton.innerHTML = `
          <span class="asset-folder-icon" aria-hidden="true"></span>
          <span class="asset-folder-name">${folderName}</span>
          <span class="asset-folder-count">${(groupedAssets.get(folderName) || []).length} filer</span>
        `;

        folderButton.addEventListener('click', () => {
          assetFolders?.querySelectorAll('.asset-folder-tile').forEach((item) => item.classList.remove('active'));
          folderButton.classList.add('active');
          renderFolderItems(folderName);
        });

        assetFolders?.appendChild(folderButton);
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
        empty.textContent = 'Du har foreløpig ingen tildelte prosjekter.';
        projectList.appendChild(empty);
        assetHint.textContent = 'Ingen prosjekter tilgjengelig.';
        clearDownloadActions();
        return;
      }

      state.activeProjectId = null;
      clearAssets();
      clearAssetFolders();
      clearDownloadActions();
      assetHint.textContent = 'Klikk på et prosjekt i "Dine prosjekter" for å vise ressurser.';

      for (const project of projects) {
        const li = document.createElement('li');
        li.className = 'project-item';

        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `<strong>${project.name}</strong><span>${project.description || ''}</span>`;
        button.addEventListener('click', async () => {
          state.activeProjectId = project.id;
          projectList.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
          button.classList.add('active');
          await loadAssets(project.id);
        });

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

      return projects.payload.projects || [];
    };

    const renderProjectMemberOptions = () => {
      if (!createProjectMembers) {
        return;
      }

      createProjectMembers.innerHTML = '';

      if (!state.adminUsers.length) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Ingen medlemmer tilgjengelig';
        emptyOption.disabled = true;
        createProjectMembers.appendChild(emptyOption);
        return;
      }

      for (const user of state.adminUsers) {
        if (user.role !== 'client') {
          continue;
        }

        const option = document.createElement('option');
        option.value = user.email;
        option.textContent = `${user.name} (${user.email})`;
        createProjectMembers.appendChild(option);
      }
    };

    const loadAdminUsers = async (force = false) => {
      if (state.user?.role !== 'admin') {
        return [];
      }

      if (state.adminUsersLoading) {
        return state.adminUsers;
      }

      if (state.adminUsersLoaded && !force) {
        return state.adminUsers;
      }

      state.adminUsersLoading = true;

      const usersResult = await request('/api/admin/users');
      state.adminUsersLoading = false;

      if (!usersResult.response.ok) {
        return [];
      }

      state.adminUsers = usersResult.payload?.users || [];
      state.adminUsersLoaded = true;
      renderProjectMemberOptions();
      return state.adminUsers;
    };

    const bootAdmin = () => {
      if (state.user?.role !== 'admin' || !adminPanel) {
        return;
      }

      adminPanel.hidden = false;

      if (createProjectMembers) {
        createProjectMembers.innerHTML = '<option disabled>Trykk for å laste medlemmer...</option>';

        const lazyLoadMembers = async () => {
          await loadAdminUsers();
        };

        createProjectMembers.addEventListener('focus', lazyLoadMembers, { once: true });
        createProjectMembers.addEventListener('pointerdown', lazyLoadMembers, { once: true });
      }

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
        await loadAdminUsers(true);
        setMessage(adminMessage, `Bruker opprettet: ${result.payload.user.email}`);
      });

      createProjectForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(createProjectForm);
        const selectedMemberEmails = createProjectMembers
          ? Array.from(createProjectMembers.selectedOptions).map((option) => option.value)
          : [];
        const payload = {
          name: String(data.get('name') || '').trim(),
          description: String(data.get('description') || '').trim(),
          memberEmails: selectedMemberEmails
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
        if (state.activeProjectId === projectId) {
          await loadAssets(projectId);
        }
        const uploadedAssets = Array.isArray(result.payload?.assets)
          ? result.payload.assets
          : result.payload?.asset
            ? [result.payload.asset]
            : [];

        const uploadedCount = uploadedAssets.length;
        if (uploadedCount === 1) {
          setMessage(adminMessage, `Fil lastet opp: ${uploadedAssets[0].fileName}`);
          return;
        }

        setMessage(adminMessage, `${uploadedCount} filer ble lastet opp.`);
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
      window.location.href = 'https://sorhaugconsulting.no';
    });

    bootDashboard().catch(() => {
      window.location.href = '/innlogging.html';
    });
  }
})();
