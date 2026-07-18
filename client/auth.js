(() => {
  const state = {
    csrfToken: null,
    user: null,
    projects: [],
    activeProjectId: null,
    adminUsers: [],
    adminUsersLoaded: false,
    adminUsersLoading: false,
    currentAssets: [],
    assetFilter: 'all',
    activeFolderName: null
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

    const resetRegisterState = () => {
      if (registerSuccessBadge) {
        registerSuccessBadge.hidden = true;
        registerSuccessBadge.classList.remove('show');
      }
      if (registerMessage) {
        registerMessage.textContent = '';
        registerMessage.classList.remove('error');
      }
    };

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

      resetRegisterState();

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

    window.addEventListener('pageshow', () => {
      setRegisterVisible(false);
      resetRegisterState();
    });

    toggleRegisterButton?.addEventListener('click', () => {
      const nextVisible = registerWrap?.hidden;
      setRegisterVisible(Boolean(nextVisible));
    });

    wireEnterNavigation([loginEmailInput, loginPasswordInput]);
    wireEnterNavigation([registerNameInput, registerEmailInput, registerPasswordInput]);

    for (const input of [registerNameInput, registerEmailInput, registerPasswordInput]) {
      input?.addEventListener('input', () => {
        resetRegisterState();
      });
    }

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
    const projectAccessOverview = document.getElementById('projectAccessOverview');
    const projectAccessList = document.getElementById('projectAccessList');
    const assetFilterBar = document.getElementById('assetFilterBar');
    const logoutButton = document.getElementById('logoutButton');

    const explorerBody = document.getElementById('explorerBody');
    const explorerPath = document.getElementById('explorerPath');
    const explorerWindow = document.getElementById('explorerWindow');
    const resourceToolbar = document.getElementById('resourceToolbar');
    const toolbarUploadBtn = document.getElementById('toolbarUploadBtn');
    const toolbarDownloadAllBtn = document.getElementById('toolbarDownloadAllBtn');
    const toolbarAccessBtn = document.getElementById('toolbarAccessBtn');
    const toolbarAccessCount = document.getElementById('toolbarAccessCount');
    const resourceSummary = document.getElementById('resourceSummary');
    const resourceEmpty = document.getElementById('resourceEmpty');
    const resourceEmptyUploadBtn = document.getElementById('resourceEmptyUploadBtn');
    const folderBackBtn = document.getElementById('folderBackBtn');
    const folderDownloadBtn = document.getElementById('folderDownloadBtn');
    const pathRootBtn = document.getElementById('pathRootBtn');
    const pathSep = document.getElementById('pathSep');
    const pathCurrent = document.getElementById('pathCurrent');
    const accessCloseBtn = document.getElementById('accessCloseBtn');
    const uploadCloseBtn = document.getElementById('uploadCloseBtn');

    const memberUploadSection = document.getElementById('memberUploadSection');
    const memberUploadForm = document.getElementById('memberUploadForm');
    const memberUploadDropzone = document.getElementById('memberUploadDropzone');
    const memberUploadFilesInput = document.getElementById('memberUploadFilesInput');
    const memberUploadTitle = document.getElementById('memberUploadTitle');
    const memberUploadKind = document.getElementById('memberUploadKind');
    const memberUploadSummary = document.getElementById('memberUploadSummary');
    const memberUploadList = document.getElementById('memberUploadList');
    const memberUploadSubmit = document.getElementById('memberUploadSubmit');
    const memberUploadClear = document.getElementById('memberUploadClear');
    const memberUploadMessage = document.getElementById('memberUploadMessage');

    const createProjectForm = document.getElementById('createProjectForm');
    const createProjectMembersToggle = document.getElementById('createProjectMembersToggle');
    const createProjectMembersPanel = document.getElementById('createProjectMembersPanel');
    const createProjectMembers = document.getElementById('createProjectMembers');
    const createProjectSelectedMembers = document.getElementById('createProjectSelectedMembers');
    const createProjectSelectedMembersList = document.getElementById('createProjectSelectedMembersList');
    const addMemberForm = document.getElementById('addMemberForm');
    const addMemberToggle = document.getElementById('addMemberToggle');
    const addMemberPanel = document.getElementById('addMemberPanel');
    const addMemberEmail = document.getElementById('addMemberEmail');
    const addMemberSelectedMember = document.getElementById('addMemberSelectedMember');
    const addMemberSelectedMemberList = document.getElementById('addMemberSelectedMemberList');
    const addMemberAvailableMembers = document.getElementById('addMemberAvailableMembers');
    const addMemberAvailableMembersList = document.getElementById('addMemberAvailableMembersList');
    const uploadAssetForm = document.getElementById('uploadAssetForm');
    const adminProjectSelect = document.getElementById('adminProjectSelect');
    const assetProjectSelect = document.getElementById('assetProjectSelect');
    const assetFilesInput = document.getElementById('assetFilesInput');
    const uploadSelectionSummary = document.getElementById('uploadSelectionSummary');
    const uploadSelectionList = document.getElementById('uploadSelectionList');

    const UPLOAD_MAX_FILE_SIZE = 20 * 1024 * 1024;
    const UPLOAD_MAX_FILES = 100;
    const pendingUploadFiles = [];
    const pendingMemberUploadFiles = [];
    const ALLOWED_UPLOAD_EXTENSIONS = new Set([
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.svg',
      '.pdf',
      '.xml',
      '.txt',
      '.csv',
      '.doc',
      '.docx',
      '.docs',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.zip',
      '.json'
    ]);

    const clearAssets = () => {
      assetList.innerHTML = '';
      if (assetFolderContent) {
        assetFolderContent.hidden = true;
      }
      if (assetFolderTitle) {
        assetFolderTitle.textContent = '';
      }
      state.activeFolderName = null;
    };

    const clearAssetFolders = () => {
      if (!assetFolders) {
        return;
      }

      assetFolders.innerHTML = '';
    };

    const clearDownloadActions = () => {
      // Nedlastingsknapp er nå en del av verktoylinjen; ingen egen liste.
    };

    const setToolbarVisible = (visible) => {
      if (explorerBody) explorerBody.hidden = !visible;
    };

    const setResourceSummary = () => {
      // Sammendrag vises nå via adresselinjen; beholdt som no-op.
    };

    const setResourceEmptyVisible = (visible) => {
      if (resourceEmpty) resourceEmpty.hidden = !visible;
    };

    // Viser/skjuler adresselinjen og selve filvinduet (mapper/filer/tomt).
    // Brukes til å gi ETT fokusert steg når opplasting eller personer er åpne.
    const setWindowChromeVisible = (visible) => {
      if (explorerPath) explorerPath.hidden = !visible;
      if (explorerWindow) explorerWindow.hidden = !visible;
    };

    const setBreadcrumb = (folderName) => {
      if (!pathCurrent || !pathSep || !pathRootBtn) return;
      if (folderName) {
        pathSep.hidden = false;
        pathCurrent.hidden = false;
        pathCurrent.textContent = folderName;
        pathRootBtn.classList.remove('is-current');
      } else {
        pathSep.hidden = true;
        pathCurrent.hidden = true;
        pathCurrent.textContent = '';
        pathRootBtn.classList.add('is-current');
      }
    };

    const setUploadPanelOpen = (open) => {
      if (!memberUploadSection) return;
      memberUploadSection.hidden = !open;
      if (toolbarUploadBtn) {
        toolbarUploadBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toolbarUploadBtn.classList.toggle('is-open', open);
      }
      if (open) {
        // Kun opplasting synlig – skjul mapper/filer/tomt slik at det er
        // umulig å bli forvirret av flere valg samtidig.
        setAccessPanelOpen(false);
        setWindowChromeVisible(false);
        memberUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setWindowChromeVisible(true);
      }
    };

    const setAccessPanelOpen = (open) => {
      if (!projectAccessOverview) return;
      projectAccessOverview.hidden = !open;
      if (toolbarAccessBtn) {
        toolbarAccessBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toolbarAccessBtn.classList.toggle('is-open', open);
      }
      if (open) {
        if (memberUploadSection) memberUploadSection.hidden = true;
        if (toolbarUploadBtn) toolbarUploadBtn.classList.remove('is-open');
        setWindowChromeVisible(false);
        projectAccessOverview.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setWindowChromeVisible(true);
      }
    };

    const clearAssetFilterBar = () => {
      if (!assetFilterBar) {
        return;
      }

      assetFilterBar.hidden = true;
    };

    const hideMemberUpload = () => {
      if (!memberUploadSection) {
        return;
      }

      setUploadPanelOpen(false);
      pendingMemberUploadFiles.length = 0;
      renderMemberUploadSelection();
      setMessage(memberUploadMessage, '');
    };

    const showMemberUpload = () => {
      setUploadPanelOpen(true);
    };

    const clearProjectAccess = () => {
      if (!projectAccessOverview || !projectAccessList) {
        return;
      }

      projectAccessList.innerHTML = '';
      projectAccessOverview.hidden = true;
      if (toolbarAccessCount) toolbarAccessCount.textContent = '0';
      setAccessPanelOpen(false);
    };

    const renderProjectAccess = (members = []) => {
      if (!projectAccessOverview || !projectAccessList) {
        return;
      }

      projectAccessList.innerHTML = '';

      if (toolbarAccessCount) {
        toolbarAccessCount.textContent = String(members.length);
      }

      if (!members.length) {
        const empty = document.createElement('li');
        empty.className = 'project-access-item project-access-item--empty';
        empty.textContent = 'Ingen medlemmer er tildelt dette prosjektet enda.';
        projectAccessList.appendChild(empty);
        return;
      }

      for (const member of members) {
        const item = document.createElement('li');
        item.className = 'project-access-item';

        const name = document.createElement('strong');
        name.textContent = member.name || member.email;

        const email = document.createElement('span');
        email.textContent = member.email;

        const role = document.createElement('span');
        role.className = 'project-access-role';
        role.textContent = member.role === 'admin' ? 'Admin-tilgang' : 'Prosjektmedlem';

        item.append(name, email, role);
        projectAccessList.appendChild(item);
      }
    };

    const getFileExtension = (fileName) => {
      const value = String(fileName || '').toLowerCase();
      if (!value.includes('.')) {
        return '';
      }

      return value.slice(value.lastIndexOf('.'));
    };

    const validateUploadFiles = (files) => {
      if (!files.length) {
        return { ok: false, message: 'Du ma velge minst en fil.' };
      }

      if (files.length > UPLOAD_MAX_FILES) {
        return { ok: false, message: `Du kan laste opp maks ${UPLOAD_MAX_FILES} filer per opplasting.` };
      }

      for (const file of files) {
        if ((file.size || 0) > UPLOAD_MAX_FILE_SIZE) {
          return { ok: false, message: `Filen ${file.name} er for stor. Maks 20 MB per fil.` };
        }

        const ext = getFileExtension(file.name);
        if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
          return { ok: false, message: `Ugyldig filtype: ${file.name}` };
        }
      }

      return { ok: true };
    };

    const renderMemberUploadSelection = () => {
      if (!memberUploadSummary || !memberUploadList) {
        return;
      }

      const files = [...pendingMemberUploadFiles];
      if (!files.length) {
        memberUploadSummary.textContent = 'Ingen filer valgt.';
        memberUploadList.innerHTML = '';
        memberUploadList.hidden = true;
        if (memberUploadSubmit) memberUploadSubmit.disabled = true;
        if (memberUploadClear) memberUploadClear.hidden = true;
        return;
      }

      const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
      memberUploadSummary.textContent = `${files.length} fil(er) valgt, totalt ${formatBytes(totalSize)}.`;

      memberUploadList.innerHTML = '';
      const topFiles = files.slice(0, 12);
      topFiles.forEach((file, index) => {
        const item = document.createElement('li');
        item.className = 'member-upload__list-item';

        const info = document.createElement('div');
        info.className = 'member-upload__list-info';

        const name = document.createElement('span');
        name.className = 'member-upload__list-name';
        name.textContent = file.name;

        const size = document.createElement('span');
        size.className = 'member-upload__list-size';
        size.textContent = formatBytes(file.size || 0);

        info.append(name, size);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'member-upload__list-remove';
        removeBtn.setAttribute('aria-label', `Fjern ${file.name} fra opplastingen`);
        removeBtn.textContent = '\u00d7';
        removeBtn.addEventListener('click', () => {
          pendingMemberUploadFiles.splice(index, 1);
          renderMemberUploadSelection();
        });

        item.append(info, removeBtn);
        memberUploadList.appendChild(item);
      });

      if (files.length > topFiles.length) {
        const more = document.createElement('li');
        more.className = 'member-upload__list-more';
        more.textContent = `+ ${files.length - topFiles.length} flere filer`;
        memberUploadList.appendChild(more);
      }

      memberUploadList.hidden = false;
      if (memberUploadClear) memberUploadClear.hidden = false;

      const validation = validateUploadFiles(files);
      if (memberUploadSubmit) memberUploadSubmit.disabled = !validation.ok;

      if (!validation.ok) {
        setMessage(memberUploadMessage, validation.message, true);
      } else {
        setMessage(memberUploadMessage, '');
      }
    };

    const renderUploadSelection = () => {
      if (!uploadSelectionSummary || !uploadSelectionList) {
        return;
      }

      const files = [...pendingUploadFiles];
      if (!files.length) {
        uploadSelectionSummary.textContent = 'Ingen filer valgt.';
        uploadSelectionList.innerHTML = '';
        uploadSelectionList.hidden = true;
        return;
      }

      const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
      uploadSelectionSummary.textContent = `${files.length} fil(er) valgt, totalt ${formatBytes(totalSize)}.`;

      const topFiles = files.slice(0, 8);
      uploadSelectionList.innerHTML = topFiles
        .map((file) => `<li><span>${file.name}</span><strong>${formatBytes(file.size || 0)}</strong></li>`)
        .join('');

      if (files.length > topFiles.length) {
        const item = document.createElement('li');
        item.className = 'upload-selection-list__more';
        item.textContent = `+ ${files.length - topFiles.length} flere filer`;
        uploadSelectionList.appendChild(item);
      }

      uploadSelectionList.hidden = false;
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
        `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        { method: 'DELETE' }
      );

      if (!result.response.ok) {
        setMessage(memberUploadMessage, result.payload?.message || 'Klarte ikke slette filen.', true);
        setMessage(adminMessage, result.payload?.message || 'Klarte ikke slette filen.', true);
        return;
      }

      setMessage(memberUploadMessage, `Fil slettet: ${asset.fileName || asset.title}`);
      setMessage(adminMessage, `Fil slettet: ${asset.fileName || asset.title}`);
      await loadAssets(projectId);
    };

    const detectAssetFolder = (asset) => {
      const name = String(asset?.fileName || '').toLowerCase();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'Bilder';
      return 'Dokumenter';
    };

    const folderSortOrder = ['Bilder', 'Dokumenter'];

    const folderKeyByName = {
      Bilder: 'bilder',
      Dokumenter: 'andre-filer'
    };

    const relativeTimeFormatter =
      typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat('no', { numeric: 'auto' })
        : null;

    const formatUploadedWhen = (isoString) => {
      if (!isoString) return '';
      const uploaded = new Date(isoString);
      if (Number.isNaN(uploaded.getTime())) return '';

      if (relativeTimeFormatter) {
        const diffMs = uploaded.getTime() - Date.now();
        const diffMinutes = Math.round(diffMs / (60 * 1000));
        const absMinutes = Math.abs(diffMinutes);
        if (absMinutes < 60) return relativeTimeFormatter.format(diffMinutes, 'minute');
        const diffHours = Math.round(diffMs / (60 * 60 * 1000));
        if (Math.abs(diffHours) < 24) return relativeTimeFormatter.format(diffHours, 'hour');
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
        if (Math.abs(diffDays) < 30) return relativeTimeFormatter.format(diffDays, 'day');
      }

      return uploaded.toLocaleDateString('no', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const buildUploaderBadge = (asset) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'uploader-info';

      const badge = document.createElement('span');
      badge.className = 'uploader-badge';

      const uploader = asset.uploader;
      const currentUserId = state.user?.id;
      const isOwn = Boolean(uploader?.id && currentUserId && uploader.id === currentUserId);

      if (!uploader) {
        badge.classList.add('uploader-badge--unknown');
        badge.textContent = 'Ukjent opplaster';
      } else if (isOwn) {
        badge.classList.add('uploader-badge--own');
        badge.textContent = uploader.role === 'admin' ? 'Lastet opp av deg (admin)' : 'Lastet opp av deg';
      } else if (uploader.role === 'admin') {
        badge.classList.add('uploader-badge--admin');
        badge.textContent = `Admin - ${uploader.name || uploader.email || 'ukjent'}`;
      } else {
        badge.classList.add('uploader-badge--member');
        badge.textContent = `Medlem - ${uploader.name || uploader.email || 'ukjent'}`;
      }

      wrapper.appendChild(badge);

      const when = formatUploadedWhen(asset.createdAt);
      if (when) {
        const time = document.createElement('span');
        time.className = 'uploader-time';
        time.textContent = when;
        wrapper.appendChild(time);
      }

      return wrapper;
    };

    const applyAssetFilter = (assets) => {
      const filter = state.assetFilter;
      if (filter === 'all') return assets;
      if (filter === 'admin') return assets.filter((asset) => asset.uploader?.role === 'admin');
      if (filter === 'members') return assets.filter((asset) => asset.uploader?.role === 'client');
      if (filter === 'mine') return assets.filter((asset) => asset.uploader?.id && asset.uploader.id === state.user?.id);
      return assets;
    };

    const updateAssetFilterCounts = (assets) => {
      if (!assetFilterBar) return;

      const counts = {
        all: assets.length,
        admin: assets.filter((asset) => asset.uploader?.role === 'admin').length,
        members: assets.filter((asset) => asset.uploader?.role === 'client').length,
        mine: assets.filter((asset) => asset.uploader?.id && asset.uploader.id === state.user?.id).length
      };

      let visibleTabs = 0;
      for (const tab of assetFilterBar.querySelectorAll('.asset-filter-tab')) {
        const key = tab.dataset.filter;
        const value = counts[key] ?? 0;
        const counter = tab.querySelector('.asset-filter-count');
        if (counter) counter.textContent = String(value);
        const shouldShow = key === 'all' || value > 0;
        tab.hidden = !shouldShow;
        if (shouldShow) visibleTabs += 1;
      }

      // Skjul hele filterlinjen om kun «Alle» finnes.
      assetFilterBar.hidden = visibleTabs <= 1;
    };

    const setAssetFilter = (filter) => {
      state.assetFilter = filter;
      if (assetFilterBar) {
        for (const tab of assetFilterBar.querySelectorAll('.asset-filter-tab')) {
          const isActive = tab.dataset.filter === filter;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }
      }
      renderAssets(state.currentAssets, { preserveFilter: true });
    };

    const renderDownloadActions = () => {
      // Nedlastingsknappen er nå en del av verktøylinjen. Beholdes som no-op av bakoverkompatibilitet.
    };

    const fileIconKind = (fileName) => {
      const name = String(fileName || '').toLowerCase();
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
      if (ext === '.pdf') return 'pdf';
      if (['.doc', '.docx', '.docs', '.txt'].includes(ext)) return 'doc';
      if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'sheet';
      if (['.ppt', '.pptx'].includes(ext)) return 'slides';
      if (ext === '.zip') return 'zip';
      return 'file';
    };

    const closeFolderView = () => {
      if (assetFolderContent) assetFolderContent.hidden = true;
      if (assetList) assetList.innerHTML = '';
      if (assetFolders) assetFolders.hidden = false;
      state.activeFolderName = null;
      setBreadcrumb(null);
      assetFolders?.querySelectorAll('.explorer-folder').forEach((item) => item.classList.remove('active'));
    };

    const renderAssets = (assets, options = {}) => {
      state.currentAssets = Array.isArray(assets) ? assets : [];
      clearAssets();
      clearAssetFolders();

      // Ingen filer i prosjektet enda.
      if (!state.currentAssets.length) {
        assetHint.textContent = '';
        if (assetFolders) assetFolders.hidden = true;
        if (assetFolderContent) assetFolderContent.hidden = true;
        setBreadcrumb(null);
        setResourceEmptyVisible(true);
        return;
      }

      setResourceEmptyVisible(false);
      if (assetFolders) assetFolders.hidden = false;

      const groupedAssets = new Map();
      for (const asset of state.currentAssets) {
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

      assetHint.textContent = '';

      const renderFolderItems = (folderName) => {
        clearAssets();
        state.activeFolderName = folderName;
        setResourceEmptyVisible(false);
        if (assetFolders) assetFolders.hidden = true;
        if (assetFolderContent) assetFolderContent.hidden = false;
        setBreadcrumb(folderName);

        const count = (groupedAssets.get(folderName) || []).length;
        if (assetFolderTitle) {
          assetFolderTitle.textContent = `${folderName} — ${count} ${count === 1 ? 'fil' : 'filer'}`;
        }

        const selectedAssets = groupedAssets.get(folderName) || [];
        for (const asset of selectedAssets) {
          const li = document.createElement('li');
          li.className = 'asset-item';

          const icon = document.createElement('span');
          icon.className = 'asset-item__icon';
          icon.dataset.type = fileIconKind(asset.fileName);
          icon.setAttribute('aria-hidden', 'true');

          const body = document.createElement('div');
          body.className = 'asset-item__body';

          const header = document.createElement('div');
          header.className = 'asset-item__header';

          const label = document.createElement('p');
          label.className = 'asset-item__title';
          label.textContent = asset.title;

          header.appendChild(label);
          header.appendChild(buildUploaderBadge(asset));

          const meta = document.createElement('p');
          meta.className = 'asset-item__meta';
          meta.textContent = `${asset.fileName} · ${formatBytes(asset.sizeBytes)}`;

          const actions = document.createElement('div');
          actions.className = 'asset-item__actions';

          const iconType = fileIconKind(asset.fileName);
          const isViewable = iconType === 'image' || iconType === 'pdf';

          const link = document.createElement('a');
          link.className = 'asset-item__open';
          if (isViewable) {
            link.href = asset.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Åpne';
          } else {
            // Dokumenter, regneark, tekst osv. lastes ned slik at de åpnes
            // i riktig program på maskinen i stedet for uleselig råtekst.
            // Ingen ny fane – nedlastingen skjer i bakgrunnen.
            link.href = `${asset.url}&download=1`;
            link.textContent = 'Last ned';
          }
          actions.appendChild(link);

          if (asset.canDelete && state.activeProjectId) {
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn btn-small asset-delete-btn';
            deleteButton.textContent = 'Slett';
            deleteButton.addEventListener('click', () => {
              deleteAsset(state.activeProjectId, asset);
            });
            actions.appendChild(deleteButton);
          }

          body.append(header, meta, actions);
          li.append(icon, body);
          assetList.appendChild(li);
        }
      };

      state.openFolderByName = renderFolderItems;

      let folderToOpen = null;
      for (const folderName of orderedFolders) {
        const count = (groupedAssets.get(folderName) || []).length;
        const folderButton = document.createElement('button');
        folderButton.type = 'button';
        folderButton.className = 'explorer-folder';
        folderButton.innerHTML = `
          <span class="explorer-folder__icon" aria-hidden="true"></span>
          <span class="explorer-folder__name">${folderName}</span>
          <span class="explorer-folder__count">${count} ${count === 1 ? 'fil' : 'filer'}</span>
        `;

        folderButton.addEventListener('click', () => {
          renderFolderItems(folderName);
        });

        assetFolders?.appendChild(folderButton);

        if (options.preserveFilter && state.activeFolderName === folderName) {
          folderToOpen = folderName;
        }
      }

      if (folderToOpen) {
        renderFolderItems(folderToOpen);
      } else {
        setBreadcrumb(null);
      }
    };

    const loadAssets = async (projectId) => {
      assetHint.textContent = 'Laster filer...';
      setResourceSummary('');
      setResourceEmptyVisible(false);
      clearAssets();
      clearAssetFilterBar();
      state.assetFilter = 'all';

      const { response, payload } = await request(`/api/projects/${encodeURIComponent(projectId)}/assets`);
      if (!response.ok) {
        assetHint.textContent = payload?.message || 'Klarte ikke hente filene.';
        return;
      }

      renderAssets(payload.assets || []);
    };

    const loadProjectAccess = async (projectId) => {
      clearProjectAccess();

      const { response, payload } = await request(`/api/projects/${encodeURIComponent(projectId)}/members`);
      if (!response.ok) {
        return;
      }

      renderProjectAccess(payload.members || []);
    };

    const renderProjects = (projects) => {
      state.projects = projects;
      projectList.innerHTML = '';
      if (!projects.length) {
        const empty = document.createElement('li');
        empty.className = 'project-item';
        empty.textContent = 'Du har foreløpig ingen tildelte prosjekter.';
        projectList.appendChild(empty);
        assetHint.textContent = 'Du har ingen prosjekter enda. Kontakt Sorhaug Consulting hvis du forventer tilgang.';
        setResourceSummary('');
        setResourceEmptyVisible(false);
        setToolbarVisible(false);
        clearDownloadActions();
        clearAssetFilterBar();
        hideMemberUpload();
        return;
      }

      state.activeProjectId = null;
      clearAssets();
      clearAssetFolders();
      clearDownloadActions();
      clearAssetFilterBar();
      clearProjectAccess();
      hideMemberUpload();
      setToolbarVisible(false);
      setResourceEmptyVisible(false);
      setResourceSummary('');
      assetHint.textContent = 'Trykk på et prosjekt til venstre for å se filene.';

      for (const project of projects) {
        const li = document.createElement('li');
        li.className = 'project-item';

        const row = document.createElement('div');
        row.className = 'project-item__row';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-item__open';
        button.innerHTML = `<strong>${project.name}</strong><span>${project.description || ''}</span>`;
        button.addEventListener('click', async () => {
          state.activeProjectId = project.id;
          projectList.querySelectorAll('.project-item__open').forEach((item) => item.classList.remove('active'));
          button.classList.add('active');
          hideMemberUpload();
          setAccessPanelOpen(false);
          closeFolderView();
          setToolbarVisible(true);
          setResourceEmptyVisible(false);
          assetHint.textContent = 'Laster filer...';
          await Promise.all([loadAssets(project.id), loadProjectAccess(project.id)]);
        });

        row.appendChild(button);

        if (state.user?.role === 'admin') {
          const deleteButton = document.createElement('button');
          deleteButton.type = 'button';
          deleteButton.className = 'project-item__delete';
          deleteButton.setAttribute('aria-label', `Slett prosjektet ${project.name}`);
          deleteButton.title = 'Slett prosjekt';
          deleteButton.textContent = 'Slett';
          deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteProject(project);
          });
          row.appendChild(deleteButton);
        }

        li.appendChild(row);
        projectList.appendChild(li);
      }
    };

    const deleteProject = async (project) => {
      if (!project?.id) return;
      if (state.user?.role !== 'admin') return;

      const firstConfirm = window.confirm(
        `Slett prosjektet "${project.name}"?\n\nAlle filer, medlemskap og opplastinger for prosjektet fjernes permanent.`
      );
      if (!firstConfirm) return;

      const typed = window.prompt(
        `Bekreft ved \u00e5 skrive inn prosjektnavnet n\u00f8yaktig for \u00e5 slette:\n\n${project.name}`
      );
      if (typed === null) return;
      if (String(typed).trim() !== project.name) {
        setMessage(adminMessage, 'Sletting avbrutt: prosjektnavnet stemte ikke.', true);
        return;
      }

      const { response, payload } = await request(
        `/api/admin/projects/${encodeURIComponent(project.id)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        setMessage(adminMessage, payload?.message || 'Klarte ikke slette prosjektet.', true);
        return;
      }

      if (state.activeProjectId === project.id) {
        state.activeProjectId = null;
        clearAssets();
        clearAssetFolders();
        clearDownloadActions();
        clearAssetFilterBar();
        clearProjectAccess();
        hideMemberUpload();
        setToolbarVisible(false);
        setResourceEmptyVisible(false);
        setResourceSummary('');
        assetHint.textContent = 'Prosjektet er slettet. Velg et annet prosjekt.';
      }

      const assetCount = payload?.deleted?.assetCount ?? 0;
      const suffix = assetCount ? ` (${assetCount} fil(er) fjernet)` : '';
      setMessage(adminMessage, `Prosjekt slettet: ${project.name}${suffix}`);

      await loadProjects();
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

      renderCreateProjectSelectedMembers();
    };

    const renderCreateProjectSelectedMembers = () => {
      if (!createProjectMembers || !createProjectSelectedMembers || !createProjectSelectedMembersList) {
        return;
      }

      const selectedOptions = Array.from(createProjectMembers.selectedOptions).filter((option) => Boolean(option.value));

      if (!selectedOptions.length) {
        createProjectSelectedMembers.hidden = true;
        createProjectSelectedMembersList.innerHTML = '';
        return;
      }

      createProjectSelectedMembers.hidden = false;
      createProjectSelectedMembersList.innerHTML = '';

      for (const option of selectedOptions) {
        const chip = document.createElement('span');
        chip.className = 'selected-members-chip';
        chip.textContent = option.textContent;
        createProjectSelectedMembersList.appendChild(chip);
      }
    };

    const renderAddMemberSelectedMember = () => {
      if (!addMemberSelectedMember || !addMemberSelectedMemberList || !addMemberEmail) {
        return;
      }

      const email = String(addMemberEmail.value || '').trim().toLowerCase();
      if (!email) {
        addMemberSelectedMember.hidden = true;
        addMemberSelectedMemberList.innerHTML = '';
        return;
      }

      const matchedUser = (state.adminUsers || []).find((user) => String(user.email || '').toLowerCase() === email);
      const label = matchedUser ? `${matchedUser.name} (${matchedUser.email})` : email;

      addMemberSelectedMember.hidden = false;
      addMemberSelectedMemberList.innerHTML = '';

      const chip = document.createElement('span');
      chip.className = 'selected-members-chip';
      chip.textContent = label;
      addMemberSelectedMemberList.appendChild(chip);
    };

    const renderAddMemberAvailableMembers = () => {
      if (!addMemberAvailableMembers || !addMemberAvailableMembersList) {
        return;
      }

      const users = (state.adminUsers || []).filter((user) => user.role === 'client');
      if (!users.length) {
        addMemberAvailableMembers.hidden = true;
        addMemberAvailableMembersList.innerHTML = '';
        return;
      }

      addMemberAvailableMembers.hidden = false;
      addMemberAvailableMembersList.innerHTML = '';

      for (const user of users) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'available-member-chip';
        button.textContent = `${user.name} (${user.email})`;
        button.addEventListener('click', () => {
          if (addMemberEmail) {
            addMemberEmail.value = user.email;
          }
          renderAddMemberSelectedMember();
        });
        addMemberAvailableMembersList.appendChild(button);
      }
    };

    const setCreateProjectMembersOpen = (open) => {
      if (!createProjectMembersPanel || !createProjectMembersToggle) {
        return;
      }

      createProjectMembersPanel.hidden = !open;
      createProjectMembersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      createProjectMembersToggle.textContent = open ? 'Skjul medlemmer' : 'Velg medlemmer';
    };

    const setAddMemberOpen = (open) => {
      if (!addMemberPanel || !addMemberToggle) {
        return;
      }

      addMemberPanel.hidden = !open;
      addMemberToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      addMemberToggle.textContent = open ? 'Skjul medlemmer' : 'Velg medlemmer';
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
      renderAddMemberAvailableMembers();
      return state.adminUsers;
    };

    const bootAdmin = () => {
      if (state.user?.role !== 'admin' || !adminPanel) {
        return;
      }

      adminPanel.hidden = false;

      setCreateProjectMembersOpen(false);
      setAddMemberOpen(false);

      createProjectMembersToggle?.addEventListener('click', async () => {
        const willOpen = Boolean(createProjectMembersPanel?.hidden);
        setCreateProjectMembersOpen(willOpen);
        if (willOpen) {
          await loadAdminUsers();
        }
      });

      createProjectMembers?.addEventListener('change', () => {
        renderCreateProjectSelectedMembers();
        const hasSelection = Array.from(createProjectMembers.selectedOptions).some((option) => Boolean(option.value));
        if (hasSelection) {
          setCreateProjectMembersOpen(false);
        }
      });

      addMemberToggle?.addEventListener('click', async () => {
        const willOpen = Boolean(addMemberPanel?.hidden);
        setAddMemberOpen(willOpen);
        if (willOpen) {
          await loadAdminUsers();
          renderAddMemberSelectedMember();
          addMemberEmail?.focus();
        }
      });

      addMemberEmail?.addEventListener('input', () => {
        renderAddMemberSelectedMember();
      });

      if (createProjectMembers) {
        createProjectMembers.innerHTML = '<option disabled>Trykk på "Velg medlemmer" først...</option>';
      }

      renderCreateProjectSelectedMembers();
      renderAddMemberSelectedMember();
      renderAddMemberAvailableMembers();

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
        if (createProjectMembers) {
          for (const option of createProjectMembers.options) {
            option.selected = false;
          }
        }
        renderCreateProjectSelectedMembers();
        setCreateProjectMembersOpen(false);
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
        renderAddMemberSelectedMember();
        renderAddMemberAvailableMembers();
        setAddMemberOpen(false);
        setMessage(adminMessage, `Medlem lagt til: ${result.payload.member.email}`);
      });

      uploadAssetForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = uploadAssetForm.querySelector('button[type="submit"]');
        const selectedFiles = [...pendingUploadFiles];
        const validation = validateUploadFiles(selectedFiles);
        if (!validation.ok) {
          setMessage(adminMessage, validation.message, true);
          return;
        }

        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = 'Laster opp...';
        }

        const data = new FormData(uploadAssetForm);
        data.delete('files');
        for (const file of selectedFiles) {
          data.append('files', file, file.name);
        }
        const projectId = String(data.get('projectId') || '');
        try {
          const result = await request(`/api/admin/projects/${encodeURIComponent(projectId)}/assets`, {
            method: 'POST',
            body: data
          });

          if (!result.response.ok) {
            setMessage(adminMessage, result.payload?.message || 'Klarte ikke laste opp fil.', true);
            return;
          }

          uploadAssetForm.reset();
          pendingUploadFiles.length = 0;
          if (assetFilesInput) {
            assetFilesInput.value = '';
          }
          renderUploadSelection();

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
        } finally {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = false;
            submitButton.textContent = 'Last opp filer';
          }
        }
      });

      assetFilesInput?.addEventListener('change', () => {
        const pickedFiles = assetFilesInput.files ? Array.from(assetFilesInput.files) : [];
        if (pickedFiles.length) {
          for (const file of pickedFiles) {
            const exists = pendingUploadFiles.some(
              (existing) =>
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );

            if (!exists) {
              pendingUploadFiles.push(file);
            }
          }
        }

        if (assetFilesInput) {
          assetFilesInput.value = '';
        }

        renderUploadSelection();

        const selectedFiles = [...pendingUploadFiles];
        const validation = validateUploadFiles(selectedFiles);
        if (!validation.ok) {
          setMessage(adminMessage, validation.message, true);
          return;
        }

        setMessage(adminMessage, '');
      });

      renderUploadSelection();
    };

    const bootAssetFilters = () => {
      if (!assetFilterBar) return;

      for (const tab of assetFilterBar.querySelectorAll('.asset-filter-tab')) {
        tab.addEventListener('click', () => {
          const filter = tab.dataset.filter || 'all';
          setAssetFilter(filter);
        });
      }
    };

    const addMemberUploadFiles = (incoming) => {
      if (!incoming?.length) return;

      for (const file of incoming) {
        const exists = pendingMemberUploadFiles.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!exists) {
          pendingMemberUploadFiles.push(file);
        }
      }

      renderMemberUploadSelection();
    };

    const bootMemberUpload = () => {
      if (!memberUploadForm || !memberUploadFilesInput) return;

      renderMemberUploadSelection();

      memberUploadFilesInput.addEventListener('change', () => {
        const picked = memberUploadFilesInput.files ? Array.from(memberUploadFilesInput.files) : [];
        addMemberUploadFiles(picked);
        memberUploadFilesInput.value = '';
      });

      if (memberUploadDropzone) {
        const activate = (event) => {
          event.preventDefault();
          event.stopPropagation();
          memberUploadDropzone.classList.add('is-dragover');
        };

        const deactivate = (event) => {
          event.preventDefault();
          event.stopPropagation();
          memberUploadDropzone.classList.remove('is-dragover');
        };

        memberUploadDropzone.addEventListener('dragenter', activate);
        memberUploadDropzone.addEventListener('dragover', activate);
        memberUploadDropzone.addEventListener('dragleave', deactivate);
        memberUploadDropzone.addEventListener('dragend', deactivate);
        memberUploadDropzone.addEventListener('drop', (event) => {
          deactivate(event);
          const dropped = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
          addMemberUploadFiles(dropped);
        });
      }

      memberUploadClear?.addEventListener('click', () => {
        pendingMemberUploadFiles.length = 0;
        renderMemberUploadSelection();
        setMessage(memberUploadMessage, '');
      });

      memberUploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!state.activeProjectId) {
          setMessage(memberUploadMessage, 'Velg et prosjekt før du laster opp.', true);
          return;
        }

        const files = [...pendingMemberUploadFiles];
        const validation = validateUploadFiles(files);
        if (!validation.ok) {
          setMessage(memberUploadMessage, validation.message, true);
          return;
        }

        const submitButton = memberUploadSubmit;
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
          submitButton.textContent = 'Laster opp...';
        }

        const formData = new FormData();
        formData.append('title', String(memberUploadTitle?.value || '').trim());
        formData.append('kind', String(memberUploadKind?.value || 'dokument'));
        for (const file of files) {
          formData.append('files', file, file.name);
        }

        try {
          const { response, payload } = await request(
            `/api/projects/${encodeURIComponent(state.activeProjectId)}/assets`,
            { method: 'POST', body: formData }
          );

          if (!response.ok) {
            setMessage(memberUploadMessage, payload?.message || 'Klarte ikke laste opp fil.', true);
            return;
          }

          pendingMemberUploadFiles.length = 0;
          if (memberUploadTitle) memberUploadTitle.value = '';
          renderMemberUploadSelection();

          const uploadedCount = Array.isArray(payload?.assets) ? payload.assets.length : payload?.count || 0;
          if (uploadedCount === 1 && payload.assets?.[0]) {
            setMessage(memberUploadMessage, `Fil lastet opp: ${payload.assets[0].fileName}`);
          } else {
            setMessage(memberUploadMessage, `${uploadedCount} filer lastet opp.`);
          }

          await loadAssets(state.activeProjectId);
          setUploadPanelOpen(false);
        } catch {
          setMessage(memberUploadMessage, 'Nettverksfeil under opplasting.', true);
        } finally {
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = pendingMemberUploadFiles.length === 0;
            submitButton.textContent = 'Last opp filer';
          }
        }
      });
    };

    const bootResourceToolbar = () => {
      if (toolbarUploadBtn) {
        toolbarUploadBtn.addEventListener('click', () => {
          const isOpen = memberUploadSection && !memberUploadSection.hidden;
          setUploadPanelOpen(!isOpen);
        });
      }

      if (toolbarAccessBtn) {
        toolbarAccessBtn.addEventListener('click', () => {
          const isOpen = projectAccessOverview && !projectAccessOverview.hidden;
          setAccessPanelOpen(!isOpen);
        });
      }

      if (toolbarDownloadAllBtn) {
        toolbarDownloadAllBtn.addEventListener('click', () => {
          if (!state.activeProjectId) return;
          const url = `/api/projects/${encodeURIComponent(state.activeProjectId)}/download?folder=all`;
          window.open(url, '_blank', 'noopener');
        });
      }

      if (resourceEmptyUploadBtn) {
        resourceEmptyUploadBtn.addEventListener('click', () => {
          setUploadPanelOpen(true);
        });
      }

      if (folderBackBtn) {
        folderBackBtn.addEventListener('click', () => {
          closeFolderView();
        });
      }

      if (folderDownloadBtn) {
        folderDownloadBtn.addEventListener('click', () => {
          if (!state.activeProjectId || !state.activeFolderName) return;
          const folderKey = folderKeyByName[state.activeFolderName] || 'andre-filer';
          const url = `/api/projects/${encodeURIComponent(state.activeProjectId)}/download?folder=${encodeURIComponent(folderKey)}`;
          window.open(url, '_blank', 'noopener');
        });
      }

      if (pathRootBtn) {
        pathRootBtn.addEventListener('click', () => {
          closeFolderView();
        });
      }

      if (accessCloseBtn) {
        accessCloseBtn.addEventListener('click', () => {
          setAccessPanelOpen(false);
        });
      }

      if (uploadCloseBtn) {
        uploadCloseBtn.addEventListener('click', () => {
          setUploadPanelOpen(false);
        });
      }
    };

    const buildGreeting = (user) => {
      if (!user) return '';
      const firstName = String(user.name || '').trim().split(/\s+/)[0];
      const roleLabel = user.role === 'admin' ? 'administrator' : 'prosjektmedlem';
      const namePart = firstName ? ` ${firstName}` : '';
      return `Hei${namePart}! Du er logget inn som ${roleLabel}.`;
    };

    const bootDashboard = async () => {
      const authenticated = await refreshSession();
      if (!authenticated) {
        window.location.href = '/innlogging.html';
        return;
      }

      userInfo.textContent = buildGreeting(state.user);
      bootMemberUpload();
      bootAssetFilters();
      bootResourceToolbar();
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
