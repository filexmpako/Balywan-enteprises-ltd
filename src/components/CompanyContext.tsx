import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCompanyName, setCompanyNameInStorage } from '../utils/company';

interface CompanyContextType {
  companyName: string;
  updateCompanyName: (newName: string) => boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companyName: getCompanyName(),
  updateCompanyName: () => false,
});

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyNameState] = useState<string>(() => getCompanyName());

  useEffect(() => {
    const handleCompanyChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setCompanyNameState(customEvent.detail || getCompanyName());
    };

    window.addEventListener('companyNameChanged', handleCompanyChange);
    return () => {
      window.removeEventListener('companyNameChanged', handleCompanyChange);
    };
  }, []);

  const updateCompanyName = (newName: string): boolean => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    setCompanyNameInStorage(trimmed);
    setCompanyNameState(trimmed);
    return true;
  };

  return (
    <CompanyContext.Provider value={{ companyName, updateCompanyName }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
