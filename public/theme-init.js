try {
  var s = JSON.parse(localStorage.getItem('jychess.settings.v1') || '{}');
  if (s.theme === 'light' || s.theme === 'dark') document.documentElement.setAttribute('data-theme', s.theme);
} catch (e) {}
