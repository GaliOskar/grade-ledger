/*
 * Degree plan: BEng in Electrical and Computer Engineering (ECE), Nazarbayev University.
 * Edit freely — the app reads this array on every load.
 *
 * Each entry is one slot in the plan:
 *   id        stable unique id (keep it unchanged once you have data, plan choices are stored by id)
 *   year      1–4
 *   term      'Fall' | 'Spring'
 *   code      course code; use '/' for cross-listed codes ('ELCE 205/MATH 251'); '' if the course has no code
 *   title     course title
 *   minGrade  minimum required grade ('D*' = D if Kazakh level is Advanced, otherwise C-)
 *   ects      credits
 * Optional:
 *   options   choice slot ("or"): list of { code, title, minGrade? }; pick one in the app
 *   elective  true = you type the actual course in the app (Electives, Open Box)
 *   specLab   true = ECE Specialization Laboratory (can be replaced by an ECE Discipline Elective)
 *   kazakhIelts true = the Kazakh / ASC 100 language slot (see the IELTS setting)
 *
 * Courses you take are matched to slots by code (or by title when the slot has no code),
 * never by the semester the slot is listed in.
 */
const CURRICULUM = [
  // YEAR 1 FALL (34 ECTS)
  { id: 'y1f-math161', year: 1, term: 'Fall', code: 'MATH 161', title: 'Calculus I', minGrade: 'C', ects: 8 },
  { id: 'y1f-phys161', year: 1, term: 'Fall', code: 'PHYS 161', title: 'Physics for Scientists and Engineers I with Lab', minGrade: 'C-', ects: 8 },
  { id: 'y1f-eng100', year: 1, term: 'Fall', code: 'ENG 100', title: 'Introduction to Engineering', minGrade: 'D', ects: 6 },
  { id: 'y1f-eng101', year: 1, term: 'Fall', code: 'ENG 101', title: 'Programming for Engineers', minGrade: 'C-', ects: 6 },
  {
    id: 'y1f-lang', year: 1, term: 'Fall', code: '', title: 'Kazakh Language I or English for Academic Purposes', minGrade: 'D*', ects: 6,
    kazakhIelts: true,
    options: [
      { code: '', title: 'Kazakh Language I', minGrade: 'D*' },
      { code: 'ASC 100', title: 'English for Academic Purposes', minGrade: 'D' },
    ],
  },

  // YEAR 1 SPRING (34 ECTS)
  { id: 'y1s-math162', year: 1, term: 'Spring', code: 'MATH 162', title: 'Calculus II', minGrade: 'C', ects: 8 },
  { id: 'y1s-phys162', year: 1, term: 'Spring', code: 'PHYS 162', title: 'Physics for Scientists and Engineers II with Lab', minGrade: 'C-', ects: 8 },
  { id: 'y1s-eng103', year: 1, term: 'Spring', code: 'ENG 103', title: 'Engineering Materials II', minGrade: 'C-', ects: 6 },
  { id: 'y1s-aidata', year: 1, term: 'Spring', code: '', title: 'AI, Data & Digital Literacy', minGrade: 'D', ects: 6 },
  { id: 'y1s-asc200', year: 1, term: 'Spring', code: 'ASC 200', title: 'Academic Writing, Science Communication & Media Literacy', minGrade: 'D', ects: 6 },

  // YEAR 2 FALL (32 ECTS)
  { id: 'y2f-eng200', year: 2, term: 'Fall', code: 'ENG 200', title: 'Differential Equations and Linear Algebra', minGrade: 'C-', ects: 6 },
  { id: 'y2f-elce200', year: 2, term: 'Fall', code: 'ELCE 200', title: 'Circuit Theory I', minGrade: 'C-', ects: 6 },
  { id: 'y2f-elce203', year: 2, term: 'Fall', code: 'ELCE 203', title: 'Signals and Systems', minGrade: 'C-', ects: 6 },
  { id: 'y2f-elce203l', year: 2, term: 'Fall', code: 'ELCE 203L', title: 'Signals and Systems Laboratory', minGrade: 'C-', ects: 2 },
  { id: 'y2f-discrete', year: 2, term: 'Fall', code: 'ELCE 205/MATH 251', title: 'Discrete Mathematics', minGrade: 'D', ects: 6 },
  { id: 'y2f-ethics', year: 2, term: 'Fall', code: '', title: 'Ethics', minGrade: 'D', ects: 6 },

  // YEAR 2 SPRING (28 ECTS)
  { id: 'y2s-eng201', year: 2, term: 'Spring', code: 'ENG 201', title: 'Applied Probability and Statistics', minGrade: 'C-', ects: 6 },
  { id: 'y2s-elce201', year: 2, term: 'Spring', code: 'ELCE 201', title: 'Circuit Theory II', minGrade: 'C-', ects: 6 },
  { id: 'y2s-elce201l', year: 2, term: 'Spring', code: 'ELCE 201L', title: 'Circuit Theory Lab', minGrade: 'C-', ects: 2 },
  { id: 'y2s-openbox', year: 2, term: 'Spring', code: '', title: 'Open Box Course', minGrade: 'D', ects: 6, elective: true },
  { id: 'y2s-elce202', year: 2, term: 'Spring', code: 'ELCE 202', title: 'Digital Logic Design', minGrade: 'C-', ects: 6 },
  { id: 'y2s-elce202l', year: 2, term: 'Spring', code: 'ELCE 202L', title: 'Digital Logic Design Lab', minGrade: 'C-', ects: 2 },

  // YEAR 3 FALL (30 ECTS)
  { id: 'y3f-elce301', year: 3, term: 'Fall', code: 'ELCE 301', title: 'Electronic Circuits', minGrade: 'C-', ects: 6 },
  { id: 'y3f-elce301l', year: 3, term: 'Fall', code: 'ELCE 301L', title: 'Electronic Circuits Laboratory', minGrade: 'C-', ects: 2 },
  {
    id: 'y3f-choice-a', year: 3, term: 'Fall', code: '', title: 'Solid State Devices or Computer Networks', minGrade: 'C-', ects: 6,
    options: [
      { code: 'ELCE 204', title: 'Solid State Devices' },
      { code: 'ELCE 304', title: 'Computer Networks' },
    ],
  },
  { id: 'y3f-speclab', year: 3, term: 'Fall', code: '', title: 'ECE Specialization Laboratories (Applied Simulation Laboratory)', minGrade: 'D', ects: 4, elective: true, specLab: true },
  {
    id: 'y3f-choice-b', year: 3, term: 'Fall', code: '', title: 'Linear Control Theory or Digital Signal Processing', minGrade: 'D', ects: 6,
    options: [
      { code: 'ELCE 306', title: 'Linear Control Theory' },
      { code: 'ELCE 307', title: 'Digital Signal Processing' },
    ],
  },
  { id: 'y3f-kaz2', year: 3, term: 'Fall', code: '', title: 'Kazakh Language II', minGrade: 'D', ects: 6 },

  // YEAR 3 SPRING (30 ECTS)
  { id: 'y3s-speclab', year: 3, term: 'Spring', code: '', title: 'ECE Specialization Laboratories', minGrade: 'D', ects: 4, elective: true, specLab: true },
  { id: 'y3s-elce300', year: 3, term: 'Spring', code: 'ELCE 300', title: 'Microprocessor Systems', minGrade: 'C-', ects: 6 },
  { id: 'y3s-elce300l', year: 3, term: 'Spring', code: 'ELCE 300L', title: 'Microprocessor Systems Laboratory', minGrade: 'C-', ects: 2 },
  { id: 'y3s-elce311', year: 3, term: 'Spring', code: 'ELCE 311', title: 'Interdisciplinary Design Project (IDP)', minGrade: 'C-', ects: 6 },
  {
    id: 'y3s-choice-c', year: 3, term: 'Spring', code: '', title: 'Power Systems Analysis or Communication Systems', minGrade: 'D', ects: 6,
    options: [
      { code: 'ELCE 303', title: 'Power Systems Analysis' },
      { code: 'ELCE 308', title: 'Communication Systems' },
    ],
  },
  {
    id: 'y3s-choice-d', year: 3, term: 'Spring', code: '', title: 'Electric Machines, Data Structures and Algorithms, or Electromagnetics', minGrade: 'D', ects: 6,
    options: [
      { code: 'ELCE 302', title: 'Electric Machines' },
      { code: 'ELCE 305', title: 'Data Structures and Algorithms' },
      { code: 'ELCE 350', title: 'Electromagnetics' },
    ],
  },

  // YEAR 4 FALL (30 ECTS)
  { id: 'y4f-eng400a', year: 4, term: 'Fall', code: 'ENG 400', title: 'Capstone Project (part 1)', minGrade: 'C-', ects: 6 },
  { id: 'y4f-hst100', year: 4, term: 'Fall', code: 'HST 100', title: 'Kazakhstan in the World: History, Society & Global Context', minGrade: 'D', ects: 6 },
  { id: 'y4f-elective1', year: 4, term: 'Fall', code: '', title: 'ELCE Elective 1', minGrade: 'D', ects: 6, elective: true },
  { id: 'y4f-elective2', year: 4, term: 'Fall', code: '', title: 'ELCE Elective 2', minGrade: 'D', ects: 6, elective: true },
  { id: 'y4f-elective3', year: 4, term: 'Fall', code: '', title: 'ELCE Elective 3', minGrade: 'D', ects: 6, elective: true },

  // YEAR 4 SPRING (30 ECTS)
  { id: 'y4s-eng400b', year: 4, term: 'Spring', code: 'ENG 400', title: 'Capstone Project (part 2)', minGrade: 'C-', ects: 6 },
  { id: 'y4s-innovation', year: 4, term: 'Spring', code: '', title: 'Innovation, Entrepreneurship & Creative Problem Solving', minGrade: 'D', ects: 6 },
  { id: 'y4s-elective4', year: 4, term: 'Spring', code: '', title: 'ELCE Elective 4', minGrade: 'D', ects: 6, elective: true },
  { id: 'y4s-elective5', year: 4, term: 'Spring', code: '', title: 'ELCE Elective 5', minGrade: 'D', ects: 6, elective: true },
  { id: 'y4s-sustainability', year: 4, term: 'Spring', code: '', title: 'Sustainability, Climate & Socio-Economic Transitions', minGrade: 'D', ects: 6 },
];

// Required total for the degree (ASC 100 is added on top when the IELTS setting is on).
const PROGRAM_TOTAL_ECTS = 248;

// Added to the plan when "IELTS below 6.5" is on. Counts in addition to PROGRAM_TOTAL_ECTS.
const EXTRA_ASC100 = { id: 'extra-asc100', year: 1, term: 'Fall', code: 'ASC 100', title: 'English for Academic Purposes', minGrade: 'D', ects: 6, extra: true };

const PROGRAM_NOTES = [
  'D* on Kazakh Language: D is enough only if your Kazakh level is Advanced; otherwise the minimum is C-.',
  'ASC 100 English for Academic Purposes (6 ECTS) is required if your IELTS is below 6.5, and counts in addition to the 248 ECTS.',
  'ECE Specialization Laboratory credits can be replaced by ECE Discipline Electives.',
];
