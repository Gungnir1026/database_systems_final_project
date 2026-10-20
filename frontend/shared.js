/* Shared rendering and session handling. All interpolated HTML values are escaped. */
(() => {
  class SafeHTML extends String {}
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
  window.html = (strings, ...values) => new SafeHTML(strings.reduce((out, part, i) =>
    out + part + (i < values.length ? (values[i] instanceof SafeHTML ? String(values[i]) : escape(values[i])) : ''), ''));
  window.todayTaipei = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const originalFetch = window.fetch.bind(window);
  const goLogin = () => {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    window.top.location.href = 'login.html';
  };
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0]);
    if (url.startsWith('/api/') && !['/api/login', '/api/register'].includes(url)) {
      if (response.status === 401) goLogin();
      if (response.ok && String(args[1]?.method).toUpperCase() === 'PUT') {
        const data = await response.clone().json().catch(() => ({}));
        if (data.loginRequired) { alert(data.message); goLogin(); }
      }
    }
    return response;
  };
  window.logoutSession = async () => {
    try {
      const response = await originalFetch('/api/logout', { method: 'POST' });
      if (!response.ok) throw new Error('登出失敗，請稍後再試');
      goLogin();
    } catch (error) { alert(error.message); }
  };
  const page = location.pathname.split('/').pop();
  if (!['', 'login.html', 'register.html'].includes(page)) {
    originalFetch('/api/me').then(async response => {
      if (!response.ok) { goLogin(); return; }
      const { user } = await response.json();
      localStorage.setItem('userId', user.id);
      localStorage.setItem('username', user.username);
      localStorage.setItem('role', user.role);
      const roles = { stu_: '學生', teacher_: '老師', provider_: '獎助單位', admin_: '管理員' };
      const expected = Object.entries(roles).find(([prefix]) => page.startsWith(prefix))?.[1];
      if (expected && expected !== user.role) {
        const homes = { '學生': 'stu_index.html', '老師': 'teacher_index.html', '獎助單位': 'provider_index.html', '管理員': 'admin_index.html' };
        window.top.location.href = homes[user.role];
      }
    }).catch(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const notice = document.createElement('p');
        notice.textContent = '無法連接伺服器，請確認服務是否已啟動。';
        document.body.prepend(notice);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    const frame = document.querySelector('iframe[name="content-frame"]');
    if (frame) {
      const markCurrent = () => {
        const current = frame.contentWindow.location.pathname.split('/').pop();
        document.querySelectorAll('aside a').forEach(link => {
          if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'page');
          else link.removeAttribute('aria-current');
        });
      };
      frame.addEventListener('load', markCurrent);
      markCurrent();
    }
    // Associate the original form labels with their inputs for keyboard/screen-reader use.
    document.querySelectorAll('.form-group').forEach(group => {
      const label = group.querySelector('label');
      const input = group.querySelector('input[id], select[id], textarea[id]');
      if (label && input && !label.htmlFor) label.htmlFor = input.id;
    });
    const activeRole = localStorage.getItem('role');
    if (page === 'application_data.html' && !['獎助單位', '管理員'].includes(activeRole)) {
      document.getElementById('reviewForm').hidden = true;
    }
  });
})();
