"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BookOpen,
  CalendarDays,
  Compass,
  Maximize2,
  MessageCircle,
  Menu,
  Minimize2,
  Notebook,
  Search,
  ThumbsDown,
  ThumbsUp,
  X
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";

import { generateAlias } from "@/lib/random-alias";
import type { Post, University } from "@/lib/sample-data";
import { universities as seedUniversities } from "@/lib/sample-data";

type PostContext =
  | { context: "general"; postId: string }
  | { context: "lecture"; postId: string; date: string };

type ThreadTab = PostContext & {
  key: string;
  minimized: boolean;
};

const createTabKey = (
  context: PostContext["context"],
  postId: string,
  date?: string
) => (context === "lecture" ? `${context}:${date}:${postId}` : `${context}:${postId}`);

const tabFromContext = (payload: PostContext): ThreadTab => ({
  ...payload,
  key: createTabKey(
    payload.context,
    payload.postId,
    payload.context === "lecture" ? payload.date : undefined
  ),
  minimized: false
});

const relativeTime = (value: string) =>
  formatDistanceToNow(parseISO(value), { addSuffix: true });

const formatTimestamp = (value: string) =>
  format(parseISO(value), "MMM d @ h:mm a");

const defaultExpiration = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const createLocalId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dayKey = (date: Date) => format(date, "yyyy-MM-dd");

export default function HomePage() {
  const [catalog, setCatalog] = useState<University[]>(seedUniversities);
  const [search, setSearch] = useState("");
  const [selectedUniversityId, setSelectedUniversityId] = useState(
    seedUniversities[0]?.id ?? ""
  );
  const [selectedClassId, setSelectedClassId] = useState(
    seedUniversities[0]?.classes[0]?.id ?? ""
  );
  const [activeTab, setActiveTab] = useState<"general" | "lecture">("general");
  const [openTabs, setOpenTabs] = useState<ThreadTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAnon, setCommentAnon] = useState(true);
  const [anonAlias, setAnonAlias] = useState(generateAlias());
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [mobileLectureListOpen, setMobileLectureListOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [newPostTags, setNewPostTags] = useState("");
  const [newPostAnon, setNewPostAnon] = useState(true);
  const [voteHistory, setVoteHistory] = useState<Record<string, "like" | "dislike">>({});
  const threadDockRef = useRef<HTMLDivElement | null>(null);

  const clearOpenTabs = useCallback(() => {
    setOpenTabs([]);
    setActiveTabKey(null);
  }, []);

  const handleActivateTab = useCallback((key: string) => {
    setActiveTabKey(key);
    setOpenTabs((prev) =>
      prev.map((tab) => (tab.key === key ? { ...tab, minimized: false } : tab))
    );
  }, []);

  const handleOpenThread = useCallback(
    (payload: PostContext) => {
      const key = createTabKey(
        payload.context,
        payload.postId,
        payload.context === "lecture" ? payload.date : undefined
      );
      setOpenTabs((prev) => {
        const exists = prev.some((tab) => tab.key === key);
        if (exists) {
          return prev.map((tab) =>
            tab.key === key ? { ...tab, minimized: false } : tab
          );
        }
        return [...prev, tabFromContext(payload)];
      });
      setActiveTabKey(key);
    },
    []
  );

  const handleCloseTab = useCallback((key: string) => {
    setOpenTabs((prev) => {
      const index = prev.findIndex((tab) => tab.key === key);
      if (index === -1) return prev;
      const nextTabs = prev.filter((tab) => tab.key !== key);
      setActiveTabKey((current) => {
        if (current !== key) return current;
        if (!nextTabs.length) return null;
        if (nextTabs[index]) return nextTabs[index].key;
        return nextTabs[index - 1]?.key ?? nextTabs[0].key;
      });
      return nextTabs;
    });
  }, []);

  const handleToggleMinimizeTab = useCallback((key: string) => {
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.key === key ? { ...tab, minimized: !tab.minimized } : tab
      )
    );
  }, []);
  const selectedUniversity = useMemo(
    () => catalog.find((uni) => uni.id === selectedUniversityId),
    [catalog, selectedUniversityId]
  );

  const selectedClass = useMemo(() => {
    if (!selectedUniversity) return undefined;
    return selectedUniversity.classes.find((cls) => cls.id === selectedClassId);
  }, [selectedUniversity, selectedClassId]);

  const classList = selectedUniversity?.classes ?? [];

  const lectureSchedule = useMemo(() => {
    if (!selectedClass) return [];
    return [...selectedClass.lectureSchedule].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [selectedClass]);

  const activeThreadTab = useMemo(
    () => (activeTabKey ? openTabs.find((tab) => tab.key === activeTabKey) ?? null : null),
    [openTabs, activeTabKey]
  );

  const getPostForThread = useCallback(
    (thread: PostContext | null) => {
      if (!thread || !selectedClass) return undefined;
      if (thread.context === "general") {
        return selectedClass.generalPosts.find((post) => post.id === thread.postId);
      }
      const lecture = selectedClass.lectureSchedule.find((entry) => entry.date === thread.date);
      return lecture?.posts.find((post) => post.id === thread.postId);
    },
    [selectedClass]
  );

  const activePost = useMemo(
    () => getPostForThread(activeThreadTab),
    [getPostForThread, activeThreadTab]
  );

  const getTabLabel = useCallback(
    (tab: ThreadTab) => {
      const post = getPostForThread(tab);
      if (post) return post.title;
      if (tab.context === "general") return "General thread";
      if (tab.context === "lecture" && tab.date) {
        return `Lecture - ${format(parseISO(tab.date), "MMM d")}`;
      }
      return "Thread";
    },
    [getPostForThread]
  );

  const selectedPostRef = activeThreadTab;
  const activeVote = selectedPostRef ? voteHistory[selectedPostRef.postId] : undefined;

  const selectedDayKey = selectedDate ? dayKey(selectedDate) : null;

  const filteredUniversities = useMemo(() => {
    if (!search.trim()) return catalog;
    const term = search.toLowerCase();
    return catalog.filter(
      (uni) =>
        uni.name.toLowerCase().includes(term) ||
        uni.code.toLowerCase().includes(term) ||
        uni.location.toLowerCase().includes(term)
    );
  }, [catalog, search]);

  useEffect(() => {
    if (!selectedUniversity) {
      setSelectedClassId("");
      clearOpenTabs();
      return;
    }

    if (!selectedUniversity.classes.some((cls) => cls.id === selectedClassId)) {
      const fallbackClass = selectedUniversity.classes[0];
      setSelectedClassId(fallbackClass?.id ?? "");
      setActiveTab("general");
      clearOpenTabs();
    }
  }, [selectedUniversity, selectedClassId, clearOpenTabs]);

  useEffect(() => {
    if (!lectureSchedule.length) {
      setSelectedDate(null);
      setMobileLectureListOpen(false);
      return;
    }
    const firstLectureDate = parseISO(lectureSchedule[0].date);
    setSelectedDate(firstLectureDate);
    setCurrentMonth(startOfMonth(firstLectureDate));
    setMobileLectureListOpen(false);
  }, [lectureSchedule]);

  const mutatePost = (
    context: PostContext["context"],
    postId: string,
    updater: (post: Post) => Post,
    lectureDate?: string
  ) => {
    const enforceConsensus = (post: Post): Post => ({
      ...post,
      approved: post.approved || post.likes >= post.minConsensusLikes
    });
    if (!selectedUniversity || !selectedClass) return;

    setCatalog((prev) =>
      prev.map((uni) => {
        if (uni.id !== selectedUniversity.id) return uni;
        return {
          ...uni,
          classes: uni.classes.map((cls) => {
            if (cls.id !== selectedClass.id) return cls;
            if (context === "general") {
              return {
                ...cls,
                generalPosts: cls.generalPosts.map((post) =>
                  post.id === postId ? enforceConsensus(updater(post)) : post
                )
              };
            }
            return {
              ...cls,
              lectureSchedule: cls.lectureSchedule.map((entry) => {
                if (entry.date !== lectureDate) return entry;
                return {
                  ...entry,
                  posts: entry.posts.map((post) =>
                    post.id === postId ? enforceConsensus(updater(post)) : post
                  )
                };
              })
            };
          })
        };
      })
    );
  };
  const handleVote = (
    context: PostContext["context"],
    postId: string,
    type: "like" | "dislike",
    lectureDate?: string
  ) => {
    const previousVote = voteHistory[postId];
    const togglingOff = previousVote === type;
    const nextVote: "like" | "dislike" | undefined = togglingOff ? undefined : type;

    setVoteHistory((prev) => {
      const next = { ...prev };
      if (togglingOff) {
        delete next[postId];
      } else {
        next[postId] = type;
      }
      return next;
    });

    mutatePost(
      context,
      postId,
      (post) => {
        let likes = post.likes;
        let dislikes = post.dislikes;

        if (previousVote === "like") {
          likes = Math.max(0, likes - 1);
        } else if (previousVote === "dislike") {
          dislikes = Math.max(0, dislikes - 1);
        }

        if (nextVote === "like") {
          likes += 1;
        } else if (nextVote === "dislike") {
          dislikes += 1;
        }

        return {
          ...post,
          likes,
          dislikes
        };
      },
      lectureDate
    );
  };

  const handleCommentSubmit = () => {
    if (!selectedPostRef || !activePost || !commentDraft.trim()) return;

    const alias = commentAnon ? anonAlias : "You";
    const newComment = {
      id: createLocalId(),
      author: alias,
      createdAt: new Date().toISOString(),
      content: commentDraft.trim()
    };

    mutatePost(
      selectedPostRef.context,
      selectedPostRef.postId,
      (post) => ({
        ...post,
        comments: [...post.comments, newComment]
      }),
      selectedPostRef.context === "lecture" ? selectedPostRef.date : undefined
    );

    setCommentDraft("");
    if (commentAnon) {
      setAnonAlias(generateAlias());
    }
  };

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const notesByDay = useMemo(() => {
    if (!selectedClass) return new Map<string, Post[]>();
    return new Map(
      selectedClass.lectureSchedule.map((entry) => [entry.date, entry.posts])
    );
  }, [selectedClass]);

  const postsForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    const key = dayKey(selectedDate);
    return notesByDay.get(key) ?? [];
  }, [notesByDay, selectedDate]);

  useEffect(() => {
    setMobileLectureListOpen(false);
  }, [selectedDayKey, activeTab]);

  useEffect(() => {
    if (!threadDockRef.current || !activeThreadTab) return;
    threadDockRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeThreadTab]);

  const sortedGeneralPosts = useMemo(() => {
    if (!selectedClass) return [];
    return [...selectedClass.generalPosts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [selectedClass]);

  const lectureCards = postsForSelectedDay.map((post) => {
    const userVote = voteHistory[post.id];
    const likeActive = userVote === "like";
    const dislikeActive = userVote === "dislike";

    return (
      <article
        key={post.id}
        className={clsx(
          "glass-panel border border-transparent p-5 transition hover:-translate-y-0.5 hover:shadow-lg",
          selectedPostRef?.context === "lecture" && selectedPostRef.postId === post.id
            ? "border-ink-200"
            : ""
        )}
        onClick={() => {
          if (!selectedDayKey) return;
          handleOpenThread({ context: "lecture", postId: post.id, date: selectedDayKey });
        }}
      >
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-ink-400">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {selectedDate ? `${format(selectedDate, "MMM d")} - Lecture drop` : "Lecture drop"}
          </div>
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <h3 className="mt-3 text-xl font-semibold text-ink-900">{post.title}</h3>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <span>
            {post.approved
              ? "Consensus locked"
              : `${Math.max(post.minConsensusLikes - post.likes, 0)} likes to store forever`}
          </span>
          <span>Expires {formatDistanceToNow(new Date(post.expiresAt), { addSuffix: true })}</span>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          Uploaded {formatTimestamp(post.createdAt)} - {relativeTime(post.createdAt)}
        </p>
        <p className="mt-2 text-sm text-ink-600">{post.body}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-ink-500">
          <button
            className={clsx(
              "flex items-center gap-1 rounded-full border px-3 py-1 transition",
              likeActive
                ? "border-ink-500 bg-ink-50 text-ink-900"
                : "border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink-900"
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (!selectedDayKey) return;
              handleVote("lecture", post.id, "like", selectedDayKey);
            }}
            aria-pressed={likeActive}
          >
            <ThumbsUp className="h-4 w-4" />
            {post.likes}
          </button>
          <button
            className={clsx(
              "flex items-center gap-1 rounded-full border px-3 py-1 transition",
              dislikeActive
                ? "border-ink-500 bg-ink-50 text-ink-900"
                : "border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink-900"
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (!selectedDayKey) return;
              handleVote("lecture", post.id, "dislike", selectedDayKey);
            }}
            aria-pressed={dislikeActive}
          >
            <ThumbsDown className="h-4 w-4" />
            {post.dislikes}
          </button>
          <div className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            {post.comments.length} notes
          </div>
        </div>
      </article>
    );
  });
  return (
    <main className="mx-auto max-w-7xl px-4 pt-8 pb-48 lg:px-8">
      <header className="mb-10 rounded-3xl bg-gradient-to-r from-ink-900 to-ink-700 p-10 text-white shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-white/70">Classnote Exchange</p>
            <h1 className="mt-4 text-4xl font-semibold">Crowd-sourced lecture drops, study threads, and course intel.</h1>
            <p className="mt-3 max-w-2xl text-lg text-white/80">
              Pick your campus, open the class board, and swap the best lecture notes or exam prep tips without worrying about paywalls or logins.
            </p>
          </div>
          <div className="glass-panel w-full max-w-sm bg-white/10 p-6 text-white">
            <p className="text-sm font-medium uppercase tracking-wide text-white/80">Zero friction</p>
            <p className="mt-2 text-2xl font-semibold">No logins. No ads. Just signal.</p>
            <p className="mt-3 text-sm text-white/80">Comment anonymously like Google Docs -- aliases auto-generate when you need them.</p>
          </div>
        </div>
      </header>
      <section className="glass-panel mb-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
                <p className="text-sm font-semibold uppercase tracking-tight text-ink-500">Campus directory</p>
                <p className="text-sm text-ink-500">Pick your school and course code to open its class boards.</p>
              </div>
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campus or code"
              className="w-full rounded-2xl border border-ink-100 bg-white px-10 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
          {filteredUniversities.length ? (
            filteredUniversities.map((uni) => {
              const isActive = uni.id === selectedUniversity?.id;
              return (
                <button
                  key={uni.id}
                  onClick={() => {
                    setSelectedUniversityId(uni.id);
                    clearOpenTabs();
                  }}
                  className={clsx(
                    "min-w-[240px] shrink-0 rounded-2xl border p-4 text-left transition-all",
                    isActive ? "border-ink-900 bg-ink-900 text-white shadow-md" : "border-ink-200 hover:border-ink-300"
                  )}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{uni.name}</span>
                    <span className={clsx(
                      "rounded-full px-3 py-1 text-xs",
                      isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-700"
                    )}>
                      {uni.code}
                    </span>
                  </div>
                  <p className={clsx("mt-1 text-xs", isActive ? "text-white/80" : "text-ink-500")}>{uni.location}</p>
                  <p className={clsx("mt-2 text-[11px] uppercase tracking-wide", isActive ? "text-white/60" : "text-ink-400")}>
                    {uni.motto}
                  </p>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-ink-400">No universities found. Try another keyword.</p>
          )}
        </div>
      </section>

      <section className="space-y-6">
          <div className="glass-panel p-6">
            <div className="flex flex-wrap items-center gap-2">
              {classList.map((cls) => {
                const isActive = cls.id === selectedClass?.id;
                return (
                  <button
                    key={cls.id}
                    onClick={() => {
                      setSelectedClassId(cls.id);
                      clearOpenTabs();
                    }}
                    className={clsx(
                      "rounded-full border px-4 py-1 text-sm font-medium transition-all",
                      isActive ? "border-ink-900 bg-ink-900 text-white shadow-md" : "border-ink-200 text-ink-500 hover:border-ink-300"
                    )}
                  >
                    {cls.code}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-start gap-6">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-wide text-ink-400">{selectedUniversity?.name}</p>
                <h2 className="text-2xl font-semibold text-ink-900">{selectedClass?.name ?? "Choose a class"}</h2>
                <p className="text-sm text-ink-500">{selectedClass?.instructor ?? "Tap a course code to open its board"}</p>
              </div>
              {selectedClass && (
                <div className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-600">
                  <p className="flex items-center gap-2 font-medium">
                    <CalendarDays className="h-4 w-4" />
                    {selectedClass.meetingPattern}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-4 text-sm text-ink-600">
              {selectedClass?.summary ?? "Switch campuses or search above to find your class."}
            </p>
          </div>
          <div className="glass-panel p-2">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink-50 p-1">
              {[
                { key: "general", label: "General threads", icon: Notebook },
                { key: "lecture", label: "Lecture notes", icon: BookOpen }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  className={clsx(
                    "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-all",
                    activeTab === key ? "bg-white text-ink-900 shadow" : "text-ink-500 hover:text-ink-700"
                  )}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="glass-panel space-y-4 border border-dashed border-ink-200 px-4 py-4 text-sm text-ink-600">
            <div>
              <p className="font-semibold text-ink-800">Posting guidelines</p>
            <p>
              Long-form or screenshot-heavy notes? Drop a Google Doc / Drive / Notion link inside your post. Every thread must reach consensus
              within 30 days or it expires to keep spam out.
            </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <input
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                placeholder="Thread title"
                className="rounded-2xl border border-ink-200 px-4 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
              />
              <input
                value={newPostTags}
                onChange={(e) => setNewPostTags(e.target.value)}
                placeholder="Tags (comma separated)"
                className="rounded-2xl border border-ink-200 px-4 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
              />
            </div>
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="Share links, context, and why the post is helpful..."
              rows={4}
              className="w-full rounded-2xl border border-ink-200 px-4 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setNewPostAnon((prev) => !prev)}
                className={clsx(
                  "text-sm font-semibold",
                  newPostAnon ? "text-ink-900" : "text-ink-400"
                )}
              >
                {newPostAnon ? "Posting anonymously" : "Show my name"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedClass || !selectedUniversity) return;
                  if (!newPostTitle.trim() || !newPostBody.trim()) return;
                  const tags = newPostTags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  const newPost: Post = {
                    id: createLocalId(),
                    title: newPostTitle.trim(),
                    body: newPostBody.trim(),
                    likes: 0,
                    dislikes: 0,
                    tags,
                    author: newPostAnon ? generateAlias() : "You",
                    createdAt: new Date().toISOString(),
                    comments: [],
                    minConsensusLikes: 15,
                    approved: false,
                    expiresAt: defaultExpiration()
                  };
                  setCatalog((prev) =>
                    prev.map((uni) => {
                      if (uni.id !== selectedUniversity.id) return uni;
                      return {
                        ...uni,
                        classes: uni.classes.map((cls) => {
                          if (cls.id !== selectedClass.id) return cls;
                          return {
                            ...cls,
                            generalPosts: [newPost, ...cls.generalPosts]
                          };
                        })
                      };
                    })
                  );
                  setNewPostTitle("");
                  setNewPostBody("");
                  setNewPostTags("");
                  setNewPostAnon(true);
                }}
                disabled={!newPostTitle.trim() || !newPostBody.trim()}
                className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-200"
              >
                Share thread
              </button>
            </div>
            <p className="text-xs text-ink-500">
              Consensus needs 15 likes (10% of active readers) within 30 days for permanent storage. Threads below the line expire automatically.
            </p>
          </div>
          {activeTab === "general" && (
            <div className="space-y-4">
              {sortedGeneralPosts.map((post) => {
                const userVote = voteHistory[post.id];
                const likeActive = userVote === "like";
                const dislikeActive = userVote === "dislike";

                return (
                  <article
                    key={post.id}
                    className={clsx(
                      "glass-panel cursor-pointer border border-transparent p-5 transition hover:-translate-y-0.5 hover:shadow-lg",
                      selectedPostRef?.context === "general" && selectedPostRef.postId === post.id
                        ? "border-ink-200"
                        : ""
                    )}
                    onClick={() => handleOpenThread({ context: "general", postId: post.id })}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-400">
                        <Notebook className="h-4 w-4" />
                        Thread - {formatTimestamp(post.createdAt)} - {relativeTime(post.createdAt)}
                      </div>
                      <span
                        className={clsx(
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          post.approved ? "bg-ink-100 text-ink-800" : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {post.approved
                          ? "Consensus reached"
                          : `${Math.max(post.minConsensusLikes - post.likes, 0)} likes to approve`}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {post.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold text-ink-900">{post.title}</h3>
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">
                      Expires {formatDistanceToNow(new Date(post.expiresAt), { addSuffix: true })}
                    </p>
                    <p className="mt-2 text-sm text-ink-600">{post.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-ink-500">
                      <button
                        className={clsx(
                          "flex items-center gap-1 rounded-full border px-3 py-1 transition",
                          likeActive
                            ? "border-ink-500 bg-ink-50 text-ink-900"
                            : "border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink-900"
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleVote("general", post.id, "like");
                        }}
                        aria-pressed={likeActive}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {post.likes}
                      </button>
                      <button
                        className={clsx(
                          "flex items-center gap-1 rounded-full border px-3 py-1 transition",
                          dislikeActive
                            ? "border-ink-500 bg-ink-50 text-ink-900"
                            : "border-ink-100 text-ink-600 hover:border-ink-200 hover:text-ink-900"
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleVote("general", post.id, "dislike");
                        }}
                        aria-pressed={dislikeActive}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        {post.dislikes}
                      </button>
                      <div className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        {post.comments.length} responses
                      </div>
                    </div>
                  </article>
                );
              })}
              {!sortedGeneralPosts.length && (
                <div className="glass-panel border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                  No threads yet. Be the first to drop a study guide.
                </div>
              )}
            </div>
          )}
          {activeTab === "lecture" && (
            <div className="space-y-4">
              <div className="glass-panel p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="rounded-full border border-ink-200 px-3 py-1 text-sm text-ink-600 hover:border-ink-300"
                  >
                    Prev
                  </button>
                  <div className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                    {format(currentMonth, "MMMM yyyy")}
                  </div>
                  <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="rounded-full border border-ink-200 px-3 py-1 text-sm text-ink-600 hover:border-ink-300"
                  >
                    Next
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-ink-400">
                  {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {calendarDays.map((date) => {
                    const key = dayKey(date);
                    const hasNotes = notesByDay.has(key);
                    const isFocused = selectedDayKey === key;
                    return (
                      <button
                        key={key}
                    onClick={() => {
                      if (!hasNotes) return;
                      setSelectedDate(date);
                      setCurrentMonth(startOfMonth(date));
                    }}
                        className={clsx(
                          "flex h-12 flex-col items-center justify-center rounded-2xl border text-xs font-semibold transition",
                          hasNotes ? "border-ink-200 text-ink-900" : "border-transparent text-ink-400",
                          isFocused ? "bg-ink-900 text-white" : "",
                          !hasNotes ? "opacity-40" : ""
                        )}
                        disabled={!hasNotes}
                      >
                        <span>{date.getDate()}</span>
                        {hasNotes && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-ink-500" />}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-400">Select any day with a dot to read lecture uploads from classmates.</p>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white/70 px-4 py-2 lg:hidden">
                <div>
                  <p className="text-sm font-semibold text-ink-700">
                    {selectedDate ? format(selectedDate, "MMM d") : "Pick a day"}
                  </p>
                  <p className="text-xs text-ink-500">
                    {postsForSelectedDay.length
                      ? `${postsForSelectedDay.length} lecture note${postsForSelectedDay.length > 1 ? "s" : ""}`
                      : "No notes for this date"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => postsForSelectedDay.length && setMobileLectureListOpen(true)}
                  className="flex items-center gap-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-700 hover:border-ink-300 disabled:cursor-not-allowed disabled:text-ink-300"
                  disabled={!postsForSelectedDay.length}
                >
                  <Menu className="h-4 w-4" />
                  View list
                </button>
              </div>

              <div className="hidden space-y-4 lg:block">
                {lectureCards.length ? (
                  lectureCards
                ) : (
                  <div className="glass-panel border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                    Pick a highlighted day in the calendar to unlock lecture uploads.
                  </div>
                )}
              </div>
            </div>
          )}
          {mobileLectureListOpen && postsForSelectedDay.length > 0 && (
            <div className="fixed inset-0 z-40 bg-black/60 p-4 lg:hidden">
              <div className="mx-auto flex h-full max-w-xl flex-col rounded-3xl bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-800">
                      {selectedDate ? format(selectedDate, "MMM d") : "Lecture notes"}
                    </p>
                    <p className="text-xs text-ink-500">{postsForSelectedDay.length} uploads</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileLectureListOpen(false)}
                    className="rounded-full border border-ink-200 p-2 text-ink-600 hover:border-ink-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pb-2">{lectureCards}</div>
              </div>
            </div>
          )}
      </section>

      {openTabs.length > 0 && (
        <Fragment>
          {activeThreadTab && !activeThreadTab.minimized && activePost && (
            <div
              className="pointer-events-none fixed inset-x-0 z-40"
              style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
            >
              <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4">
                <div className="flex max-h-[min(80vh,640px)] flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/60 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                      {selectedPostRef?.context === "general"
                        ? "General thread"
                        : selectedPostRef?.date
                        ? `Lecture - ${format(parseISO(selectedPostRef.date), "MMM d")}`
                        : "Lecture"}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleMinimizeTab(activeThreadTab.key)}
                        className="rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                        aria-label="Minimize tab"
                      >
                        <Minimize2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCloseTab(activeThreadTab.key)}
                        className="rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-700"
                        aria-label="Close tab"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <article>
                      <h3 className="text-2xl font-semibold text-ink-900">{activePost.title}</h3>
                      <p className="mt-2 text-sm text-ink-500">
                        Posted {formatTimestamp(activePost.createdAt)} - {relativeTime(activePost.createdAt)} - {activePost.author}
                      </p>
                      <p className="mt-4 text-base leading-relaxed text-ink-700">{activePost.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {activePost.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-ink-500">
                        {activePost.approved
                          ? "Consensus locked"
                          : `${Math.max(activePost.minConsensusLikes - activePost.likes, 0)} likes to finalize`}{" "}
                        - Expires {formatDistanceToNow(new Date(activePost.expiresAt), { addSuffix: true })}
                      </p>
                      <div className="mt-5 flex gap-3">
                        <button
                          className={clsx(
                            "flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-2 font-semibold transition",
                            activeVote === "like"
                              ? "border-ink-900 bg-ink-900 text-white"
                              : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
                          )}
                          onClick={() =>
                            handleVote(
                              selectedPostRef!.context,
                              selectedPostRef!.postId,
                              "like",
                              selectedPostRef!.context === "lecture" ? selectedPostRef!.date : undefined
                            )
                          }
                          aria-pressed={activeVote === "like"}
                        >
                          <ThumbsUp className="h-4 w-4" />
                          {activePost.likes} Helpful
                        </button>
                        <button
                          className={clsx(
                            "flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-2 font-semibold transition",
                            activeVote === "dislike"
                              ? "border-ink-900 bg-ink-900 text-white"
                              : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
                          )}
                          onClick={() =>
                            handleVote(
                              selectedPostRef!.context,
                              selectedPostRef!.postId,
                              "dislike",
                              selectedPostRef!.context === "lecture" ? selectedPostRef!.date : undefined
                            )
                          }
                          aria-pressed={activeVote === "dislike"}
                        >
                          <ThumbsDown className="h-4 w-4" />
                          {activePost.dislikes} Pass
                        </button>
                      </div>
                      <div className="mt-6 border-t border-ink-100 pt-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold uppercase tracking-wide text-ink-400">Comments</p>
                          <p className="text-xs text-ink-400">{activePost.comments.length} contributions</p>
                        </div>
                        <div className="mt-4 space-y-4">
                          {activePost.comments.map((comment) => (
                            <div key={comment.id} className="rounded-2xl border border-ink-100 bg-white px-4 py-3">
                              <p className="text-sm font-semibold text-ink-700">{comment.author}</p>
                              <p className="text-xs text-ink-400">
                                {formatTimestamp(comment.createdAt)} - {relativeTime(comment.createdAt)}
                              </p>
                              <p className="mt-2 text-sm text-ink-600">{comment.content}</p>
                            </div>
                          ))}
                          {!activePost.comments.length && (
                            <div className="rounded-2xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
                              No comments yet. Jump in below.
                            </div>
                          )}
                        </div>
                        <div className="mt-5 rounded-2xl border border-ink-100 bg-white p-4">
                          <textarea
                            placeholder="Leave a constructive note or question..."
                            value={commentDraft}
                            onChange={(event) => setCommentDraft(event.target.value)}
                            className="w-full resize-none rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                            rows={4}
                          />
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <button
                              onClick={() =>
                                setCommentAnon((prev) => {
                                  const next = !prev;
                                  if (next) {
                                    setAnonAlias(generateAlias());
                                  }
                                  return next;
                                })
                              }
                              className={clsx(
                                "text-sm font-semibold",
                                commentAnon ? "text-ink-900" : "text-ink-400"
                              )}
                            >
                              {commentAnon ? `Anon alias: ${anonAlias}` : "Comment anonymously"}
                            </button>
                            <button
                              onClick={handleCommentSubmit}
                              disabled={!commentDraft.trim()}
                              className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-ink-200"
                            >
                              Post comment
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-ink-400">
                            {commentAnon
                              ? `Alias locked in as "${anonAlias}" until you post.`
                              : "Your screen name will appear next to this comment."}
                          </p>
                        </div>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div
            ref={threadDockRef}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-100 bg-white/95 shadow-[0_-8px_20px_rgba(15,23,42,0.08)] backdrop-blur"
            style={{ paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto w-full max-w-6xl px-3 lg:px-8">
              <div className="flex min-h-[56px] items-center gap-2 overflow-x-auto">
                {openTabs.map((tab) => {
                  const label = getTabLabel(tab);
                  const meta =
                    tab.context === "general"
                      ? "General"
                      : tab.date
                      ? format(parseISO(tab.date), "MMM d")
                      : "Lecture";
                  const isActive = activeThreadTab?.key === tab.key;
                  const actionBtnClasses = clsx(
                    "rounded-full p-1 transition",
                    isActive
                      ? "text-white/80 hover:bg-white/20 hover:text-white"
                      : "text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                  );
                  return (
                    <div
                      key={tab.key}
                      role="button"
                      tabIndex={0}
                      className={clsx(
                        "flex min-w-[180px] items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition focus:outline-none",
                        isActive
                          ? "border-ink-900 bg-ink-900 text-white shadow-md"
                          : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                      )}
                      onClick={() => handleActivateTab(tab.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleActivateTab(tab.key);
                        }
                      }}
                    >
                      <div className="flex-1 truncate">
                        <p className="truncate">{label}</p>
                        <p
                          className={clsx(
                            "text-[10px] uppercase tracking-wide",
                            isActive ? "text-white/60" : "text-ink-400"
                          )}
                        >
                          {meta}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleMinimizeTab(tab.key);
                          }}
                          className={actionBtnClasses}
                          aria-label={tab.minimized ? "Restore tab" : "Minimize tab"}
                        >
                          {tab.minimized ? (
                            <Maximize2 className="h-4 w-4" />
                          ) : (
                            <Minimize2 className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCloseTab(tab.key);
                          }}
                          className={actionBtnClasses}
                          aria-label="Close tab"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
              })}
            </div>
          </div>
          </div>
        </Fragment>
      )}
    </main>
  );
}
