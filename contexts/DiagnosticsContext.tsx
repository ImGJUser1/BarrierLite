import React, { createContext, useState, useContext, ReactNode } from 'react';

export interface DiagnosticResult {
  ram: number;
  ramPass: boolean;
  cpu: string;
  cpuPass: boolean;
  storage: number;
  storagePass: boolean;
  thermal: number;
  thermalPass: boolean;
  score: number;
  completed: boolean;
}

interface DiagnosticsContextType {
  diagnostics: DiagnosticResult | null;
  setDiagnostics: (result: DiagnosticResult) => void;
  thermalWarning: boolean;
  setThermalWarning: (value: boolean) => void;
}

const DiagnosticsContext = createContext<DiagnosticsContextType | undefined>(undefined);

export const DiagnosticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [thermalWarning, setThermalWarning] = useState(false);

  return (
    <DiagnosticsContext.Provider value={{ diagnostics, setDiagnostics, thermalWarning, setThermalWarning }}>
      {children}
    </DiagnosticsContext.Provider>
  );
};

export const useDiagnostics = () => {
  const context = useContext(DiagnosticsContext);
  if (!context) {
    throw new Error('useDiagnostics must be used within DiagnosticsProvider');
  }
  return context;
};