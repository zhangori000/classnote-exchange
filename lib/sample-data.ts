export type Comment = {
  id: string;
  author: string;
  createdAt: string;
  content: string;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  likes: number;
  dislikes: number;
  tags: string[];
  author: string;
  createdAt: string;
  comments: Comment[];
  minConsensusLikes: number;
  approved: boolean;
  expiresAt: string;
};

export type LectureEntry = {
  date: string;
  posts: Post[];
};

export type ClassTopic = {
  id: string;
  name: string;
  code: string;
  instructor: string;
  summary: string;
  meetingPattern: string;
  generalPosts: Post[];
  lectureSchedule: LectureEntry[];
};

export type University = {
  id: string;
  name: string;
  location: string;
  code: string;
  motto: string;
  colors: {
    primary: string;
    accent: string;
  };
  classes: ClassTopic[];
};

const now = new Date();
const dayMs = 24 * 60 * 60 * 1000;

const daysFromNow = (offset: number) =>
  new Date(now.getTime() + offset * dayMs).toISOString();

const dayStamp = (offset: number) => daysFromNow(offset).split("T")[0];

const expirationDate = () => daysFromNow(30);

const comment = (
  id: string,
  author: string,
  offset: number,
  content: string
): Comment => ({
  id,
  author,
  createdAt: daysFromNow(offset),
  content
});

const buildPost = (
  id: string,
  title: string,
  body: string,
  tags: string[],
  likes: number,
  dislikes: number,
  offset: number,
  minConsensusLikes: number,
  author = "Study Crew",
  overrideComments?: Comment[]
): Post => ({
  id,
  title,
  body,
  tags,
  likes,
  dislikes,
  author,
  createdAt: daysFromNow(offset),
  comments:
    overrideComments ?? [
      comment(id + "-c1", "Focused Falcon", offset + 1, "Appreciate the clarity here."),
      comment(id + "-c2", "Curious Dolphin", offset + 2, "Posting my variant later tonight.")
    ],
  minConsensusLikes,
  approved: likes >= minConsensusLikes,
  expiresAt: expirationDate()
});

const lecturePosts = (base: string, offset: number): Post[] => [
  buildPost(
    base + "-a",
    "Whiteboard capture set",
    "High-res snaps of today's derivations plus inline LaTeX transcription.",
    ["whiteboard", "pdf"],
    34,
    1,
    offset,
    15,
    "Lecture Lens"
  ),
  buildPost(
    base + "-b",
    "Speed-run recap",
    "Audio TL;DR plus the five arguments Professor stressed in class.",
    ["audio", "recap"],
    18,
    0,
    offset,
    10,
    "Husky Highlights"
  ),
  buildPost(
    base + "-c",
    "Practice problem dump",
    "Ten interview-style problems aligned to the lecture with solution outlines.",
    ["practice", "interview"],
    9,
    3,
    offset,
    12,
    "Algo Practice"
  )
];

export const universities: University[] = [
  {
    id: "univ-neu",
    name: "Northeastern University",
    location: "Boston, MA",
    code: "NEU",
    motto: "Light. Truth. Action.",
    colors: { primary: "#CC0000", accent: "#1C1C1C" },
    classes: [
      {
        id: "neu-cs3000",
        name: "CS 3000 - Algorithms and Data",
        code: "CS 3000",
        instructor: "Prof. Erin Hescott",
        summary:
          "Greedy proofs, flow algorithms, and divide-and-conquer with weekly studio recitations built around whiteboard problem packs.",
        meetingPattern: "Tue/Thu, 1:35 PM - ISEC 132",
        generalPosts: [
          buildPost(
            "neu-cs3000-midterm",
            "Midterm II walkthrough deck (70 screenshots)",
            "Exported my iPad notes plus doc-cam photos. Slides mirror the substitution proof Professor did in class.",
            ["midterm", "screenshots"],
            118,
            5,
            -3,
            25,
            "Algo Collective",
            [
              comment("neu-cs3000-midterm-c1", "Marathon Husky", -2, "Slide 12 saved me."),
              comment("neu-cs3000-midterm-c2", "Night Owl Dev", -1, "Adding amortized hints tonight.")
            ]
          ),
          buildPost(
            "neu-cs3000-fenwick",
            "Fenwick tree visual cheatsheet",
            "PNG storyboard showing every update and binary mask. Color layers mimic Prof. Hescott's doc cam.",
            ["data structures", "visual"],
            76,
            2,
            -2,
            15,
            "Trace Table Gang"
          ),
          buildPost(
            "neu-cs3000-flashcards",
            "Runtime flashcards ready for Anki",
            "Every syllabus algorithm converted into Q/A cards with cropped derivation photos.",
            ["anki", "study"],
            63,
            4,
            -5,
            12,
            "West Village Study Pod"
          )
        ],
        lectureSchedule: [
          { date: dayStamp(-4), posts: lecturePosts("neu-cs3000-lecture1", -4) },
          { date: dayStamp(-1), posts: lecturePosts("neu-cs3000-lecture2", -1) },
          { date: dayStamp(2), posts: lecturePosts("neu-cs3000-lecture3", 2) }
        ]
      },
      {
        id: "neu-eece4520",
        name: "EECE 4520 - Machine Learning Systems",
        code: "EECE 4520",
        instructor: "Prof. Jae Park",
        summary:
          "GPUs, deployment pipelines, and real-time monitoring. Labs mix oscilloscope captures with PyTorch notebooks so you can debug both domains.",
        meetingPattern: "Mon/Wed, 5:40 PM - EXP 460",
        generalPosts: [
          buildPost(
            "neu-eece4520-scope",
            "Backprop lab scope doc",
            "Tektronix captures with annotations showing where the noise spikes. Timestamps match the DAQ.",
            ["lab", "hardware"],
            51,
            1,
            -4,
            18,
            "Analog Meets AI"
          ),
          buildPost(
            "neu-eece4520-playbook",
            "Model monitoring playbook",
            "Grafana screenshots + alert rules we coded in lecture. Good for co-op hand-offs.",
            ["ops", "guide"],
            38,
            0,
            -2,
            15,
            "Lofgren Lab Crew"
          )
        ],
        lectureSchedule: [
          { date: dayStamp(-5), posts: lecturePosts("neu-eece4520-lecture1", -5) },
          { date: dayStamp(1), posts: lecturePosts("neu-eece4520-lecture2", 1) }
        ]
      },
      {
        id: "neu-phys2371",
        name: "PHYS 2371 - Modern Physics",
        code: "PHYS 2371",
        instructor: "Dr. Clara Song",
        summary:
          "Wave mechanics, relativity, and intro quantum with chalkboard derivations and studio worksheets.",
        meetingPattern: "Mon/Wed/Fri, 9:15 AM - Richards 200",
        generalPosts: [
          buildPost(
            "neu-phys2371-lorentz",
            "Lorentz transform gallery",
            "DSLR shots of every chalkboard from today plus the worksheet where we derived time dilation.",
            ["relativity", "photos"],
            44,
            2,
            -2,
            10,
            "Quantum Quarter"
          ),
          buildPost(
            "neu-phys2371-map",
            "Midterm concept map (handwritten)",
            "Stitched JPEG of my iPad map linking each concept to the matching lecture date for quick review.",
            ["midterm", "concept map"],
            35,
            1,
            -4,
            10,
            "Campus Coffee Crew"
          )
        ],
        lectureSchedule: [
          { date: dayStamp(-3), posts: lecturePosts("neu-phys2371-lecture1", -3) },
          { date: dayStamp(4), posts: lecturePosts("neu-phys2371-lecture2", 4) }
        ]
      }
    ]
  }
];
