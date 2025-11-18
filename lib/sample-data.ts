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
  approval: ApprovalState;
};

export type ApprovalState = {
  likes: number;
  dislikes: number;
  ratioTarget: number;
  approved: boolean;
  createdAt: string;
  expiresAt: string;
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
  approval: ApprovalState;
};

const now = new Date();
const dayMs = 24 * 60 * 60 * 1000;

const daysFromNow = (offset: number) =>
  new Date(now.getTime() + offset * dayMs).toISOString();

const dayStamp = (offset: number) => daysFromNow(offset).split("T")[0];

const expirationDate = () => daysFromNow(30);

const APPROVAL_RATIO_TARGET = 0.9;

const approvedUniversityApproval = (
  likes = 120,
  ratioTarget = APPROVAL_RATIO_TARGET
): ApprovalState => ({
  likes,
  dislikes: 0,
  ratioTarget,
  approved: true,
  createdAt: now.toISOString(),
  expiresAt: expirationDate()
});

const approvedClassApproval = (
  likes = 60,
  ratioTarget = APPROVAL_RATIO_TARGET
): ApprovalState => ({
  likes,
  dislikes: 0,
  ratioTarget,
  approved: true,
  createdAt: now.toISOString(),
  expiresAt: expirationDate()
});

type PostSeed = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  likes: number;
  dislikes: number;
  offset: number;
  minConsensusLikes: number;
  author?: string;
  comments?: Comment[];
};

const buildPostsFromSeeds = (seeds: PostSeed[]): Post[] =>
  seeds.map((seed) =>
    buildPost(
      seed.id,
      seed.title,
      seed.body,
      seed.tags,
      seed.likes,
      seed.dislikes,
      seed.offset,
      seed.minConsensusLikes,
      seed.author,
      seed.comments
    )
  );

const lectureSeries = (base: string, startOffset: number, count = 5): LectureEntry[] =>
  Array.from({ length: count }, (_, index) => {
    const offset = startOffset + index * 2;
    return {
      date: dayStamp(offset),
      posts: lecturePosts(`${base}-lecture${index + 1}`, offset)
    };
  });

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
          ),
          ...buildPostsFromSeeds([
            {
              id: "neu-cs3000-slackline",
              title: "Slackline for divide & conquer",
              body: "Annotated Solve() pattern plus a checklist for substitution proofs and recursion tree comparisons.",
              tags: ["divide and conquer", "study guide"],
              likes: 58,
              dislikes: 1,
              offset: -6,
              minConsensusLikes: 15,
              author: "Algo Alley"
            },
            {
              id: "neu-cs3000-flow-kit",
              title: "Network flow cheat kit",
              body: "Cut-based sanity checks, Edmonds-Karp slides, and a gallery of residual graphs from this week's studio.",
              tags: ["network flow", "slides"],
              likes: 72,
              dislikes: 2,
              offset: -4,
              minConsensusLikes: 18,
              author: "Studio Circle"
            }
          ])
        ],
        lectureSchedule: lectureSeries("neu-cs3000", -6)
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
          ),
          ...buildPostsFromSeeds([
            {
              id: "neu-eece4520-pipeline",
              title: "CI/CD for inference clusters",
              body: "Yaml templates, Argo events, and the alert wiring we set up in assignment 3.",
              tags: ["cicd", "infra"],
              likes: 44,
              dislikes: 1,
              offset: -5,
              minConsensusLikes: 16,
              author: "Ops Playground"
            },
            {
              id: "neu-eece4520-telemetry",
              title: "Telemetry sampling bible",
              body: "Why 1% sampling failed our GPU jobs plus the Prometheus queries to prove it.",
              tags: ["telemetry", "prometheus"],
              likes: 39,
              dislikes: 0,
              offset: -3,
              minConsensusLikes: 15,
              author: "Signal Stack"
            }
          ])
        ],
        lectureSchedule: lectureSeries("neu-eece4520", -5)
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
          ),
          ...buildPostsFromSeeds([
            {
              id: "neu-phys2371-quanta",
              title: "Photoelectric effect board shots",
              body: "DSLR close-ups of Planck's derivation plus TA annotations from workshop.",
              tags: ["quantum", "photos"],
              likes: 29,
              dislikes: 1,
              offset: -3,
              minConsensusLikes: 12,
              author: "Photon Club"
            },
            {
              id: "neu-phys2371-labkit",
              title: "Modern physics lab kit inventory",
              body: "Spreadsheet + walkthrough for setting up the interferometer station in under 15 minutes.",
              tags: ["lab", "guide"],
              likes: 26,
              dislikes: 0,
              offset: -1,
              minConsensusLikes: 10,
              author: "Richards Makers"
            }
          ])
        ],
        lectureSchedule: lectureSeries("neu-phys2371", -4)
      }
    ].map((cls) => ({ ...cls, approval: approvedClassApproval() })),
    approval: approvedUniversityApproval()
  },
  {
    id: "univ-ucla",
    name: "University of California, Los Angeles",
    location: "Los Angeles, CA",
    code: "UCLA",
    motto: "Let There Be Light",
    colors: { primary: "#005587", accent: "#FFD100" },
    classes: [
      {
        id: "ucla-cs170",
        name: "CS 170 - Operating Systems",
        code: "CS 170",
        instructor: "Prof. Paul Eggert",
        summary:
          "Threads, synchronization, and file systems with heavy lab projects capped by a multi-core scheduler.",
        meetingPattern: "Tue/Thu, 2:00 PM - Boelter 3400",
        generalPosts: buildPostsFromSeeds([
          {
            id: "ucla-cs170-race",
            title: "Race detector lab recap",
            body: "Step-by-step pointer tracing for race_check plus screenshots of the perf counters we had to collect.",
            tags: ["labs", "threads"],
            likes: 94,
            dislikes: 2,
            offset: -6,
            minConsensusLikes: 20,
            author: "Bruin Kernel"
          },
          {
            id: "ucla-cs170-vm",
            title: "VM cheat sheet (paging + TLB)",
            body: "One-pager mapping lecture notation to actual xv6 macros plus the fault timeline from discussion.",
            tags: ["virtual memory", "cheat sheet"],
            likes: 81,
            dislikes: 1,
            offset: -5,
            minConsensusLikes: 18,
            author: "Syscall Society"
          },
          {
            id: "ucla-cs170-scheduler",
            title: "Scheduler studio solution",
            body: "Explainer for proportional-share scheduling with the curveball testcases TA snuck into Gradescope.",
            tags: ["scheduling", "studio"],
            likes: 77,
            dislikes: 0,
            offset: -4,
            minConsensusLikes: 17,
            author: "Semaphore Squad"
          },
          {
            id: "ucla-cs170-files",
            title: "File system timeline",
            body: "Diagram of log-structured writes vs. journaling plus a checklist for the crash-recovery lab.",
            tags: ["file systems", "diagram"],
            likes: 68,
            dislikes: 1,
            offset: -3,
            minConsensusLikes: 16,
            author: "Boelter Basement"
          },
          {
            id: "ucla-cs170-midterm",
            title: "Midterm review mega doc",
            body: "120-slide PDF of practice questions keyed to lecture timestamps, with answer sketches in speaker notes.",
            tags: ["midterm", "slides"],
            likes: 102,
            dislikes: 3,
            offset: -2,
            minConsensusLikes: 22,
            author: "CS Drop Crew"
          }
        ]),
        lectureSchedule: lectureSeries("ucla-cs170", -7),
        approval: approvedClassApproval()
      },
      {
        id: "ucla-desma160",
        name: "DESMA 160 - Data Visualization",
        code: "DESMA 160",
        instructor: "Dr. Lauren McCarthy",
        summary:
          "Creative coding for data storytelling with p5.js and quick-turn studio critiques.",
        meetingPattern: "Mon/Wed, 10:00 AM - Broad 2101",
        generalPosts: buildPostsFromSeeds([
          {
            id: "ucla-desma160-color",
            title: "Color harmony reference board",
            body: "Adobe palettes + screenshots from critique showing how to keep accessibility in mind.",
            tags: ["color", "reference"],
            likes: 42,
            dislikes: 0,
            offset: -6,
            minConsensusLikes: 12,
            author: "Studio Spectrum"
          },
          {
            id: "ucla-desma160-script",
            title: "p5.js template pack",
            body: "Base sketch + responsive grid helpers we used for assignment 4.",
            tags: ["code", "template"],
            likes: 48,
            dislikes: 1,
            offset: -5,
            minConsensusLikes: 13,
            author: "Creative Coding Pods"
          },
          {
            id: "ucla-desma160-userresearch",
            title: "Interview synthesis mural",
            body: "Digital post-its summarizing each persona plus the insight ladder we built in class.",
            tags: ["research", "mural"],
            likes: 31,
            dislikes: 0,
            offset: -4,
            minConsensusLikes: 12,
            author: "Inspo Index"
          },
          {
            id: "ucla-desma160-motion",
            title: "Motion system reference render",
            body: "After Effects export for the easing curves we tuned, plus Figma component tokens.",
            tags: ["motion", "figma"],
            likes: 36,
            dislikes: 0,
            offset: -3,
            minConsensusLikes: 12,
            author: "Viz Collective"
          },
          {
            id: "ucla-desma160-final",
            title: "Final showcase deck",
            body: "Compiled GIFs and screen recordings from the top stakeholder-ready projects.",
            tags: ["showcase", "deck"],
            likes: 57,
            dislikes: 2,
            offset: -2,
            minConsensusLikes: 15,
            author: "Data Story Circle"
          }
        ]),
        lectureSchedule: lectureSeries("ucla-desma160", -6),
        approval: approvedClassApproval()
      }
    ],
    approval: approvedUniversityApproval()
  },
  {
    id: "univ-utexas",
    name: "University of Texas at Austin",
    location: "Austin, TX",
    code: "UTX",
    motto: "What Starts Here Changes the World",
    colors: { primary: "#BF5700", accent: "#333F48" },
    classes: [
      {
        id: "utexas-cs439",
        name: "CS 439 - Principles of Computer Systems",
        code: "CS 439",
        instructor: "Prof. Kathryn McKinley",
        summary:
          "Systems fundamentals with C programming labs, covering processes, memory, and distributed design.",
        meetingPattern: "Mon/Wed/Fri, 11:00 AM - GDC 2.216",
        generalPosts: buildPostsFromSeeds([
          {
            id: "utexas-cs439-shell",
            title: "Shell lab reference build",
            body: "Breakpoint screenshots + gdb macros we used to chase zombies in lab 2.",
            tags: ["labs", "shell"],
            likes: 64,
            dislikes: 1,
            offset: -6,
            minConsensusLikes: 18,
            author: "Bevo Bytes"
          },
          {
            id: "utexas-cs439-memory",
            title: "Malloc design journal",
            body: "Heap diagrams from TA office hours plus chunk allocation timeline.",
            tags: ["malloc", "memory"],
            likes: 59,
            dislikes: 2,
            offset: -5,
            minConsensusLikes: 17,
            author: "Austin Heap Squad"
          },
          {
            id: "utexas-cs439-grading",
            title: "Auto-grader sanity suite",
            body: "Custom tests for signals, pipes, and exit codes you can drop into run_tests.sh.",
            tags: ["testing", "automation"],
            likes: 53,
            dislikes: 0,
            offset: -4,
            minConsensusLikes: 16,
            author: "GDC Ninjas"
          },
          {
            id: "utexas-cs439-parallel",
            title: "Pthreads cheat-grid",
            body: "Comparison of mutex vs. semaphores plus hazard chart we used in discussion.",
            tags: ["threads", "cheat sheet"],
            likes: 48,
            dislikes: 1,
            offset: -3,
            minConsensusLikes: 15,
            author: "Thread Wrangler"
          },
          {
            id: "utexas-cs439-exam",
            title: "Exam II Q&A digest",
            body: "15 curated questions with color-coded solutions referencing lecture timestamps.",
            tags: ["exam", "review"],
            likes: 71,
            dislikes: 3,
            offset: -2,
            minConsensusLikes: 20,
            author: "Forty Acres Review"
          }
        ]),
        lectureSchedule: lectureSeries("utexas-cs439", -8),
        approval: approvedClassApproval()
      },
      {
        id: "utexas-ee461s",
        name: "EE 461S - Data Science Lab",
        code: "EE 461S",
        instructor: "Dr. Joydeep Ghosh",
        summary:
          "Applied machine learning pipelines with emphasis on deployment and ethical experimentation.",
        meetingPattern: "Tue/Thu, 3:30 PM - EER 0.804",
        generalPosts: buildPostsFromSeeds([
          {
            id: "utexas-ee461s-pandas",
            title: "Notebook utilities toolkit",
            body: "pandas profile snippet, seaborn theme, and the autograder harness for lab 1.",
            tags: ["notebooks", "tooling"],
            likes: 46,
            dislikes: 0,
            offset: -6,
            minConsensusLikes: 14,
            author: "Longhorn Lab"
          },
          {
            id: "utexas-ee461s-mlops",
            title: "Mini-mlops runbook",
            body: "Weights & Biases config, dataset versioning tips, and rollout checklist from lecture 5.",
            tags: ["mlops", "guide"],
            likes: 39,
            dislikes: 0,
            offset: -5,
            minConsensusLikes: 14,
            author: "EER Notes Club"
          },
          {
            id: "utexas-ee461s-modelcard",
            title: "Model card template",
            body: "Filled-out PDF for the fairness case study plus prompts for stakeholder review.",
            tags: ["fairness", "template"],
            likes: 33,
            dislikes: 1,
            offset: -4,
            minConsensusLikes: 12,
            author: "Ethics Coalition"
          },
          {
            id: "utexas-ee461s-dashboard",
            title: "Streamlit dashboard starter",
            body: "Modular layout + sample KPI cards for the deployment milestone.",
            tags: ["dashboard", "starter"],
            likes: 37,
            dislikes: 0,
            offset: -3,
            minConsensusLikes: 13,
            author: "ATX Builders"
          },
          {
            id: "utexas-ee461s-demo",
            title: "Final demo checklist",
            body: "Slide order, latency recording macro, and stakeholder Q&A we used in class.",
            tags: ["demo", "checklist"],
            likes: 55,
            dislikes: 1,
            offset: -2,
            minConsensusLikes: 16,
            author: "Data Lab Alliance"
          }
        ]),
        lectureSchedule: lectureSeries("utexas-ee461s", -7),
        approval: approvedClassApproval()
      }
    ],
    approval: approvedUniversityApproval()
  },
  {
    id: "univ-gatech",
    name: "Georgia Institute of Technology",
    location: "Atlanta, GA",
    code: "GT",
    motto: "Progress and Service",
    colors: { primary: "#B3A369", accent: "#003057" },
    classes: [
      {
        id: "gatech-cs7641",
        name: "CS 7641 - Machine Learning",
        code: "CS 7641",
        instructor: "Prof. Charles Isbell",
        summary:
          "Graduate-level ML survey covering optimization, reinforcement learning, and Bayesian inference.",
        meetingPattern: "Mon/Wed, 4:30 PM - Klaus 1443",
        generalPosts: buildPostsFromSeeds([
          {
            id: "gatech-cs7641-rl",
            title: "Policy iteration board shots",
            body: "Whiteboard captures plus the derivation steps from studio breakout.",
            tags: ["reinforcement learning", "notes"],
            likes: 61,
            dislikes: 0,
            offset: -7,
            minConsensusLikes: 18,
            author: "Klaus Study Pod"
          },
          {
            id: "gatech-cs7641-ensemble",
            title: "Boosting intuition guide",
            body: "Error plot animations and math callouts comparing AdaBoost vs. gradient boosting.",
            tags: ["boosting", "visual"],
            likes: 54,
            dislikes: 1,
            offset: -6,
            minConsensusLikes: 17,
            author: "ML Canvas"
          },
          {
            id: "gatech-cs7641-kernel",
            title: "Kernel trick cheat table",
            body: "Mapping functions, hyper-parameter heuristics, and feature map sketches.",
            tags: ["svm", "kernel"],
            likes: 47,
            dislikes: 1,
            offset: -5,
            minConsensusLikes: 16,
            author: "Vector Club"
          },
          {
            id: "gatech-cs7641-project",
            title: "Project milestone template",
            body: "Overleaf doc with rubric-aligned sections + example plots.",
            tags: ["project", "template"],
            likes: 64,
            dislikes: 2,
            offset: -3,
            minConsensusLikes: 18,
            author: "OMSCS Meet"
          },
          {
            id: "gatech-cs7641-midterm",
            title: "Midterm refresher grid",
            body: "One-page matrix aligning algorithms to bias/variance and sample complexity callouts.",
            tags: ["midterm", "grid"],
            likes: 70,
            dislikes: 3,
            offset: -2,
            minConsensusLikes: 20,
            author: "Yellow Jacket ML"
          }
        ]),
        lectureSchedule: lectureSeries("gatech-cs7641", -9),
        approval: approvedClassApproval()
      },
      {
        id: "gatech-ae4803",
        name: "AE 4803 - Space Systems Design",
        code: "AE 4803",
        instructor: "Prof. Glenn Lightsey",
        summary:
          "Capstone design studio covering spacecraft subsystems, mission planning, and integration reviews.",
        meetingPattern: "Tue/Thu, 9:30 AM - Montgomery Knight 317",
        generalPosts: buildPostsFromSeeds([
          {
            id: "gatech-ae4803-thermal",
            title: "Thermal subsystem scratchpad",
            body: "Excel heat balance plus convection assumptions from lab.",
            tags: ["thermal", "spreadsheet"],
            likes: 33,
            dislikes: 0,
            offset: -7,
            minConsensusLikes: 12,
            author: "Orbit Ops"
          },
          {
            id: "gatech-ae4803-comms",
            title: "Comms link budget walkthrough",
            body: "MATLAB script with sample antenna gains and DSN margins.",
            tags: ["communications", "script"],
            likes: 37,
            dislikes: 1,
            offset: -6,
            minConsensusLikes: 13,
            author: "Deep Space Squad"
          },
          {
            id: "gatech-ae4803-cdh",
            title: "Command & data handling block diagram",
            body: "Altium exports plus microcontroller pin map from our prototype.",
            tags: ["cdh", "diagram"],
            likes: 31,
            dislikes: 0,
            offset: -5,
            minConsensusLikes: 12,
            author: "Flight Bus Crew"
          },
          {
            id: "gatech-ae4803-review",
            title: "PDR slide deck",
            body: "Cleaned slides with redline comments from Prof. Lightsey.",
            tags: ["pdr", "slides"],
            likes: 40,
            dislikes: 1,
            offset: -4,
            minConsensusLikes: 14,
            author: "Space Studio"
          },
          {
            id: "gatech-ae4803-testing",
            title: "Integration test checklist",
            body: "Step-by-step procedure plus vibration table settings.",
            tags: ["testing", "checklist"],
            likes: 44,
            dislikes: 0,
            offset: -3,
            minConsensusLikes: 14,
            author: "Ramblin' Lab"
          }
        ]),
        lectureSchedule: lectureSeries("gatech-ae4803", -8),
        approval: approvedClassApproval()
      }
    ],
    approval: approvedUniversityApproval()
  }
];
