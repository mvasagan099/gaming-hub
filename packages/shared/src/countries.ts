export interface Country {
  code: string;
  name: string;
  currency: string;
  callingCode: string;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

/**
 * ISO 3166-1 alpha-2 country codes with a default settlement currency and
 * international calling code. Currency is used as the default for deposits,
 * withdrawals and wager settlement when the player does not override it.
 */
export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", currency: "INR", callingCode: "+91" },
  { code: "US", name: "United States", currency: "USD", callingCode: "+1" },
  { code: "GB", name: "United Kingdom", currency: "GBP", callingCode: "+44" },
  { code: "CA", name: "Canada", currency: "CAD", callingCode: "+1" },
  { code: "AU", name: "Australia", currency: "AUD", callingCode: "+61" },
  { code: "NZ", name: "New Zealand", currency: "NZD", callingCode: "+64" },
  { code: "SG", name: "Singapore", currency: "SGD", callingCode: "+65" },
  { code: "MY", name: "Malaysia", currency: "MYR", callingCode: "+60" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", callingCode: "+971" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", callingCode: "+966" },
  { code: "QA", name: "Qatar", currency: "QAR", callingCode: "+974" },
  { code: "BH", name: "Bahrain", currency: "BHD", callingCode: "+973" },
  { code: "OM", name: "Oman", currency: "OMR", callingCode: "+968" },
  { code: "KW", name: "Kuwait", currency: "KWD", callingCode: "+965" },
  { code: "IL", name: "Israel", currency: "ILS", callingCode: "+972" },
  { code: "TR", name: "Türkiye", currency: "TRY", callingCode: "+90" },
  { code: "RU", name: "Russia", currency: "RUB", callingCode: "+7" },
  { code: "UA", name: "Ukraine", currency: "UAH", callingCode: "+380" },
  { code: "DE", name: "Germany", currency: "EUR", callingCode: "+49" },
  { code: "FR", name: "France", currency: "EUR", callingCode: "+33" },
  { code: "ES", name: "Spain", currency: "EUR", callingCode: "+34" },
  { code: "IT", name: "Italy", currency: "EUR", callingCode: "+39" },
  { code: "NL", name: "Netherlands", currency: "EUR", callingCode: "+31" },
  { code: "BE", name: "Belgium", currency: "EUR", callingCode: "+32" },
  { code: "PT", name: "Portugal", currency: "EUR", callingCode: "+351" },
  { code: "GR", name: "Greece", currency: "EUR", callingCode: "+30" },
  { code: "SE", name: "Sweden", currency: "SEK", callingCode: "+46" },
  { code: "NO", name: "Norway", currency: "NOK", callingCode: "+47" },
  { code: "DK", name: "Denmark", currency: "DKK", callingCode: "+45" },
  { code: "FI", name: "Finland", currency: "EUR", callingCode: "+358" },
  { code: "CH", name: "Switzerland", currency: "CHF", callingCode: "+41" },
  { code: "PL", name: "Poland", currency: "PLN", callingCode: "+48" },
  { code: "CZ", name: "Czech Republic", currency: "CZK", callingCode: "+420" },
  { code: "JP", name: "Japan", currency: "JPY", callingCode: "+81" },
  { code: "KR", name: "South Korea", currency: "KRW", callingCode: "+82" },
  { code: "CN", name: "China", currency: "CNY", callingCode: "+86" },
  { code: "HK", name: "Hong Kong", currency: "HKD", callingCode: "+852" },
  { code: "TW", name: "Taiwan", currency: "TWD", callingCode: "+886" },
  { code: "TH", name: "Thailand", currency: "THB", callingCode: "+66" },
  { code: "VN", name: "Vietnam", currency: "VND", callingCode: "+84" },
  { code: "PH", name: "Philippines", currency: "PHP", callingCode: "+63" },
  { code: "ID", name: "Indonesia", currency: "IDR", callingCode: "+62" },
  { code: "PK", name: "Pakistan", currency: "PKR", callingCode: "+92" },
  { code: "BD", name: "Bangladesh", currency: "BDT", callingCode: "+880" },
  { code: "LK", name: "Sri Lanka", currency: "LKR", callingCode: "+94" },
  { code: "NP", name: "Nepal", currency: "NPR", callingCode: "+977" },
  { code: "BR", name: "Brazil", currency: "BRL", callingCode: "+55" },
  { code: "MX", name: "Mexico", currency: "MXN", callingCode: "+52" },
  { code: "AR", name: "Argentina", currency: "ARS", callingCode: "+54" },
  { code: "NG", name: "Nigeria", currency: "NGN", callingCode: "+234" },
  { code: "ZA", name: "South Africa", currency: "ZAR", callingCode: "+27" },
  { code: "EG", name: "Egypt", currency: "EGP", callingCode: "+20" },
  { code: "KE", name: "Kenya", currency: "KES", callingCode: "+254" },
];

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "QAR", symbol: "ر.ق", name: "Qatari Riyal" },
  { code: "BHD", symbol: "ب.د", name: "Bahraini Dinar" },
  { code: "OMR", symbol: "ر.ع", name: "Omani Rial" },
  { code: "KWD", symbol: "د.ك", name: "Kuwaiti Dinar" },
  { code: "ILS", symbol: "₪", name: "Israeli New Shekel" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
  { code: "TWD", symbol: "NT$", name: "Taiwan Dollar" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "LKR", symbol: "₨", name: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "₨", name: "Nepalese Rupee" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "ARS", symbol: "$", name: "Argentine Peso" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
];

export const DEFAULT_CURRENCY = "USD";

/**
 * Coarse geographic regions used by region-scoped leaderboards. Every country
 * code from {@link COUNTRIES} appears in exactly one group.
 */
export const REGION_GROUPS: Record<string, string[]> = {
  Asia: ["IN", "PK", "BD", "LK", "NP", "CN", "HK", "TW", "JP", "KR", "TH", "VN", "PH", "ID", "SG", "MY"],
  Europe: ["GB", "DE", "FR", "ES", "IT", "NL", "BE", "PT", "GR", "SE", "NO", "DK", "FI", "CH", "PL", "CZ", "UA", "RU", "TR"],
  "Middle East": ["AE", "SA", "QA", "BH", "OM", "KW", "IL"],
  Africa: ["NG", "ZA", "KE", "EG"],
  Americas: ["US", "CA", "MX", "BR", "AR"],
  Oceania: ["AU", "NZ"],
};

export const REGIONS: string[] = Object.keys(REGION_GROUPS);

const COUNTRY_TO_REGION: Record<string, string> = Object.entries(REGION_GROUPS).reduce<
  Record<string, string>
>((acc, [region, codes]) => {
  for (const code of codes) acc[code] = region;
  return acc;
}, {});

/** Resolves a country code to its region, or null when unknown. */
export function regionOf(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_TO_REGION[country] ?? null;
}

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryToCurrency(countryCode: string): string {
  return getCountry(countryCode)?.currency ?? DEFAULT_CURRENCY;
}

export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}
