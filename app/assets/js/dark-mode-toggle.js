document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggle-dark-mode')
  const currentTheme = localStorage.getItem('theme')
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)')
  const lightThemeLink = document.getElementById('hljs-light-theme')
  const darkThemeLink = document.getElementById('hljs-dark-theme')

  let darkMode
  if (currentTheme) {
    darkMode = currentTheme === 'dark-mode'
  } else {
    darkMode = prefersDarkScheme.matches
  }

  if (darkMode){
    document.body.classList.add('dark-mode')
  } else {
    document.body.classList.add('light-mode')
  }
  toggleButton.checked = darkMode
  darkThemeLink.disabled = !darkMode
  lightThemeLink.disabled = darkMode
  

  toggleButton.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode')
    let theme = 'light-mode'
    if (document.body.classList.contains('dark-mode')) {
      theme = 'dark-mode'
    }
    darkThemeLink.disabled = theme === 'light-mode'
    lightThemeLink.disabled = theme === 'dark-mode'
    localStorage.setItem('theme', theme)
  });
});