import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type Theme = 'light' | 'dark';

interface ThemeColors {
  background: string;
  cardBackground: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryLight: string;
  border: string;
  success: string;
  error: string;
  warning: string;
}

interface ThemeContextType {
  theme: Theme;
  colors: ThemeColors;
  toggleTheme: () => void;
  lowResourceMode: boolean;
  setLowResourceMode: (value: boolean) => void;
}

const lightColors: ThemeColors = {
  background: '#F0F8FF',
  cardBackground: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#666666',
  primary: '#007BFF',
  primaryLight: '#4DA3FF',
  border: '#E0E0E0',
  success: '#28A745',
  error: '#DC3545',
  warning: '#FFC107',
};

const darkColors: ThemeColors = {
  background: '#0C0C0C',
  cardBackground: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  primary: '#007BFF',
  primaryLight: '#4DA3FF',
  border: '#333333',
  success: '#28A745',
  error: '#DC3545',
  warning: '#FFC107',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemTheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>(systemTheme === 'dark' ? 'dark' : 'light');
  const [lowResourceMode, setLowResourceMode] = useState(false);

  const colors = theme === 'light' ? lightColors : darkColors;

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, lowResourceMode, setLowResourceMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};