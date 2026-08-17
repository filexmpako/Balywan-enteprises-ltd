export const DEFAULT_COMPANY_NAME = "Hasidadi Enterprises";
export const COMPANY_NAME_KEY = "companyName";

export function getCompanyName(): string {
  if (typeof window === "undefined") return DEFAULT_COMPANY_NAME;
  try {
    const val = localStorage.getItem(COMPANY_NAME_KEY);
    return val && val.trim() ? val.trim() : DEFAULT_COMPANY_NAME;
  } catch (e) {
    return DEFAULT_COMPANY_NAME;
  }
}

export function setCompanyNameInStorage(name: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(COMPANY_NAME_KEY, name.trim());
    window.dispatchEvent(new CustomEvent("companyNameChanged", { detail: name.trim() }));
  }
}
