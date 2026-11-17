export type Entry = {
  title?: string;
  major?: string;
  organization?: string;
  status?: string;
  calendar?: string;
  end?: string;
  month?: string;
  start?: string;
  gpa?: string;
  details?: string[];
  achievements?: string[];
};
export type Resume = {
  language: "ar" | "en";
  profile: "graduate" | "experienced" | "no_experience";
  name: string;
  headline: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  linkedin: string;
  github: string;
  summary: string;
  education: Entry[];
  experience: Entry[];
  projects: Entry[];
  skills: string[];
  courses: string[];
  certifications: string[];
  volunteering: string[];
  languages: string[];
};
export type Design = {
  targetVacancy?: { id: number; title: string };
  template: string;
  accent: string;
  fontSize: number;
  spacing: number;
  order?: string[];
  hidden?: string[];
  sections?: Record<string, {fontSize?:number;bullets?:boolean}>;
  textFormats?: Record<string,{text:string;marks:{start:number;end:number;bold?:boolean;italic?:boolean;underline?:boolean;href?:string}[]}>;
};
export type Draft = {
  id: string;
  title: string;
  content: Resume;
  design: Design;
  revision: number;
  updated_at: string;
  approved_revision: number | null;
};
export type Membership = {
  active: boolean;
  expires: string;
  aiLimit: number;
  aiUsed: number;
  aiRemaining: number;
  maxDrafts: number;
};
export type Account = {
  id: string;
  telegramLinked: boolean;
  membership: Membership | null;
};
export type Job = {
  id: string;
  state: "queued" | "running" | "completed" | "failed" | "uncertain";
  kind: string;
  result?: { content?: Resume; message?: string; downloadUrl?: string; appliedKeys?:string[];review?:{message:string;suggestions:{section:string;title:string;reason:string;impact:string}[]} };
  error?: string;
  base_revision: number;
};
