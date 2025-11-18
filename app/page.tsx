"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  BookOpen,
  CalendarDays,
  Compass,
  AlertCircle,
  MapPin,
  Plus,
  GitMerge,
  Maximize2,
  MessageCircle,
  Flag,
  Menu,
  Minimize2,
  Notebook,
  Search,
  ThumbsDown,
  ThumbsUp,
  PlusCircle,
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
import type { ApprovalState, ClassTopic, LectureEntry, Post, University } from "@/lib/sample-data";
import {
  createRemoteComment,
  createRemotePost,
  fetchRemotePosts,
  persistPostVote,
  type RemotePostMeta
} from "@/lib/remote-posts";
import {
  fetchSupabaseCatalog,
  createRemoteClass,
  createRemoteUniversity
} from "@/lib/supabase-catalog";
import {
  fetchApprovalVotes,
  persistClassVote,
  persistUniversityVote
} from "@/lib/remote-approvals";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type PostContext =
  | { context: "general"; postId: string }
  | { context: "lecture"; postId: string; date: string };

type ThreadTab = PostContext & {
  key: string;
  minimized: boolean;
};

type MergeRequest = {
  id: string;
  type: "university" | "class";
  sourceId: string;
  targetId: string;
  universityId?: string;
  likes: number;
  dislikes: number;
  minConsensusLikes: number;
  approved: boolean;
  createdAt: string;
  expiresAt: string;
  reason: string;
};

type FieldChangeRequest = {
  id: string;
  entityType: "university" | "class";
  entityId: string;
  field: string;
  proposedValue: string;
  likes: number;
  dislikes: number;
  minConsensusLikes: number;
  approved: boolean;
  createdAt: string;
  expiresAt: string;
  reason: string;
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

const APPROVAL_RATIO_TARGET = 0.9;
const APPROVAL_RATIO_PERCENT = Math.round(APPROVAL_RATIO_TARGET * 100);
const UNIVERSITY_APPROVAL_RATIO = APPROVAL_RATIO_TARGET;
const CLASS_APPROVAL_RATIO = APPROVAL_RATIO_TARGET;
const FIELD_CONSENSUS_MIN = 25;
const UNIVERSITY_PROPOSAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MERGE_REQUEST_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const FIELD_REQUEST_TTL_MS = 21 * 24 * 60 * 60 * 1000;
const MERGE_CONSENSUS_MIN = 80;
const REALTIME_DEBOUNCE_MS = 120;

const campusPalettes = [
  { primary: "#0f172a", accent: "#f97316" },
  { primary: "#1d3557", accent: "#e63946" },
  { primary: "#004643", accent: "#faae2b" },
  { primary: "#312e81", accent: "#f472b6" },
  { primary: "#065f46", accent: "#f59e0b" }
];

const normalizeUniversityName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const fuzzyUniversityKey = (value: string) =>
  normalizeUniversityName(value).replace(/[aeiou]/g, "").slice(0, 10);

const pickCampusPalette = () => campusPalettes[Math.floor(Math.random() * campusPalettes.length)] ?? campusPalettes[0];

const proposalExpiry = () => new Date(Date.now() + UNIVERSITY_PROPOSAL_TTL_MS).toISOString();
const mergeProposalExpiry = () => new Date(Date.now() + MERGE_REQUEST_TTL_MS).toISOString();
const fieldProposalExpiry = () => new Date(Date.now() + FIELD_REQUEST_TTL_MS).toISOString();

const dedupePosts = (posts: Post[]) => {
  const map = new Map<string, Post>();
  posts.forEach((post) => {
    map.set(post.id, post);
  });
  return Array.from(map.values());
};

const mergeLectureSchedules = (target: LectureEntry[], incoming: LectureEntry[]): LectureEntry[] => {
  const map = new Map<string, LectureEntry>();
  const ingest = (entry: LectureEntry) => {
    const existing = map.get(entry.date);
    if (!existing) {
      map.set(entry.date, { ...entry, posts: dedupePosts(entry.posts) });
      return;
    }
    map.set(entry.date, {
      ...existing,
      posts: dedupePosts([...existing.posts, ...entry.posts])
    });
  };
  target.forEach(ingest);
  incoming.forEach(ingest);
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
};

const meetsApprovalRatio = (likes: number, dislikes: number, ratioTarget: number) => {
  const total = likes + dislikes;
  if (total <= 0) return false;
  return likes / total >= ratioTarget;
};

const getApprovalRatioStats = (approval: ApprovalState) => {
  const totalVotes = approval.likes + approval.dislikes;
  return {
    totalVotes,
    ratioPercent:
      totalVotes > 0 ? Math.round((approval.likes / totalVotes) * 100) : 0,
    targetPercent: Math.round(approval.ratioTarget * 100)
  };
};

const describeApprovalProgress = (approval: ApprovalState) => {
  const stats = getApprovalRatioStats(approval);
  return {
    ...stats,
    ratioDescription:
      stats.totalVotes === 0
        ? "No votes yet"
        : `${stats.ratioPercent}% positive (${approval.likes} up · ${approval.dislikes} hold)`
  };
};

const approvalRequirementCopy = (approval: ApprovalState) => {
  const stats = describeApprovalProgress(approval);
  if (approval.approved) {
    return `Locked with ${stats.ratioPercent}% positive votes`;
  }
  if (stats.totalVotes === 0) {
    return `Needs ${stats.targetPercent}% positive votes to publish`;
  }
  return `${stats.ratioPercent}% positive · need ${stats.targetPercent}% to publish`;
};

const explainSupabaseError = (message?: string | null) => {
  if (!message) return "Supabase rejected the request.";
  if (message.toLowerCase().includes("row-level security")) {
    return "Supabase row-level security blocked this action. Enable anon insert/update policies for universities/classes.";
  }
  return message;
};

const mergeClassTopic = (target: ClassTopic, incoming: ClassTopic): ClassTopic => {
  const likes = target.approval.likes + incoming.approval.likes;
  const dislikes = target.approval.dislikes + incoming.approval.dislikes;
  const ratioTarget = Math.max(target.approval.ratioTarget, incoming.approval.ratioTarget);
  const approved =
    target.approval.approved ||
    incoming.approval.approved ||
    meetsApprovalRatio(likes, dislikes, ratioTarget);
  const createdAt =
    new Date(target.approval.createdAt).getTime() <= new Date(incoming.approval.createdAt).getTime()
      ? target.approval.createdAt
      : incoming.approval.createdAt;
  const expiresAt =
    new Date(target.approval.expiresAt).getTime() >= new Date(incoming.approval.expiresAt).getTime()
      ? target.approval.expiresAt
      : incoming.approval.expiresAt;

  return {
    ...target,
    generalPosts: dedupePosts([...target.generalPosts, ...incoming.generalPosts]),
    lectureSchedule: mergeLectureSchedules(target.lectureSchedule, incoming.lectureSchedule),
    approval: {
      likes,
      dislikes,
      ratioTarget,
      approved,
      createdAt,
      expiresAt
    }
  };
};

const mergeUniversityRecords = (target: University, incoming: University): University => {
  const mergedClasses: ClassTopic[] = [...target.classes];
  incoming.classes.forEach((incomingClass) => {
    const existingIndex = mergedClasses.findIndex((cls) => cls.id === incomingClass.id);
    if (existingIndex === -1) {
      mergedClasses.push(incomingClass);
    } else {
      mergedClasses[existingIndex] = mergeClassTopic(mergedClasses[existingIndex], incomingClass);
    }
  });

  const likes = target.approval.likes + incoming.approval.likes;
  const dislikes = target.approval.dislikes + incoming.approval.dislikes;
  const ratioTarget = Math.max(target.approval.ratioTarget, incoming.approval.ratioTarget);
  const approved =
    target.approval.approved ||
    incoming.approval.approved ||
    meetsApprovalRatio(likes, dislikes, ratioTarget);
  const createdAt =
    new Date(target.approval.createdAt).getTime() <= new Date(incoming.approval.createdAt).getTime()
      ? target.approval.createdAt
      : incoming.approval.createdAt;
  const expiresAt =
    new Date(target.approval.expiresAt).getTime() >= new Date(incoming.approval.expiresAt).getTime()
      ? target.approval.expiresAt
      : incoming.approval.expiresAt;

  return {
    ...target,
    classes: mergedClasses,
    approval: {
      likes,
      dislikes,
      ratioTarget,
      approved,
      createdAt,
      expiresAt
    }
  };
};

const pruneExpiredEntities = (universities: University[]) => {
  const nowTs = Date.now();
  return universities
    .filter(
      (uni) =>
        uni.approval.approved || new Date(uni.approval.expiresAt).getTime() > nowTs
    )
    .map((uni) => ({
      ...uni,
      classes: uni.classes.filter(
        (cls) =>
          cls.approval.approved || new Date(cls.approval.expiresAt).getTime() > nowTs
      )
    }));
};

export default function HomePage() {
  const [catalog, setCatalog] = useState<University[]>([]);
  const [remotePosts, setRemotePosts] = useState<Record<string, Post[]>>({});
  const [remotePostMeta, setRemotePostMeta] = useState<Record<string, RemotePostMeta>>({});
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isRemoteLoading, setIsRemoteLoading] = useState(true);
  const [isRemoteMutating, setIsRemoteMutating] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
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
  const [newUniversityName, setNewUniversityName] = useState("");
  const [newUniversityLocation, setNewUniversityLocation] = useState("");
  const [newUniversityCode, setNewUniversityCode] = useState("");
  const [newUniversityMotto, setNewUniversityMotto] = useState("");
  const [voteHistory, setVoteHistory] = useState<Record<string, "like" | "dislike">>({});
  const [universityVoteHistory, setUniversityVoteHistory] = useState<Record<string, "like" | "dislike">>({});
  const [classVoteHistory, setClassVoteHistory] = useState<Record<string, "like" | "dislike">>({});
  const [mergeRequests, setMergeRequests] = useState<MergeRequest[]>([]);
  const [mergeVoteHistory, setMergeVoteHistory] = useState<Record<string, "like" | "dislike">>({});
  const [mergeCategory, setMergeCategory] = useState<"university" | "class">("university");
  const [mergeReason, setMergeReason] = useState("");
  const [mergeUniversitySourceId, setMergeUniversitySourceId] = useState("");
  const [mergeUniversityTargetId, setMergeUniversityTargetId] = useState("");
  const [mergeClassUniversityId, setMergeClassUniversityId] = useState("");
  const [mergeClassSourceId, setMergeClassSourceId] = useState("");
  const [mergeClassTargetId, setMergeClassTargetId] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [newClassInstructor, setNewClassInstructor] = useState("");
  const [newClassSummary, setNewClassSummary] = useState("");
  const [newClassMeetingPattern, setNewClassMeetingPattern] = useState("");
  const [fieldChangeRequests, setFieldChangeRequests] = useState<FieldChangeRequest[]>([]);
  const [fieldChangeVoteHistory, setFieldChangeVoteHistory] = useState<
    Record<string, "like" | "dislike">
  >({});
  const [fieldProposalReason, setFieldProposalReason] = useState("");
  const [catalogReloadToken, setCatalogReloadToken] = useState(0);
  const [remotePostsReloadToken, setRemotePostsReloadToken] = useState(0);
  const [approvalVotesReloadToken, setApprovalVotesReloadToken] = useState(0);
  const [isAddUniversityOpen, setIsAddUniversityOpen] = useState(false);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isFieldReviewOpen, setIsFieldReviewOpen] = useState(false);
  const [fieldProposalField, setFieldProposalField] = useState("location");
  const [fieldProposalValue, setFieldProposalValue] = useState("");
  const threadDockRef = useRef<HTMLDivElement | null>(null);
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const refreshQueueRef = useRef({ catalog: false, remote: false, votes: false });
  const refreshTimerRef = useRef<number | null>(null);

  const clearOpenTabs = useCallback(() => {
    setOpenTabs([]);
    setActiveTabKey(null);
  }, []);

  const flushRefreshQueue = useCallback(() => {
    refreshTimerRef.current = null;
    const snapshot = { ...refreshQueueRef.current };
    refreshQueueRef.current = { catalog: false, remote: false, votes: false };
    if (snapshot.catalog) setCatalogReloadToken((token) => token + 1);
    if (snapshot.remote) setRemotePostsReloadToken((token) => token + 1);
    if (snapshot.votes) setApprovalVotesReloadToken((token) => token + 1);
  }, []);

  const enqueueRefresh = useCallback(
    (type: "catalog" | "remote" | "votes") => {
      if (typeof window === "undefined") {
        if (type === "catalog") setCatalogReloadToken((token) => token + 1);
        if (type === "remote") setRemotePostsReloadToken((token) => token + 1);
        if (type === "votes") setApprovalVotesReloadToken((token) => token + 1);
        return;
      }
      refreshQueueRef.current[type] = true;
      if (refreshTimerRef.current !== null) return;
      refreshTimerRef.current = window.setTimeout(() => {
        flushRefreshQueue();
      }, REALTIME_DEBOUNCE_MS);
    },
    [flushRefreshQueue]
  );

  const scheduleCatalogRefresh = useCallback(() => {
    enqueueRefresh("catalog");
  }, [enqueueRefresh]);

  const scheduleRemoteRefresh = useCallback(() => {
    enqueueRefresh("remote");
  }, [enqueueRefresh]);

  const scheduleApprovalVotesRefresh = useCallback(() => {
    enqueueRefresh("votes");
  }, [enqueueRefresh]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const broadcastUpdate = useCallback((event: "catalog" | "posts" | "votes") => {
    const channel = broadcastChannelRef.current;
    if (!channel) return;
    channel
      .send({
        type: "broadcast",
        event,
        payload: {}
      })
      .catch(() => {
        // Ignore failures; polling fallback not present, but manual refresh still available.
      });
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
        const remoteMatch =
          remotePosts[selectedClass.id]?.find((post) => post.id === thread.postId);
        if (remoteMatch) return remoteMatch;
        return selectedClass.generalPosts.find((post) => post.id === thread.postId);
      }
      const lecture = selectedClass.lectureSchedule.find((entry) => entry.date === thread.date);
      return lecture?.posts.find((post) => post.id === thread.postId);
    },
    [remotePosts, selectedClass]
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

  useEffect(() => {
    setCatalog((prev) => pruneExpiredEntities(prev));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = catalogReloadToken === 0;
    const loadCatalog = async () => {
      try {
        if (initialLoad) {
          setIsCatalogLoading(true);
        }
        const result = await fetchSupabaseCatalog();
        if (cancelled) return;
        if (result.error) {
          setCatalogError(result.error);
          return;
        }
        setCatalog((prev) => {
          const next = [...prev];
          const indexLookup = new Map<string, number>();
          next.forEach((uni, index) => indexLookup.set(uni.id, index));
          result.universities.forEach((uni) => {
            if (indexLookup.has(uni.id)) {
              next[indexLookup.get(uni.id)!] = uni;
            } else {
              next.push(uni);
            }
          });
          return next;
        });
        setCatalogError(null);
        if (result.universities.length) {
          setSelectedUniversityId((current) => {
            const alreadyPresent = result.universities.some((uni) => uni.id === current);
            if (alreadyPresent) return current;
            return result.universities[0]?.id ?? current;
          });
        }
      } finally {
        if (!cancelled && initialLoad) {
          setIsCatalogLoading(false);
        }
      }
    };
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [catalogReloadToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = "classnote-device-id";
    let id = window.localStorage.getItem(storageKey);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(storageKey, id);
    }
    setDeviceId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = remotePostsReloadToken === 0;
    const loadRemotePosts = async () => {
      try {
        if (initialLoad) {
          setIsRemoteLoading(true);
        }
        const result = await fetchRemotePosts(deviceId ?? undefined);
        if (cancelled) return;
        if (result.error) {
          setRemoteError(result.error);
        } else {
          setRemotePosts(result.postsByClass);
          setRemotePostMeta(result.meta);
          setVoteHistory((prev) => ({ ...prev, ...result.voteHistory }));
          setRemoteError(null);
        }
      } finally {
        if (!cancelled && initialLoad) {
          setIsRemoteLoading(false);
        }
      }
    };
    void loadRemotePosts();
    return () => {
      cancelled = true;
    };
  }, [deviceId, remotePostsReloadToken]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    const loadApprovalVotes = async () => {
      const result = await fetchApprovalVotes(deviceId);
      if (cancelled) return;
      if (result.error) {
        setRemoteError(result.error);
        return;
      }
      setUniversityVoteHistory(result.universityVotes);
      setClassVoteHistory(result.classVotes);
    };
    void loadApprovalVotes();
    return () => {
      cancelled = true;
    };
  }, [deviceId, approvalVotesReloadToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("catalog-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "universities" },
        () => scheduleCatalogRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => scheduleCatalogRefresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [scheduleCatalogRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("posts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () =>
        scheduleRemoteRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments" },
        () => scheduleRemoteRefresh()
      );
    if (deviceId) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes", filter: `device_id=eq.${deviceId}` },
        () => scheduleRemoteRefresh()
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deviceId, scheduleRemoteRefresh]);

  useEffect(() => {
    if (typeof window === "undefined" || !deviceId) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`approval-votes-${deviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "university_votes", filter: `device_id=eq.${deviceId}` },
        () => scheduleApprovalVotesRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_votes", filter: `device_id=eq.${deviceId}` },
        () => scheduleApprovalVotesRefresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [deviceId, scheduleApprovalVotesRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("app-sync", {
        config: {
          broadcast: { self: false }
        }
      })
      .on("broadcast", { event: "catalog" }, () => scheduleCatalogRefresh())
      .on("broadcast", { event: "posts" }, () => scheduleRemoteRefresh())
      .on("broadcast", { event: "votes" }, () => scheduleApprovalVotesRefresh())
      .subscribe();
    broadcastChannelRef.current = channel;
    return () => {
      broadcastChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [scheduleCatalogRefresh, scheduleRemoteRefresh, scheduleApprovalVotesRefresh]);

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

  const mergeSuggestions = useMemo(() => {
    const buckets = new Map<string, University[]>();
    catalog.forEach((uni) => {
      const key = fuzzyUniversityKey(uni.name);
      if (!key) return;
      const bucket = buckets.get(key) ?? [];
      bucket.push(uni);
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values()).filter((group) => group.length > 1);
  }, [catalog]);

  const mergeClassOptions = useMemo(() => {
    if (!mergeClassUniversityId) return [];
    return catalog.find((uni) => uni.id === mergeClassUniversityId)?.classes ?? [];
  }, [catalog, mergeClassUniversityId]);

  const universityLookup = useMemo(() => {
    const map = new Map<string, University>();
    catalog.forEach((uni) => map.set(uni.id, uni));
    return map;
  }, [catalog]);

  const classLookup = useMemo(() => {
    const map = new Map<string, { cls: ClassTopic; universityId: string }>();
    catalog.forEach((uni) => {
      uni.classes.forEach((cls) => {
        map.set(cls.id, { cls, universityId: uni.id });
      });
    });
    return map;
  }, [catalog]);

  const pendingFieldRequests = useMemo(
    () =>
      fieldChangeRequests.filter(
        (request) => !request.approved && new Date(request.expiresAt).getTime() > Date.now()
      ),
    [fieldChangeRequests]
  );

  const selectedUniversityFieldRequests = useMemo(() => {
    if (!selectedUniversity) return [];
    return pendingFieldRequests.filter(
      (request) => request.entityType === "university" && request.entityId === selectedUniversity.id
    );
  }, [pendingFieldRequests, selectedUniversity]);

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
    const remoteMeta = remotePostMeta[postId];
    if (
      remoteMeta &&
      remoteMeta.context === context &&
      (context !== "lecture" || remoteMeta.lectureDate === lectureDate)
    ) {
      setRemotePosts((prev) => {
        const posts = prev[remoteMeta.classId] ?? [];
        const nextPosts: Post[] = posts.map((post) =>
          post.id === postId ? enforceConsensus(updater(post)) : post
        );
        return {
          ...prev,
          [remoteMeta.classId]: nextPosts
        };
      });
      return;
    }
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
    const remoteMeta = remotePostMeta[postId];
    const remoteMatch =
      remoteMeta &&
      remoteMeta.context === context &&
      (context !== "lecture" || remoteMeta.lectureDate === lectureDate)
        ? (remotePosts[remoteMeta.classId] ?? []).find((post) => post.id === postId)
        : undefined;
    let nextLikes = remoteMatch?.likes ?? 0;
    let nextDislikes = remoteMatch?.dislikes ?? 0;
    if (remoteMatch) {
      if (previousVote === "like") {
        nextLikes = Math.max(0, nextLikes - 1);
      } else if (previousVote === "dislike") {
        nextDislikes = Math.max(0, nextDislikes - 1);
      }

      if (nextVote === "like") {
        nextLikes += 1;
      } else if (nextVote === "dislike") {
        nextDislikes += 1;
      }
    }

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

    if (remoteMatch && deviceId) {
      void persistPostVote({
        postId,
        deviceId,
        previousVote,
        nextVote,
        likes: nextLikes,
        dislikes: nextDislikes,
        minConsensusLikes: remoteMatch.minConsensusLikes
      }).then((result) => {
        if (result.error) {
          setRemoteError(result.error);
        } else {
          setRemoteError(null);
          scheduleRemoteRefresh();
          broadcastUpdate("posts");
        }
      });
    }
  };

  const handleUniversityVote = (universityId: string, type: "like" | "dislike") => {
    const target = catalog.find((uni) => uni.id === universityId);
    if (!target) return;

    const previousVote = universityVoteHistory[universityId];
    const togglingOff = previousVote === type;
    const nextVote: "like" | "dislike" | undefined = togglingOff ? undefined : type;
    let nextApproval = applyRatioApprovalVote(target.approval, previousVote, nextVote);
    if (target.approval.approved && !nextApproval.approved) {
      nextApproval = {
        ...nextApproval,
        expiresAt: proposalExpiry()
      };
    }

    setUniversityVoteHistory((prev) => {
      const nextHistory = { ...prev };
      if (togglingOff) {
        delete nextHistory[universityId];
      } else if (nextVote) {
        nextHistory[universityId] = nextVote;
      }
      return nextHistory;
    });

    setCatalog((catalogPrev) =>
      catalogPrev.map((uni) => {
        if (uni.id !== universityId) return uni;
        return { ...uni, approval: nextApproval };
      })
    );

    if (deviceId) {
      void persistUniversityVote({
        universityId,
        deviceId,
        previousVote,
        nextVote,
        approval: nextApproval
      }).then((result) => {
        if (result.error) {
          setRemoteError(result.error);
        } else {
          setRemoteError(null);
          scheduleCatalogRefresh();
          broadcastUpdate("catalog");
        }
      });
    } else {
      scheduleCatalogRefresh();
      broadcastUpdate("catalog");
    }
  };

  const handleClassVote = (classId: string, type: "like" | "dislike") => {
    const target = catalog
      .flatMap((uni) => uni.classes)
      .find((cls) => cls.id === classId);
    if (!target) return;

    const previousVote = classVoteHistory[classId];
    const togglingOff = previousVote === type;
    const nextVote: "like" | "dislike" | undefined = togglingOff ? undefined : type;
    let nextApproval = applyRatioApprovalVote(target.approval, previousVote, nextVote);
    if (target.approval.approved && !nextApproval.approved) {
      nextApproval = {
        ...nextApproval,
        expiresAt: proposalExpiry()
      };
    }

    setClassVoteHistory((prev) => {
      const nextHistory = { ...prev };
      if (togglingOff) {
        delete nextHistory[classId];
      } else if (nextVote) {
        nextHistory[classId] = nextVote;
      }
      return nextHistory;
    });

    setCatalog((catalogPrev) =>
      catalogPrev.map((uni) => ({
        ...uni,
        classes: uni.classes.map((cls) =>
          cls.id === classId ? { ...cls, approval: nextApproval } : cls
        )
      }))
    );

    if (deviceId) {
      void persistClassVote({
        classId,
        deviceId,
        previousVote,
        nextVote,
        approval: nextApproval
      }).then((result) => {
        if (result.error) {
          setRemoteError(result.error);
        } else {
          setRemoteError(null);
          scheduleCatalogRefresh();
          broadcastUpdate("catalog");
        }
      });
    } else {
      scheduleCatalogRefresh();
      broadcastUpdate("catalog");
    }
  };

  const handleAddClass = async () => {
    if (!selectedUniversity || !newClassName.trim() || !newClassCode.trim()) return;
    const name = newClassName.trim();
    const code = newClassCode.trim().toUpperCase();
    const instructor = newClassInstructor.trim() || "Community submitted faculty";
    const summary = newClassSummary.trim() || "New course proposal from the community.";
    const meetingPattern = newClassMeetingPattern.trim() || "See syllabus";
    const approvalSeed: ClassTopic["approval"] = {
      likes: 0,
      dislikes: 0,
      ratioTarget: CLASS_APPROVAL_RATIO,
      approved: false,
      createdAt: new Date().toISOString(),
      expiresAt: proposalExpiry()
    };
    const targetUniversityId = selectedUniversity.id;

    setCatalogError(null);
    const result = await createRemoteClass({
      universityId: targetUniversityId,
      name,
      code,
      instructor,
      summary,
      meetingPattern,
      approval: approvalSeed
    });

    if (!result.classTopic || result.error) {
      setCatalogError(explainSupabaseError(result.error));
      return;
    }

    const createdClass = result.classTopic;
    setCatalog((prev) =>
      prev.map((uni) => {
        if (uni.id !== targetUniversityId) return uni;
        const exists = uni.classes.some((cls) => cls.id === createdClass.id);
        return {
          ...uni,
          classes: exists
            ? uni.classes.map((cls) => (cls.id === createdClass.id ? createdClass : cls))
            : [...uni.classes, createdClass]
        };
      })
    );
    setNewClassName("");
    setNewClassCode("");
    setNewClassInstructor("");
    setNewClassSummary("");
    setNewClassMeetingPattern("");
    setSelectedClassId(createdClass.id);
    clearOpenTabs();
    setIsAddClassOpen(false);
    scheduleCatalogRefresh();
    broadcastUpdate("catalog");
  };

  const handleCreateMergeRequest = () => {
    if (!canSubmitMergeRequest) return;
    let newRequest: MergeRequest | null = null;
    if (mergeCategory === "university" && mergeUniversitySourceId && mergeUniversityTargetId) {
      newRequest = {
        id: createLocalId(),
        type: "university",
        sourceId: mergeUniversitySourceId,
        targetId: mergeUniversityTargetId,
        likes: 1,
        dislikes: 0,
        minConsensusLikes: MERGE_CONSENSUS_MIN,
        approved: false,
        createdAt: new Date().toISOString(),
        expiresAt: mergeProposalExpiry(),
        reason: mergeReason.trim() || "Community merge request"
      };
    } else if (
      mergeCategory === "class" &&
      mergeClassUniversityId &&
      mergeClassSourceId &&
      mergeClassTargetId
    ) {
      newRequest = {
        id: createLocalId(),
        type: "class",
        sourceId: mergeClassSourceId,
        targetId: mergeClassTargetId,
        universityId: mergeClassUniversityId,
        likes: 1,
        dislikes: 0,
        minConsensusLikes: MERGE_CONSENSUS_MIN,
        approved: false,
        createdAt: new Date().toISOString(),
        expiresAt: mergeProposalExpiry(),
        reason: mergeReason.trim() || "Courses appear duplicated"
      };
    }
    if (!newRequest) return;
    setMergeRequests((prev) => [...prev, newRequest]);
    setMergeVoteHistory((prev) => ({ ...prev, [newRequest!.id]: "like" }));
    setMergeReason("");
    setMergeUniversitySourceId("");
    setMergeUniversityTargetId("");
    setMergeClassUniversityId("");
    setMergeClassSourceId("");
    setMergeClassTargetId("");
    setIsMergeModalOpen(false);
  };

  const applyMergeRequest = useCallback(
    (request: MergeRequest) => {
      if (request.type === "university") {
        setCatalog((prev) => {
          const source = prev.find((uni) => uni.id === request.sourceId);
          const target = prev.find((uni) => uni.id === request.targetId);
          if (!source || !target) return prev;
          const merged = mergeUniversityRecords(target, source);
          return prev
            .filter((uni) => uni.id !== request.sourceId)
            .map((uni) => (uni.id === request.targetId ? merged : uni));
        });
        if (selectedUniversityId === request.sourceId) {
          setSelectedUniversityId(request.targetId);
          setSelectedClassId("");
        }
      } else if (request.type === "class" && request.universityId) {
        setCatalog((prev) =>
          prev.map((uni) => {
            if (uni.id !== request.universityId) return uni;
            const sourceIndex = uni.classes.findIndex((cls) => cls.id === request.sourceId);
            const targetIndex = uni.classes.findIndex((cls) => cls.id === request.targetId);
            if (sourceIndex === -1 || targetIndex === -1) return uni;
            const mergedClass = mergeClassTopic(uni.classes[targetIndex], uni.classes[sourceIndex]);
            const nextClasses = uni.classes
              .filter((cls) => cls.id !== request.sourceId)
              .map((cls) => (cls.id === request.targetId ? mergedClass : cls));
            return {
              ...uni,
              classes: nextClasses
            };
          })
        );
        if (selectedClassId === request.sourceId) {
          setSelectedClassId(request.targetId);
        }
      }
      clearOpenTabs();
    },
    [clearOpenTabs, selectedClassId, selectedUniversityId]
  );

  useEffect(() => {
    setMergeRequests((prev) => {
      const nowTs = Date.now();
      const next: MergeRequest[] = [];
      prev.forEach((request) => {
        const approved = request.approved || request.likes >= request.minConsensusLikes;
        const expired = new Date(request.expiresAt).getTime() <= nowTs;
        if (approved) {
          applyMergeRequest(request);
        } else if (!expired) {
          next.push(request);
        }
      });
      return next;
    });
  }, [applyMergeRequest]);

  const handleMergeRequestVote = (requestId: string, type: "like" | "dislike") => {
    const previousVote = mergeVoteHistory[requestId];
    const togglingOff = previousVote === type;
    const nextVote: "like" | "dislike" | undefined = togglingOff ? undefined : type;

    setMergeVoteHistory((prev) => {
      const nextHistory = { ...prev };
      if (togglingOff) {
        delete nextHistory[requestId];
      } else {
        nextHistory[requestId] = type;
      }
      return nextHistory;
    });

    setMergeRequests((requests) =>
      requests.map((request) => {
        if (request.id !== requestId || request.approved) return request;
        let likes = request.likes;
        let dislikes = request.dislikes;
        if (previousVote === "like") likes = Math.max(0, likes - 1);
        if (previousVote === "dislike") dislikes = Math.max(0, dislikes - 1);
        if (nextVote === "like") likes += 1;
        if (nextVote === "dislike") dislikes += 1;
        return {
          ...request,
          likes,
          dislikes,
          approved: likes >= request.minConsensusLikes
        };
      })
    );
  };

  const handleFieldChangeVote = (requestId: string, type: "like" | "dislike") => {
    const previousVote = fieldChangeVoteHistory[requestId];
    const togglingOff = previousVote === type;
    const nextVote: "like" | "dislike" | undefined = togglingOff ? undefined : type;

    setFieldChangeVoteHistory((prev) => {
      const nextHistory = { ...prev };
      if (togglingOff) {
        delete nextHistory[requestId];
      } else {
        nextHistory[requestId] = type;
      }
      return nextHistory;
    });

    setFieldChangeRequests((requests) =>
      requests.map((request) => {
        if (request.id !== requestId || request.approved) return request;
        const approval = applyCountApprovalVote(
          {
            likes: request.likes,
            dislikes: request.dislikes,
            minConsensusLikes: request.minConsensusLikes,
            approved: request.approved,
            createdAt: request.createdAt,
            expiresAt: request.expiresAt
          },
          previousVote,
          nextVote,
          request.minConsensusLikes
        );
        return {
          ...request,
          likes: approval.likes,
          dislikes: approval.dislikes,
          approved: approval.approved
        };
      })
    );
  };

  const handleFieldChangeSubmit = () => {
    if (!selectedUniversity || !fieldProposalValue.trim()) return;
    const request: FieldChangeRequest = {
      id: createLocalId(),
      entityType: "university",
      entityId: selectedUniversity.id,
      field: fieldProposalField,
      proposedValue: fieldProposalValue.trim(),
      likes: 1,
      dislikes: 0,
      minConsensusLikes: FIELD_CONSENSUS_MIN,
      approved: false,
      createdAt: new Date().toISOString(),
      expiresAt: fieldProposalExpiry(),
      reason: fieldProposalReason.trim() || "Community update"
    };
    setFieldChangeRequests((prev) => [...prev, request]);
    setFieldChangeVoteHistory((prev) => ({ ...prev, [request.id]: "like" }));
    setFieldProposalValue("");
    setFieldProposalReason("");
    setIsFieldReviewOpen(true);
  };

  const applyFieldChangeRequest = useCallback(
    (request: FieldChangeRequest) => {
      if (request.entityType === "university") {
        setCatalog((prev) =>
          prev.map((uni) => {
            if (uni.id !== request.entityId) return uni;
            return {
              ...uni,
              [request.field]: request.proposedValue
            };
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    setFieldChangeRequests((prev) => {
      const nowTs = Date.now();
      const next: FieldChangeRequest[] = [];
      prev.forEach((request) => {
        const approved = request.approved || request.likes >= request.minConsensusLikes;
        const expired = new Date(request.expiresAt).getTime() <= nowTs;
        if (approved) {
          applyFieldChangeRequest(request);
        } else if (!expired) {
          next.push(request);
        }
      });
      return next;
    });
  }, [applyFieldChangeRequest]);

  const handleAddUniversity = async () => {
    const name = newUniversityName.trim();
    const location = newUniversityLocation.trim();
    if (!name) return;
    const code =
      newUniversityCode.trim().toUpperCase() ||
      name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 4)
        .toUpperCase() ||
      "CAMP";
    const motto = newUniversityMotto.trim() || "Community submitted campus";
    const palette = pickCampusPalette();
    const approvalSeed: University["approval"] = {
      likes: 0,
      dislikes: 0,
      ratioTarget: UNIVERSITY_APPROVAL_RATIO,
      approved: false,
      createdAt: new Date().toISOString(),
      expiresAt: proposalExpiry()
    };

    setCatalogError(null);
    const result = await createRemoteUniversity({
      name,
      location,
      code,
      motto,
      colors: palette,
      approval: approvalSeed
    });

    if (!result.university || result.error) {
      setCatalogError(explainSupabaseError(result.error));
      return;
    }

    const createdUniversity = result.university;

    setCatalog((prev) => {
      const exists = prev.some((uni) => uni.id === createdUniversity.id);
      if (exists) {
        return prev.map((uni) => (uni.id === createdUniversity.id ? createdUniversity : uni));
      }
      return [...prev, createdUniversity];
    });
    setNewUniversityName("");
    setNewUniversityLocation("");
    setNewUniversityCode("");
    setNewUniversityMotto("");
    setSelectedUniversityId(createdUniversity.id);
    setSelectedClassId("");
    setActiveTab("general");
    clearOpenTabs();
    setIsAddUniversityOpen(false);
    scheduleCatalogRefresh();
    broadcastUpdate("catalog");
  };

  const handleCommentSubmit = async () => {
    if (!selectedPostRef || !activePost || !commentDraft.trim()) return;

    const content = commentDraft.trim();
    const alias = commentAnon ? anonAlias : "You";
    const newComment = {
      id: createLocalId(),
      author: alias,
      createdAt: new Date().toISOString(),
      content
    };
    const remoteMeta = remotePostMeta[selectedPostRef.postId];
    const isRemote =
      remoteMeta &&
      remoteMeta.context === selectedPostRef.context &&
      (selectedPostRef.context !== "lecture" || remoteMeta.lectureDate === selectedPostRef.date);

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

    if (isRemote && deviceId) {
      const result = await createRemoteComment({
        postId: selectedPostRef.postId,
        deviceId,
        author: alias,
        content
      });
      if (result.error) {
        setRemoteError(result.error);
      } else {
        setRemoteError(null);
        scheduleRemoteRefresh();
        broadcastUpdate("posts");
      }
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

  const generalPosts = useMemo(() => {
    if (!selectedClass) return [];
    const remote = remotePosts[selectedClass.id] ?? [];
    return [...remote, ...selectedClass.generalPosts];
  }, [remotePosts, selectedClass]);

  const sortedGeneralPosts = useMemo(() => {
    if (!selectedClass) return [];
    return [...generalPosts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [generalPosts, selectedClass]);

  const canSubmitUniversity = Boolean(newUniversityName.trim());
  const selectedUniversityPending = Boolean(selectedUniversity && !selectedUniversity.approval.approved);
  const pendingUniversityMeta =
    selectedUniversityPending && selectedUniversity
      ? {
          ...describeApprovalProgress(selectedUniversity.approval),
          expiresLabel: formatDistanceToNow(new Date(selectedUniversity.approval.expiresAt), {
            addSuffix: true
          })
        }
      : null;
  const canSubmitClass =
    Boolean(newClassName.trim()) &&
    Boolean(newClassCode.trim()) &&
    Boolean(selectedUniversity);
  const canSubmitMergeRequest =
    mergeCategory === "university"
      ? Boolean(mergeUniversitySourceId && mergeUniversityTargetId && mergeUniversitySourceId !== mergeUniversityTargetId)
      : Boolean(
          mergeClassUniversityId &&
            mergeClassSourceId &&
            mergeClassTargetId &&
            mergeClassSourceId !== mergeClassTargetId
        );

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
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Campuses and classes only go live when at least {APPROVAL_RATIO_PERCENT}% of votes are positive. Holds count as downvotes, so the crowd can veto bad info.
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
        {catalogError && (
          <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {catalogError}
          </div>
        )}
        {isCatalogLoading && (
          <div className="mb-4 rounded-2xl border border-dashed border-ink-100 bg-ink-50/60 px-4 py-2 text-xs font-semibold text-ink-500">
            Syncing campuses from Supabase...
          </div>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
                <p className="text-sm font-semibold uppercase tracking-tight text-ink-500">Campus directory</p>
                <p className="text-sm text-ink-500">Pick your school and course code to open its class boards.</p>
              </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campus or code"
              className="w-full rounded-2xl border border-ink-100 bg-white px-10 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsAddUniversityOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-400"
          >
            <Plus className="h-4 w-4" />
            Add campus
          </button>
          <button
            type="button"
            onClick={() => setIsMergeModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-400"
          >
            <GitMerge className="h-4 w-4" />
            Merge request
          </button>
        </div>
        </div>
        <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
          {filteredUniversities.length ? (
            filteredUniversities.map((uni) => {
              const isActive = uni.id === selectedUniversity?.id;
              const pending = !uni.approval.approved;
              const approvalProgress = describeApprovalProgress(uni.approval);
              const expiresLabel = formatDistanceToNow(new Date(uni.approval.expiresAt), { addSuffix: true });
              const uniVote = universityVoteHistory[uni.id];
              const voteButtonClasses = (activeState: boolean) =>
                clsx(
                  "flex-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                  isActive
                    ? activeState
                      ? "border-white bg-white/20 text-white"
                      : "border-white/40 text-white hover:border-white/60"
                    : activeState
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 text-ink-700 hover:border-ink-400"
                );
              return (
                <div
                  key={uni.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedUniversityId(uni.id);
                    clearOpenTabs();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedUniversityId(uni.id);
                      clearOpenTabs();
                    }
                  }}
                  className={clsx(
                    "min-w-[260px] shrink-0 rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-ink-200",
                    isActive ? "border-ink-900 bg-ink-900 text-white shadow-md" : "border-ink-200 bg-white hover:border-ink-300"
                  )}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{uni.name}</span>
                    <span
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs",
                        isActive ? "bg-white/20 text-white" : "bg-ink-100 text-ink-700"
                      )}
                    >
                      {uni.code}
                    </span>
                  </div>
                  <p className={clsx("mt-1 text-xs", isActive ? "text-white/80" : "text-ink-500")}>{uni.location}</p>
                  <p className={clsx("mt-2 text-[11px] uppercase tracking-wide", isActive ? "text-white/60" : "text-ink-400")}>
                    {uni.motto}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-wide">
                    <span className={pending ? "text-amber-300" : "text-emerald-200"}>
                      {pending ? "Pending consensus" : "Approved campus"}
                    </span>
                    <span className={isActive ? "text-white/60" : "text-ink-400"}>
                      {pending ? `Expires ${expiresLabel}` : "Live"}
                    </span>
                  </div>
                  <div
                    className={clsx(
                      "mt-2 rounded-2xl border px-3 py-2 text-xs",
                      pending
                        ? isActive
                          ? "border-white/40 bg-white/10 text-white"
                          : "border-amber-100 bg-amber-50 text-amber-800"
                        : isActive
                        ? "border-emerald-200 bg-white/10 text-white"
                        : "border-emerald-100 bg-emerald-50 text-emerald-800"
                    )}
                  >
                    <p className="font-semibold">{approvalRequirementCopy(uni.approval)}</p>
                    <p className="mt-0.5 text-[11px]">
                      Current pulse: {approvalProgress.ratioDescription}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUniversityVote(uni.id, "like");
                        }}
                        aria-pressed={uniVote === "like"}
                        className={voteButtonClasses(uniVote === "like")}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>{uni.approval.likes}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUniversityVote(uni.id, "dislike");
                        }}
                        aria-pressed={uniVote === "dislike"}
                        className={voteButtonClasses(uniVote === "dislike")}
                      >
                        <Flag className="h-3.5 w-3.5" />
                        <span>{uni.approval.dislikes}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-ink-400">No universities found. Try another keyword.</p>
          )}
        </div>
        {mergeRequests.length > 0 && (
          <div className="mt-4 glass-panel bg-white/90 p-4">
            <p className="text-sm font-semibold text-ink-800">Merge votes in progress</p>
            <div className="mt-3 space-y-3">
              {mergeRequests.map((request) => {
                const vote = mergeVoteHistory[request.id];
                const isUniversity = request.type === "university";
                const remaining = Math.max(request.minConsensusLikes - request.likes, 0);
                const expiresLabel = formatDistanceToNow(new Date(request.expiresAt), { addSuffix: true });
                const sourceLabel = isUniversity
                  ? universityLookup.get(request.sourceId)?.name ?? "Unknown campus"
                  : (() => {
                    const info = classLookup.get(request.sourceId);
                    if (!info) return "Unknown course";
                    return `${info.cls.code} — ${info.cls.name}`;
                  })();
                const targetLabel = isUniversity
                  ? universityLookup.get(request.targetId)?.name ?? "Unknown campus"
                  : (() => {
                      const info = classLookup.get(request.targetId);
                      if (!info) return "Unknown course";
                      return `${info.cls.code} — ${info.cls.name}`;
                    })();
                const targetCampus =
                  !isUniversity && request.universityId
                    ? universityLookup.get(request.universityId)?.name
                    : undefined;
                return (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-ink-100 bg-white/70 p-3 text-sm text-ink-700"
                  >
                    <p className="font-semibold">
                      Merge {sourceLabel} ? {targetLabel}
                    </p>
                    {targetCampus && (
                      <p className="text-xs text-ink-500">{targetCampus}</p>
                    )}
                    <p className="mt-1 text-xs text-ink-500">
                      Needs {remaining} approvals · Expires {expiresLabel}
                    </p>
                    <p className="mt-1 text-xs text-ink-500 italic">
                      {request.reason}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleMergeRequestVote(request.id, "like")}
                        aria-pressed={vote === "like"}
                        className={clsx(
                          "flex-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                          vote === "like"
                            ? "border-ink-900 bg-ink-900 text-white"
                            : "border-ink-200 text-ink-700 hover:border-ink-400"
                        )}
                      >
                        Approve · {request.likes}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMergeRequestVote(request.id, "dislike")}
                        aria-pressed={vote === "dislike"}
                        className={clsx(
                          "flex-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                          vote === "dislike"
                            ? "border-rose-500 bg-rose-500/10 text-rose-700"
                            : "border-rose-200 text-rose-600 hover:border-rose-400"
                        )}
                      >
                        Hold · {request.dislikes}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-6">
          <div className="glass-panel p-6">
            <div className="grid gap-3 md:grid-cols-2">
              {classList.map((cls) => {
                const isActive = cls.id === selectedClass?.id;
                const pending = !cls.approval.approved;
                const classVote = classVoteHistory[cls.id];
                const classApproval = describeApprovalProgress(cls.approval);
                return (
                  <div
                    key={cls.id}
                    className={clsx(
                      "rounded-2xl border p-4 transition",
                      isActive ? "border-ink-900 bg-ink-900/5 shadow-md" : "border-ink-100 bg-white"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClassId(cls.id);
                        clearOpenTabs();
                      }}
                      className={clsx(
                        "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition",
                        isActive ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-700 hover:border-ink-300"
                      )}
                    >
                      <span>{cls.code}</span>
                      <span className="text-xs uppercase tracking-wide">
                        {pending ? "Pending" : "Approved"}
                      </span>
                    </button>
                    <p className="mt-2 text-sm font-semibold text-ink-900">{cls.name}</p>
                    <p className="text-xs text-ink-500">{cls.instructor}</p>
                      <div
                        className={clsx(
                          "mt-3 rounded-2xl border px-3 py-2 text-xs",
                          pending
                            ? "border-amber-100 bg-amber-50 text-amber-800"
                          : "border-emerald-100 bg-emerald-50 text-emerald-800"
                      )}
                    >
                      <p className="font-semibold">
                        {approvalRequirementCopy(cls.approval)}
                      </p>
                      <p className="mt-0.5 text-[11px]">
                        Current pulse: {classApproval.ratioDescription}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleClassVote(cls.id, "like")}
                          aria-pressed={classVote === "like"}
                          className={clsx(
                            "flex-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition",
                            classVote === "like"
                              ? pending
                                ? "border-amber-500 bg-white text-amber-900"
                                : "border-emerald-500 bg-white text-emerald-900"
                              : pending
                              ? "border-amber-300 text-amber-800 hover:border-amber-500"
                              : "border-emerald-300 text-emerald-800 hover:border-emerald-500"
                          )}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          <span>{cls.approval.likes}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClassVote(cls.id, "dislike")}
                          aria-pressed={classVote === "dislike"}
                          className={clsx(
                            "flex-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition",
                            classVote === "dislike"
                              ? "border-rose-500 bg-white text-rose-900"
                              : "border-rose-200 text-rose-700 hover:border-rose-500"
                          )}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          <span>{cls.approval.dislikes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedUniversity && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddClassOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-ink-300 px-4 py-1 text-sm font-medium text-ink-700 hover:border-ink-500"
                >
                  <Plus className="h-4 w-4" />
                  Add course proposal
                </button>
              </div>
            )}
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
            {selectedUniversity && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-500">
                <MapPin className="h-4 w-4" />
                <span>{selectedUniversity.location || "Location not set"}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFieldProposalField("location");
                    setIsFieldReviewOpen(true);
                  }}
                  className="flex items-center gap-1 rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-700 transition hover:border-ink-400"
                >
                  <AlertCircle className={clsx("h-3.5 w-3.5", selectedUniversityFieldRequests.length ? "text-amber-500" : "text-ink-400")} />
                  {selectedUniversityFieldRequests.length
                    ? `${selectedUniversityFieldRequests.length} update${selectedUniversityFieldRequests.length > 1 ? "s" : ""} pending`
                    : "Suggest update"}
                </button>
              </div>
            )}
            {selectedUniversityPending && pendingUniversityMeta && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <p className="font-semibold">Campus proposal pending</p>
                <p>
                  Needs {pendingUniversityMeta.targetPercent}% positive votes (current:{" "}
                  {pendingUniversityMeta.ratioDescription}) · Expires {pendingUniversityMeta.expiresLabel}
                </p>
              </div>
            )}
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
                onClick={async () => {
                  if (!selectedClass || !selectedUniversity) return;
                  if (!newPostTitle.trim() || !newPostBody.trim()) return;
                  const tags = newPostTags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean);
                  const author = newPostAnon ? generateAlias() : "You";
                  setIsRemoteMutating(true);
                  const result = await createRemotePost({
                    classId: selectedClass.id,
                    context: "general",
                    title: newPostTitle.trim(),
                    body: newPostBody.trim(),
                    tags,
                    author,
                    minConsensusLikes: 15,
                    expiresAt: defaultExpiration()
                  });
                  setIsRemoteMutating(false);
                  if (result.error || !result.post) {
                    setRemoteError(result.error ?? "Unable to publish thread.");
                    return;
                  }
                  const createdPost = result.post;
                  setRemoteError(null);
                  setRemotePosts((prev) => {
                    const existing = prev[selectedClass.id] ?? [];
                    const filtered = existing.filter((post): post is Post => Boolean(post));
                    const nextPosts: Post[] = [createdPost, ...filtered];
                    return {
                      ...prev,
                      [selectedClass.id]: nextPosts
                    };
                  });
                  setRemotePostMeta((prev) => ({
                    ...prev,
                    [createdPost.id]: { classId: selectedClass.id, context: "general" }
                  }));
                  setNewPostTitle("");
                  setNewPostBody("");
                  setNewPostTags("");
                  setNewPostAnon(true);
                  scheduleRemoteRefresh();
                  broadcastUpdate("posts");
                }}
                disabled={!newPostTitle.trim() || !newPostBody.trim() || isRemoteMutating}
                className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink-200"
              >
                Share thread
              </button>
            </div>
            <p className="text-xs text-ink-500">
              Consensus needs 15 likes (10% of active readers) within 30 days for permanent storage. Threads below the line expire automatically.
            </p>
            {remoteError && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                {remoteError}
              </p>
            )}
          </div>
          {activeTab === "general" && (
            <div className="space-y-4">
              {(isRemoteLoading || isRemoteMutating) && (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 px-4 py-3 text-xs font-semibold text-ink-500">
                  {isRemoteMutating ? "Saving to Supabase..." : "Loading Supabase threads..."}
                </div>
              )}
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

      {isAddUniversityOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4">
          <div className="mx-auto flex h-full max-w-lg flex-col rounded-3xl bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-800">Submit a campus</p>
                <p className="text-xs text-ink-500">
                  Needs {APPROVAL_RATIO_PERCENT}% positive votes within 30 days.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUniversityOpen(false)}
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:border-ink-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={newUniversityName}
                onChange={(event) => setNewUniversityName(event.target.value)}
                placeholder="University name"
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <input
                value={newUniversityLocation}
                onChange={(event) => setNewUniversityLocation(event.target.value)}
                placeholder="City, State (optional)"
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={newUniversityCode}
                  onChange={(event) => setNewUniversityCode(event.target.value)}
                  placeholder="Short code (optional)"
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
                <input
                  value={newUniversityMotto}
                  onChange={(event) => setNewUniversityMotto(event.target.value)}
                  placeholder="Motto or tagline (optional)"
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
              </div>
              <button
                type="button"
                onClick={handleAddUniversity}
                disabled={!canSubmitUniversity}
                className="rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-ink-200"
              >
                Submit campus
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddClassOpen && selectedUniversity && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4">
          <div className="mx-auto flex h-full max-w-lg flex-col rounded-3xl bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-800">Add a course for {selectedUniversity.name}</p>
                <p className="text-xs text-ink-500">
                  Needs {APPROVAL_RATIO_PERCENT}% positive votes before expiring.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddClassOpen(false)}
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:border-ink-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <input
                value={newClassName}
                onChange={(event) => setNewClassName(event.target.value)}
                placeholder="Course name"
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={newClassCode}
                  onChange={(event) => setNewClassCode(event.target.value)}
                  placeholder="Course code"
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
                <input
                  value={newClassInstructor}
                  onChange={(event) => setNewClassInstructor(event.target.value)}
                  placeholder="Instructor (optional)"
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
              </div>
              <input
                value={newClassMeetingPattern}
                onChange={(event) => setNewClassMeetingPattern(event.target.value)}
                placeholder="Meeting pattern (optional)"
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <textarea
                value={newClassSummary}
                onChange={(event) => setNewClassSummary(event.target.value)}
                placeholder="Short description"
                rows={3}
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <button
                type="button"
                onClick={handleAddClass}
                disabled={!canSubmitClass}
                className="rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-ink-200"
              >
                Submit course
              </button>
            </div>
          </div>
        </div>
      )}

      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4">
          <div className="mx-auto flex h-full max-w-2xl flex-col rounded-3xl bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-800">Request a merge</p>
                <p className="text-xs text-ink-500">
                  Needs {MERGE_CONSENSUS_MIN}+ approvals before applying.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:border-ink-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              {(["university", "class"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMergeCategory(option)}
                  className={clsx(
                    "flex-1 rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                    mergeCategory === option ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:border-ink-400"
                  )}
                >
                  {option === "university" ? "Campuses" : "Courses"}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {mergeCategory === "university" ? (
                <>
                  <select
                    value={mergeUniversitySourceId}
                    onChange={(event) => setMergeUniversitySourceId(event.target.value)}
                    className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                  >
                    <option value="">Duplicate campus...</option>
                    {catalog.map((uni) => (
                      <option key={`dup-${uni.id}`} value={uni.id}>
                        {uni.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mergeUniversityTargetId}
                    onChange={(event) => setMergeUniversityTargetId(event.target.value)}
                    className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                  >
                    <option value="">Keep data under...</option>
                    {catalog.map((uni) => (
                      <option key={`keep-${uni.id}`} value={uni.id}>
                        {uni.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <select
                    value={mergeClassUniversityId}
                    onChange={(event) => {
                      setMergeClassUniversityId(event.target.value);
                      setMergeClassSourceId("");
                      setMergeClassTargetId("");
                    }}
                    className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                  >
                    <option value="">Campus containing both courses...</option>
                    {catalog.map((uni) => (
                      <option key={`class-uni-${uni.id}`} value={uni.id}>
                        {uni.name}
                      </option>
                    ))}
                  </select>
                  {mergeClassUniversityId && (
                    <>
                      <select
                        value={mergeClassSourceId}
                        onChange={(event) => setMergeClassSourceId(event.target.value)}
                        className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                      >
                        <option value="">Duplicate course...</option>
                        {mergeClassOptions.map((cls) => (
                          <option key={`dup-class-${cls.id}`} value={cls.id}>
                            {cls.code} — {cls.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={mergeClassTargetId}
                        onChange={(event) => setMergeClassTargetId(event.target.value)}
                        className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                      >
                        <option value="">Keep data under...</option>
                        {mergeClassOptions.map((cls) => (
                          <option key={`keep-class-${cls.id}`} value={cls.id}>
                            {cls.code} — {cls.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}
              <textarea
                value={mergeReason}
                onChange={(event) => setMergeReason(event.target.value)}
                placeholder="Why should these be merged?"
                rows={3}
                className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
              />
              <button
                type="button"
                onClick={handleCreateMergeRequest}
                disabled={!canSubmitMergeRequest}
                className="rounded-2xl border border-dashed border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 transition enabled:hover:border-ink-500 disabled:cursor-not-allowed disabled:text-ink-300"
              >
                Request merge review
              </button>
            </div>
          </div>
        </div>
      )}

      {isFieldReviewOpen && selectedUniversity && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4">
          <div className="mx-auto flex h-full max-w-2xl flex-col rounded-3xl bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink-800">
                  Campus updates — {selectedUniversity.name}
                </p>
                <p className="text-xs text-ink-500">
                  Each change needs {FIELD_CONSENSUS_MIN} approvals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFieldReviewOpen(false)}
                className="rounded-full border border-ink-200 p-2 text-ink-500 hover:border-ink-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
              {selectedUniversityFieldRequests.length ? (
                selectedUniversityFieldRequests.map((request) => {
                  const vote = fieldChangeVoteHistory[request.id];
                  const remaining = Math.max(request.minConsensusLikes - request.likes, 0);
                  const expiresLabel = formatDistanceToNow(new Date(request.expiresAt), { addSuffix: true });
                  return (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-ink-100 bg-white/80 p-3 text-sm text-ink-700"
                    >
                      <p className="font-semibold capitalize">{request.field}</p>
                      <p className="text-xs text-ink-500">Proposed: {request.proposedValue}</p>
                      <p className="text-xs text-ink-500 italic">{request.reason}</p>
                      <p className="mt-1 text-xs text-ink-500">
                        Needs {remaining} approvals · Expires {expiresLabel}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleFieldChangeVote(request.id, "like")}
                          aria-pressed={vote === "like"}
                          className={clsx(
                            "flex-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                            vote === "like"
                              ? "border-ink-900 bg-ink-900 text-white"
                              : "border-ink-200 text-ink-700 hover:border-ink-400"
                          )}
                        >
                          Approve · {request.likes}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFieldChangeVote(request.id, "dislike")}
                          aria-pressed={vote === "dislike"}
                          className={clsx(
                            "flex-1 rounded-full border px-3 py-1 text-xs font-semibold transition",
                            vote === "dislike"
                              ? "border-rose-500 bg-rose-500/10 text-rose-700"
                              : "border-rose-200 text-rose-600 hover:border-rose-400"
                          )}
                        >
                          Hold · {request.dislikes}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-4 text-sm text-ink-500">
                  No updates pending. Share a suggestion below.
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-ink-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Suggest an update</p>
              <div className="mt-2 grid gap-3">
                <select
                  value={fieldProposalField}
                  onChange={(event) => setFieldProposalField(event.target.value)}
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                >
                  <option value="location">Campus location</option>
                  <option value="motto">Campus motto</option>
                </select>
                <input
                  value={fieldProposalValue}
                  onChange={(event) => setFieldProposalValue(event.target.value)}
                  placeholder="Proposed value"
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
                <textarea
                  value={fieldProposalReason}
                  onChange={(event) => setFieldProposalReason(event.target.value)}
                  placeholder="Why is this better?"
                  rows={2}
                  className="rounded-2xl border border-ink-100 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-ink-50"
                />
                <button
                  type="button"
                  onClick={handleFieldChangeSubmit}
                  disabled={!fieldProposalValue.trim()}
                  className="rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-ink-200"
                >
                  Submit update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
type CountApprovalState = {
  likes: number;
  dislikes: number;
  minConsensusLikes: number;
  approved: boolean;
  createdAt: string;
  expiresAt: string;
};

const applyRatioApprovalVote = (
  approval: ApprovalState,
  previousVote: "like" | "dislike" | undefined,
  nextVote: "like" | "dislike" | undefined,
  ratioOverride?: number
) => {
  let likes = approval.likes;
  let dislikes = approval.dislikes;

  if (previousVote === "like") likes = Math.max(0, likes - 1);
  if (previousVote === "dislike") dislikes = Math.max(0, dislikes - 1);
  if (nextVote === "like") likes += 1;
  if (nextVote === "dislike") dislikes += 1;

  const ratioTarget = ratioOverride ?? approval.ratioTarget;

  const meets = meetsApprovalRatio(likes, dislikes, ratioTarget);

  return {
    ...approval,
    likes,
    dislikes,
    ratioTarget,
    approved: meets
  };
};

const applyCountApprovalVote = (
  approval: CountApprovalState,
  previousVote: "like" | "dislike" | undefined,
  nextVote: "like" | "dislike" | undefined,
  minOverride?: number
) => {
  let likes = approval.likes;
  let dislikes = approval.dislikes;

  if (previousVote === "like") likes = Math.max(0, likes - 1);
  if (previousVote === "dislike") dislikes = Math.max(0, dislikes - 1);
  if (nextVote === "like") likes += 1;
  if (nextVote === "dislike") dislikes += 1;

  const minConsensus = minOverride ?? approval.minConsensusLikes;

  return {
    ...approval,
    likes,
    dislikes,
    minConsensusLikes: minConsensus,
    approved: approval.approved || likes >= minConsensus
  };
};

