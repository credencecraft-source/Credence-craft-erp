export const MOBILE_COUNTRY_CODE_OPTIONS = [
  { code: "+91", country: "India" },
  { code: "+1", country: "United States / Canada" },
  { code: "+44", country: "United Kingdom" },
  { code: "+61", country: "Australia" },
  { code: "+64", country: "New Zealand" },
  { code: "+65", country: "Singapore" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+81", country: "Japan" },
  { code: "+82", country: "South Korea" },
  { code: "+86", country: "China" },
  { code: "+880", country: "Bangladesh" },
  { code: "+92", country: "Pakistan" },
  { code: "+94", country: "Sri Lanka" },
  { code: "+977", country: "Nepal" },
  { code: "+27", country: "South Africa" },
  { code: "+52", country: "Mexico" },
  { code: "+55", country: "Brazil" },
  { code: "+7", country: "Russia / Kazakhstan" },
  { code: "+34", country: "Spain" },
  { code: "+39", country: "Italy" },
  { code: "+31", country: "Netherlands" },
  { code: "+41", country: "Switzerland" },
  { code: "+60", country: "Malaysia" },
  { code: "+62", country: "Indonesia" },
  { code: "+63", country: "Philippines" },
  { code: "+66", country: "Thailand" },
  { code: "+90", country: "Turkey" },
] as const;

export function splitStoredMobileNumber(mobileNumber: string | null) {
  const digits = mobileNumber?.replace(/\D/g, "") ?? "";
  if (!digits) {
    return { countryCode: "+91", nationalNumber: "" };
  }

  if (digits.length >= 11) {
    const matchingCode = [...MOBILE_COUNTRY_CODE_OPTIONS]
      .sort((left, right) => right.code.length - left.code.length)
      .find(({ code }) => {
        const codeDigits = code.slice(1);
        const nationalLength = digits.length - codeDigits.length;
        return (
          digits.startsWith(codeDigits) &&
          nationalLength >= 6 &&
          nationalLength <= 14
        );
      });

    if (matchingCode) {
      return {
        countryCode: matchingCode.code,
        nationalNumber: digits.slice(matchingCode.code.length - 1),
      };
    }
  }

  return { countryCode: "", nationalNumber: digits };
}
