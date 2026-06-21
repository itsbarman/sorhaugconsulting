(() => {
  // Årstall i footer
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Mobilmeny – toggle
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

  }

  const navAuthLink = document.getElementById('navAuthLink');
  if (navAuthLink) {
    const closeMobileNav = () => {
      if (!toggle || !nav) {
        return;
      }

      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const removeDashboardLink = () => {
      const existing = document.getElementById('navDashboardLink');
      if (existing) {
        existing.remove();
      }
    };

    const ensureDashboardLink = () => {
      if (!nav) {
        return;
      }

      if (document.getElementById('navDashboardLink')) {
        return;
      }

      const dashboardLink = document.createElement('a');
      dashboardLink.id = 'navDashboardLink';
      dashboardLink.className = 'nav-dashboard-btn';
      dashboardLink.href = 'dashboard.html';
      dashboardLink.textContent = 'Dashboard';
      dashboardLink.addEventListener('click', closeMobileNav);

      nav.insertBefore(dashboardLink, navAuthLink);
    };

    const setLoggedOutState = () => {
      removeDashboardLink();
      navAuthLink.textContent = 'Logg inn';
      navAuthLink.setAttribute('href', 'innlogging.html');
      navAuthLink.onclick = null;
    };

    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          setLoggedOutState();
          return;
        }

        const payload = await response.json();
        if (!payload?.authenticated) {
          setLoggedOutState();
          return;
        }

        ensureDashboardLink();
        navAuthLink.textContent = 'Logg ut';
        navAuthLink.setAttribute('href', '#');
        const csrfToken = payload.csrfToken || null;
        navAuthLink.onclick = async (event) => {
          event.preventDefault();
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
          });
          window.location.href = 'https://sorhaugconsulting.no';
        };
      })
      .catch(() => {
        setLoggedOutState();
      });
  }

  // Hero-overlay (kun index.html)
  const heroOverlay = document.getElementById('heroOverlay');
  if (heroOverlay) {
    const heroOverlayToggle = heroOverlay.querySelector('.hero-collage__mobile-toggle');
    const heroOverlayDesktopToggle = heroOverlay.querySelector('.hero-collage__desktop-toggle');

    if (heroOverlayToggle && heroOverlayDesktopToggle) {
      let lastMobileView = null;

      const syncHeroOverlayState = () => {
        const mobileView = window.matchMedia('(max-width: 760px)').matches;

        // Mobile browsers can fire resize while scrolling; only reset on breakpoint changes.
        if (lastMobileView === mobileView) return;
        lastMobileView = mobileView;

        if (mobileView) {
          heroOverlay.classList.remove('is-collapsed');
          heroOverlayToggle.setAttribute('aria-expanded', String(heroOverlay.classList.contains('is-open')));
          heroOverlayDesktopToggle.setAttribute('aria-expanded', 'true');
          heroOverlayDesktopToggle.textContent = 'Skjul';
        } else {
          heroOverlay.classList.remove('is-open');
          heroOverlayToggle.setAttribute('aria-expanded', 'false');
        }
      };

      heroOverlayToggle.addEventListener('click', () => {
        const open = heroOverlay.classList.toggle('is-open');
        heroOverlayToggle.setAttribute('aria-expanded', String(open));
      });

      heroOverlayDesktopToggle.addEventListener('click', () => {
        const collapsed = heroOverlay.classList.toggle('is-collapsed');
        heroOverlayDesktopToggle.setAttribute('aria-expanded', String(!collapsed));
        heroOverlayDesktopToggle.textContent = collapsed ? 'Vis tjenester' : 'Skjul';
      });

      window.addEventListener('resize', syncHeroOverlayState);
      syncHeroOverlayState();
    }
  }

  // Kontakt-skjema via Formspree (kun index.html)
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type='submit']");
      const status = document.getElementById('formStatus');
      btn.disabled = true;
      btn.textContent = 'Sender…';
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        });
        if (res.ok) {
          form.reset();
          if (status) status.style.display = 'block';
          btn.textContent = 'Sendt!';
        } else {
          btn.disabled = false;
          btn.textContent = 'Send forespørsel';
          alert('Noe gikk galt. Prøv igjen eller kontakt oss direkte.');
        }
      } catch {
        btn.disabled = false;
        btn.textContent = 'Send forespørsel';
        alert('Noe gikk galt. Sjekk internettilkoblingen og prøv igjen.');
      }
    });
  }
})();
