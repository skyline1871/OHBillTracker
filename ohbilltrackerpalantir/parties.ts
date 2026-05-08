/**
 * osdk-app/src/lib/parties.ts
 * Party configuration — identical planks to the AIP Logic functions/src/index.ts
 * so client-side display matches server-side analysis.
 */

export interface Party {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  primary: string;
  dark: string;
  light: string;
  mid: string;
  textOnPrimary: string;
  planks: string[];
}

export const PARTIES: Record<string, Party> = {
  republican: {
    id: "republican",
    name: "Republican",
    shortName: "GOP",
    tagline: "Limited government. Strong defense. American values.",
    primary: "#B22234",
    dark: "#7a1723",
    light: "#fdf0f1",
    mid: "#e8c5c8",
    textOnPrimary: "#ffffff",
    planks: [
      "Lower taxes and reduce government spending",
      "Strong national defense and border security",
      "Second Amendment rights and gun ownership",
      "Free market capitalism and deregulation",
      "Traditional family values and religious freedom",
      "Pro-life policies and oppose abortion",
      "Law and order and support for law enforcement",
      "School choice and parental rights in education",
      "Energy independence including fossil fuels",
      "Oppose government mandates and overreach",
      "Veterans benefits and military support",
      "Oppose illegal immigration and enforce immigration law",
    ],
  },
  democrat: {
    id: "democrat",
    name: "Democrat",
    shortName: "Dem",
    tagline: "Equity, opportunity, and progress for all.",
    primary: "#003F8A",
    dark: "#002a5e",
    light: "#eef3fb",
    mid: "#b8cef0",
    textOnPrimary: "#ffffff",
    planks: [
      "Expand access to affordable healthcare and Medicaid",
      "Climate action and clean energy investment",
      "Worker rights, unions, and minimum wage increases",
      "Racial equity and civil rights protections",
      "Universal pre-K and affordable higher education",
      "Reproductive rights and access to abortion",
      "Common-sense gun safety regulations",
      "Immigration reform and path to citizenship",
      "LGBTQ+ rights and anti-discrimination protections",
      "Social safety net and poverty reduction programs",
      "Campaign finance reform and voting rights expansion",
      "Tax fairness and making the wealthy pay more",
    ],
  },
  libertarian: {
    id: "libertarian",
    name: "Libertarian",
    shortName: "LP",
    tagline: "Maximum freedom. Minimum government.",
    primary: "#FFCC00",
    dark: "#b38f00",
    light: "#fffbe6",
    mid: "#ffe999",
    textOnPrimary: "#1a1400",
    planks: [
      "Personal liberty and individual freedom from government interference",
      "Free markets and economic liberty, oppose excessive regulation",
      "Privacy rights and civil liberties",
      "Limited government and fiscal responsibility",
      "Oppose government surveillance and police state expansion",
      "Drug policy reform and decriminalization",
      "Second amendment and gun rights",
      "Property rights and opposition to eminent domain abuse",
      "Free speech and press freedom",
      "Opposition to corporate welfare, subsidies, and cronyism",
      "School choice and education freedom",
      "Criminal justice reform and oppose mass incarceration",
    ],
  },
};
