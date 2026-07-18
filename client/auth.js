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
    const assetHint = document.getElementById('assetHint');
    const logoutButton = document.getElementById('logoutButton');

    const projectView = document.getElementById('projectView');
    const backToProjectsBtn = document.getElementById('backToProjectsBtn');
    const projectViewName = document.getElementById('projectViewName');
    const feedbackBanner = document.getElementById('feedbackBanner');

    const toolbarUploadBtn = document.getElementById('toolbarUploadBtn');
    const toolbarDownloadAllBtn = document.getElementById('toolbarDownloadAllBtn');
    const uploadCloseBtn = document.getElementById('uploadCloseBtn');

    const userFilesList = document.getElementById('userFilesList');
    const userFilesCount = document.getElementById('userFilesCount');
    const userFilesEmpty = document.getElementById('userFilesEmpty');
    const adminFilesList = document.getElementById('adminFilesList');
    const adminFilesCount = document.getElementById('adminFilesCount');
    const adminFilesEmpty = document.getElementById('adminFilesEmpty');

    const deleteModal = document.getElementById('deleteModal');
    const deleteModalText = document.getElementById('deleteModalText');
    const deleteCancelBtn = document.getElementById('deleteCancelBtn');
    const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

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

    // Tydelig tilbakemelding som ikke forsvinner for raskt.
    let feedbackTimer = null;
    const showFeedback = (text, type = 'success') => {
      if (!feedbackBanner) return;
      if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      feedbackBanner.textContent = text;
      feedbackBanner.hidden = false;
      feedbackBanner.classList.remove('feedback-banner--success', 'feedback-banner--error', 'feedback-banner--info');
      feedbackBanner.classList.add(`feedback-banner--${type}`);
      if (type !== 'error') {
        feedbackTimer = setTimeout(() => {
          feedbackBanner.hidden = true;
        }, 8000);
      }
    };

    const clearFeedback = () => {
      if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      if (feedbackBanner) feedbackBanner.hidden = true;
    };

    const setUploadPanelOpen = (open) => {
      if (!memberUploadSection) return;
      memberUploadSection.hidden = !open;
      if (toolbarUploadBtn) {
        toolbarUploadBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toolbarUploadBtn.classList.toggle('is-open', open);
      }
      if (open) {
        memberUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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

    // Åpner den enkle prosjektsiden og skjuler prosjektlista (spesielt viktig
    // på mobil, slik at brukeren kun ser ett tydelig steg av gangen).
    const openProjectView = (project) => {
      if (projectViewName) projectViewName.textContent = project?.name || 'Prosjekt';
      if (assetHint) assetHint.hidden = true;
      if (projectView) projectView.hidden = false;
      if (dashboardRoot) dashboardRoot.classList.add('has-open-project');
      hideMemberUpload();
      clearFeedback();
    };

    const closeProjectView = () => {
      state.activeProjectId = null;
      if (projectView) projectView.hidden = true;
      if (assetHint) assetHint.hidden = false;
      if (dashboardRoot) dashboardRoot.classList.remove('has-open-project');
      hideMemberUpload();
      clearFeedback();
      projectList?.querySelectorAll('.project-item__open').forEach((item) => item.classList.remove('active'));
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

    // Lettlest dato: «18. juli 2026».
    const formatUploadedDate = (isoString) => {
      if (!isoString) return '';
      const uploaded = new Date(isoString);
      if (Number.isNaN(uploaded.getTime())) return '';
      try {
        return uploaded.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch {
        return uploaded.toLocaleDateString('no', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    };

    // ---- Trygg sletting via bekreftelsesvindu ----
    const openDeleteModal = (projectId, asset) => {
      state.pendingDelete = { projectId, asset };
      const shownName = asset.fileName || asset.title || 'denne filen';
      if (deleteModalText) deleteModalText.textContent = `Filen «${shownName}» blir slettet for godt.`;
      if (deleteModal) deleteModal.hidden = false;
      deleteCancelBtn?.focus();
    };

    const closeDeleteModal = () => {
      state.pendingDelete = null;
      if (deleteModal) deleteModal.hidden = true;
    };

    const performDelete = async () => {
      const pending = state.pendingDelete;
      if (!pending?.projectId || !pending?.asset?.id) {
        closeDeleteModal();
        return;
      }
      const { projectId, asset } = pending;
      closeDeleteModal();

      const result = await request(
        `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        { method: 'DELETE' }
      );

      if (!result.response.ok) {
        showFeedback('Noe gikk galt. Prøv igjen.', 'error');
        return;
      }

      showFeedback('Filen ble slettet.', 'success');
      await loadAssets(projectId);
    };

    // ---- Filkort ----
    const buildFileCard = (asset) => {
      const li = document.createElement('li');
      li.className = 'file-card';

      const icon = document.createElement('span');
      icon.className = 'file-card__icon';
      icon.dataset.type = fileIconKind(asset.fileName);
      icon.setAttribute('aria-hidden', 'true');

      const body = document.createElement('div');
      body.className = 'file-card__body';

      const name = document.createElement('p');
      name.className = 'file-card__name';
      name.textContent = asset.fileName || asset.title || 'Fil';

      const meta = document.createElement('p');
      meta.className = 'file-card__meta';
      const date = formatUploadedDate(asset.uploadedAt || asset.createdAt);
      const who = asset.uploadedByName || 'Ukjent';
      meta.textContent = date ? `Lastet opp ${date} av ${who}` : `Lastet opp av ${who}`;

      const size = document.createElement('p');
      size.className = 'file-card__size';
      size.textContent = formatBytes(asset.sizeBytes);

      const actions = document.createElement('div');
      actions.className = 'file-card__actions';

      const iconType = fileIconKind(asset.fileName);
      const isViewable = iconType === 'image' || iconType === 'pdf';

      if (isViewable) {
        const openLink = document.createElement('a');
        openLink.className = 'file-btn file-btn--open';
        openLink.href = asset.url;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.innerHTML = '<span aria-hidden="true">👁</span> Åpne';
        actions.appendChild(openLink);
      }

      const downloadLink = document.createElement('a');
      downloadLink.className = 'file-btn file-btn--download';
      downloadLink.href = `${asset.url}&download=1`;
      downloadLink.innerHTML = '<span aria-hidden="true">⬇</span> Last ned';
      actions.appendChild(downloadLink);

      if (asset.canDelete && state.activeProjectId) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'file-btn file-btn--delete';
        deleteButton.innerHTML = '<span aria-hidden="true">🗑</span> Slett';
        deleteButton.addEventListener('click', () => {
          openDeleteModal(state.activeProjectId, asset);
        });
        actions.appendChild(deleteButton);
      }

      body.append(name, meta, size, actions);
      li.append(icon, body);
      return li;
    };

    const renderFileSection = (listEl, countEl, emptyEl, files) => {
      if (!listEl) return;
      listEl.innerHTML = '';
      if (countEl) countEl.textContent = `(${files.length})`;

      if (!files.length) {
        if (emptyEl) emptyEl.hidden = false;
        listEl.hidden = true;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;
      listEl.hidden = false;
      for (const asset of files) {
        listEl.appendChild(buildFileCard(asset));
      }
    };

    const renderFiles = (assets) => {
      state.currentAssets = Array.isArray(assets) ? assets : [];
      const userFiles = state.currentAssets.filter((asset) => asset.uploadedByType === 'USER');
      const adminFiles = state.currentAssets.filter((asset) => asset.uploadedByType === 'ADMIN');
      renderFileSection(userFilesList, userFilesCount, userFilesEmpty, userFiles);
      renderFileSection(adminFilesList, adminFilesCount, adminFilesEmpty, adminFiles);
    };

    const loadAssets = async (projectId) => {
      const { response, payload } = await request(`/api/projects/${encodeURIComponent(projectId)}/assets`);
      if (!response.ok) {
        showFeedback('Noe gikk galt. Prøv igjen.', 'error');
        renderFiles([]);
        return;
      }
      renderFiles(payload.assets || []);
    };

    const renderProjects = (projects) => {
      state.projects = projects;
      projectList.innerHTML = '';

      if (!projects.length) {
        const empty = document.createElement('li');
        empty.className = 'project-item';
        empty.textContent = 'Du har foreløpig ingen tildelte prosjekter.';
        projectList.appendChild(empty);
        if (assetHint) assetHint.textContent = 'Du har ingen prosjekter enda. Kontakt Sørhaug Consulting hvis du forventer tilgang.';
        closeProjectView();
        return;
      }

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
          openProjectView(project);
          await loadAssets(project.id);
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
        closeProjectView();
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

    const bootDeleteModal = () => {
      deleteCancelBtn?.addEventListener('click', () => closeDeleteModal());
      deleteConfirmBtn?.addEventListener('click', () => performDelete());

      if (deleteModal) {
        deleteModal.addEventListener('click', (event) => {
          const target = event.target;
          if (target instanceof HTMLElement && target.dataset.close === 'delete') {
            closeDeleteModal();
          }
        });
      }

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && deleteModal && !deleteModal.hidden) {
          closeDeleteModal();
        }
      });
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
          submitButton.textContent = files.length === 1 ? 'Laster opp filen …' : 'Laster opp filene …';
        }
        setMessage(memberUploadMessage, files.length === 1 ? 'Laster opp filen …' : 'Laster opp filene …');

        const formData = new FormData();
        for (const file of files) {
          formData.append('files', file, file.name);
        }

        try {
          const { response, payload } = await request(
            `/api/projects/${encodeURIComponent(state.activeProjectId)}/assets`,
            { method: 'POST', body: formData }
          );

          if (!response.ok) {
            setMessage(memberUploadMessage, 'Filen kunne ikke lastes opp. Prøv igjen.', true);
            return;
          }

          pendingMemberUploadFiles.length = 0;
          renderMemberUploadSelection();
          setMessage(memberUploadMessage, '');

          const uploadedCount = Array.isArray(payload?.assets) ? payload.assets.length : payload?.count || 0;

          await loadAssets(state.activeProjectId);
          setUploadPanelOpen(false);
          showFeedback(uploadedCount === 1 ? 'Filen ble lastet opp.' : 'Filene ble lastet opp.', 'success');
        } catch {
          setMessage(memberUploadMessage, 'Filen kunne ikke lastes opp. Prøv igjen.', true);
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

      if (toolbarDownloadAllBtn) {
        toolbarDownloadAllBtn.addEventListener('click', async () => {
          if (!state.activeProjectId) return;
          if (toolbarDownloadAllBtn.dataset.busy === '1') return;

          const labelEl = toolbarDownloadAllBtn.querySelector('.big-action__label');
          const originalLabel = labelEl ? labelEl.textContent : '';
          toolbarDownloadAllBtn.dataset.busy = '1';
          toolbarDownloadAllBtn.disabled = true;
          if (labelEl) labelEl.textContent = 'Gjør prosjektet klart for nedlasting …';

          try {
            const url = `/api/projects/${encodeURIComponent(state.activeProjectId)}/download`;
            // Naviger til nedlastings-URL-en i et skjult element slik at
            // nettleseren starter nedlastingen uten å bytte side.
            const link = document.createElement('a');
            link.href = url;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            showFeedback('Prosjektet lastes ned.', 'success');
          } catch {
            showFeedback('Prosjektet kunne ikke lastes ned. Prøv igjen.', 'error');
          } finally {
            // Gi nedlastingen et øyeblikk før knappen tilbakestilles.
            setTimeout(() => {
              toolbarDownloadAllBtn.dataset.busy = '0';
              toolbarDownloadAllBtn.disabled = false;
              if (labelEl) labelEl.textContent = originalLabel || 'Last ned hele prosjektet';
            }, 1500);
          }
        });
      }

      if (uploadCloseBtn) {
        uploadCloseBtn.addEventListener('click', () => {
          setUploadPanelOpen(false);
        });
      }

      if (backToProjectsBtn) {
        backToProjectsBtn.addEventListener('click', () => {
          closeProjectView();
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
      bootResourceToolbar();
      bootDeleteModal();
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
