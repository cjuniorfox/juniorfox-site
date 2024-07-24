// assets/js/dark-mode-toggle.js
document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggle-dark-mode')
  const currentTheme = localStorage.getItem('theme')
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)')

  if (currentTheme) {
    document.body.classList.add(currentTheme)
    toggleButton.checked = currentTheme === 'dark-mode'
  } else if (prefersDarkScheme.matches) {
    document.body.classList.add('dark-mode')
    toggleButton.checked = true
  } else {
    toggleButton.checked = false
  }

  toggleButton.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode')
    let theme = 'light'
    if (document.body.classList.contains('dark-mode')) {
      theme = 'dark-mode'
    }
    localStorage.setItem('theme', theme)
  });
});