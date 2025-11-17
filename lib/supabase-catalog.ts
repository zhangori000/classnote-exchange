import type { University, ClassTopic, ApprovalState } from "@/lib/sample-data";

import { getSupabaseBrowserClient } from "./supabase-browser";

const UNIVERSITY_CONSENSUS_MIN = 30;
const CLASS_CONSENSUS_MIN = 20;

const defaultExpiration = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

const buildApproval = (min: number): ApprovalState => ({
  likes: 0,
  dislikes: 0,
  minConsensusLikes: min,
  approved: false,
  createdAt: new Date().toISOString(),
  expiresAt: defaultExpiration()
});

type ClassRow = {
  id: string;
  name: string | null;
  code: string | null;
  instructor: string | null;
  summary: string | null;
  meeting_pattern: string | null;
};

type UniversityRow = {
  id: string;
  name: string;
  location: string | null;
  code: string | null;
  motto: string | null;
  color_primary: string | null;
  color_accent: string | null;
  classes?: ClassRow[] | null;
};

const mapClass = (row: ClassRow): ClassTopic => ({
  id: row.id,
  name: row.name ?? "Untitled class",
  code: row.code ?? "",
  instructor: row.instructor ?? "",
  summary: row.summary ?? "Course details coming soon.",
  meetingPattern: row.meeting_pattern ?? "",
  generalPosts: [],
  lectureSchedule: [],
  approval: buildApproval(CLASS_CONSENSUS_MIN)
});

const mapUniversity = (row: UniversityRow): University => {
  const approval = buildApproval(UNIVERSITY_CONSENSUS_MIN);
  const code = (row.code ?? "").toUpperCase();
  if (code === "GOTU") {
    approval.likes = approval.minConsensusLikes;
    approval.approved = true;
  } else if (code === "BTCU") {
    approval.likes = Math.floor(approval.minConsensusLikes / 3);
    approval.approved = false;
  }

  return {
    id: row.id,
    name: row.name,
    location: row.location ?? "",
    code: row.code ?? "",
    motto: row.motto ?? "",
    colors: {
      primary: row.color_primary ?? "#0f172a",
      accent: row.color_accent ?? "#f97316"
    },
    classes: (row.classes ?? []).map(mapClass),
    approval
  };
};

export const fetchSupabaseCatalog = async (): Promise<{
  universities: University[];
  error?: string;
}> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("universities")
      .select(
        `
        id,
        name,
        location,
        code,
        motto,
        color_primary,
        color_accent,
        classes:classes (
          id,
          name,
          code,
          instructor,
          summary,
          meeting_pattern
        )
      `
      )
      .order("name", { ascending: true });

    if (error) {
      return { universities: [], error: error.message };
    }

    return {
      universities: (data ?? []).map(mapUniversity)
    };
  } catch (err) {
    return {
      universities: [],
      error: err instanceof Error ? err.message : "Unable to reach Supabase."
    };
  }
};
