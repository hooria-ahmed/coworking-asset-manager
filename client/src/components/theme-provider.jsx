// Light / dark mode. The app is dark-first: dark until the user picks light; the choice is saved in the browser.
//   const { theme, toggleTheme } = useTheme();   theme = 'light' | 'dark'
// Owner: integrator.
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });
const KEY = 'theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage blocked */ }
  return 'dark';
}

// The class is switched before React re-renders, so charts that read colours during render get the new ones.
function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const t = initialTheme();
    apply(t);
    return t;
  });

  const setTheme = (t) => {
    apply(t);
    setThemeState(t);
  };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
