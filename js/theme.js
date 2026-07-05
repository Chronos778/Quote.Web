export const ThemeManager = {
  theme: 'dark',
  init() {
    this.theme = localStorage.getItem('theme');
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (!this.theme) {
      this.theme = mediaQuery.matches ? 'dark' : 'light';
    }
    
    mediaQuery.addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.theme = e.matches ? 'dark' : 'light';
        this.applyTheme(this.theme);
      }
    });

    this.applyTheme(this.theme);
  },

  toggle() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.theme);
    this.applyTheme(this.theme);
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle('hidden', theme === 'light');
      moonIcon.classList.toggle('hidden', theme !== 'light');
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#fafafa' : '#050505');
    }

    if (window.starfieldInstance) {
      window.starfieldInstance.resize();
    }
  },
};
