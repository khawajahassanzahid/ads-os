export const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD — US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR — Euro" },
  { code: "PKR", symbol: "₨", label: "PKR — Pakistani Rupee" },
  { code: "GBP", symbol: "£", label: "GBP — British Pound" },
  { code: "AED", symbol: "د.إ", label: "AED — UAE Dirham" },
  { code: "SAR", symbol: "﷼", label: "SAR — Saudi Riyal" },
];
export const getCurrencySymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || "$";
