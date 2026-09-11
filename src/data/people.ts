export interface Person {
  id: string;
  name: string;
  role: string;
  initials: string;
  hue: number;
}

const PHOTOS = import.meta.glob("../assets/people/*.jpg", { eager: true, import: "default" }) as Record<string, string>;
/** Portrait for a person, looked up by id so saved workspaces never carry image data. Unsplash License — see src/assets/people/CREDITS.md. */
export const photoOf = (p: { id: string }): string | undefined => PHOTOS[`../assets/people/${p.id}.jpg`];

const p = (id: string, name: string, role: string, hue: number): Person => ({
  id,
  name,
  role,
  hue,
  initials: name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2),
});

export const PEOPLE = {
  priya: p("priya.m", "Priya Menon", "Founder & CEO", 226),
  dev: p("dev.k", "Dev Kapoor", "Platform engineer · on-call SRE", 160),
  arjun: p("arjun.n", "Arjun Nair", "Backend engineer", 200),
  sara: p("sara.t", "Sara Thomas", "Support lead", 330),
  anjali: p("anjali.v", "Anjali Verma", "Claims intake", 280),
  meera: p("meera.i", "Meera Iyer", "Claims lead", 20),
  rohan: p("rohan.d", "Rohan Das", "Claims manager", 45),
  ananya: p("ananya.r", "Ananya Rao", "VP Sales", 350),
  kiran: p("kiran.b", "Kiran Bose", "Account executive", 190),
  neha: p("neha.j", "Neha Joshi", "Accounts payable", 300),
  vikram: p("vikram.s", "Vikram Sethi", "Finance controller", 100),
};

export type PersonKey = keyof typeof PEOPLE;
export const personById = (id: string) => Object.values(PEOPLE).find((x) => x.id === id);
