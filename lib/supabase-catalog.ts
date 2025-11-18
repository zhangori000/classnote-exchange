import type { University, ClassTopic, ApprovalState } from "@/lib/sample-data";

import { getSupabaseBrowserClient } from "./supabase-browser";

const APPROVAL_RATIO_TARGET = 0.9;
const UNIVERSITY_APPROVAL_RATIO = APPROVAL_RATIO_TARGET;
const CLASS_APPROVAL_RATIO = APPROVAL_RATIO_TARGET;

const defaultExpiration = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

type ClassRow = {
  id: string;
  name: string | null;
  code: string | null;
  instructor: string | null;
  summary: string | null;
  meeting_pattern: string | null;
  approval_likes: number | null;
  approval_dislikes: number | null;
  approval_min_consensus: number | null;
  approval_approved: boolean | null;
  approval_created_at: string | null;
  approval_expires_at: string | null;
};

type UniversityRow = {
  id: string;
  name: string;
  location: string | null;
  code: string | null;
  motto: string | null;
  color_primary: string | null;
  color_accent: string | null;
  approval_likes: number | null;
  approval_dislikes: number | null;
  approval_min_consensus: number | null;
  approval_approved: boolean | null;
  approval_created_at: string | null;
  approval_expires_at: string | null;
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
  approval: {
    likes: row.approval_likes ?? 0,
    dislikes: row.approval_dislikes ?? 0,
    ratioTarget: CLASS_APPROVAL_RATIO,
    approved: row.approval_approved ?? false,
    createdAt: row.approval_created_at ?? defaultExpiration(),
    expiresAt: row.approval_expires_at ?? defaultExpiration()
  }
});

const mapUniversity = (row: UniversityRow): University => ({
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
  approval: {
    likes: row.approval_likes ?? 0,
    dislikes: row.approval_dislikes ?? 0,
    ratioTarget: UNIVERSITY_APPROVAL_RATIO,
    approved: row.approval_approved ?? false,
    createdAt: row.approval_created_at ?? defaultExpiration(),
    expiresAt: row.approval_expires_at ?? defaultExpiration()
  }
});

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
        approval_likes,
        approval_dislikes,
        approval_min_consensus,
        approval_approved,
        approval_created_at,
        approval_expires_at,
        classes:classes (
          id,
          name,
          code,
          instructor,
          summary,
          meeting_pattern,
          approval_likes,
          approval_dislikes,
          approval_min_consensus,
          approval_approved,
          approval_created_at,
          approval_expires_at
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

type CreateUniversityPayload = {
  name: string;
  location: string;
  code: string;
  motto: string;
  colors: { primary: string; accent: string };
  approval: ApprovalState;
};

export const createRemoteUniversity = async (payload: CreateUniversityPayload): Promise<{
  university?: University;
  error?: string;
}> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("universities")
      .insert({
        name: payload.name,
        location: payload.location,
        code: payload.code,
        motto: payload.motto,
        color_primary: payload.colors.primary,
        color_accent: payload.colors.accent,
        approval_likes: payload.approval.likes,
        approval_dislikes: payload.approval.dislikes,
        approval_approved: payload.approval.approved,
        approval_created_at: payload.approval.createdAt,
        approval_expires_at: payload.approval.expiresAt
      })
      .select(
        `
        id,
        name,
        location,
        code,
        motto,
        color_primary,
        color_accent,
        approval_likes,
        approval_dislikes,
        approval_min_consensus,
        approval_approved,
        approval_created_at,
        approval_expires_at
      `
      )
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to create university." };
    }

    return { university: mapUniversity({ ...(data as UniversityRow), classes: [] }) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unable to create university."
    };
  }
};

type CreateClassPayload = {
  universityId: string;
  name: string;
  code: string;
  instructor: string;
  summary: string;
  meetingPattern: string;
  approval: ApprovalState;
};

export const createRemoteClass = async (payload: CreateClassPayload): Promise<{
  classTopic?: ClassTopic;
  error?: string;
}> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("classes")
      .insert({
        university_id: payload.universityId,
        name: payload.name,
        code: payload.code,
        instructor: payload.instructor,
        summary: payload.summary,
        meeting_pattern: payload.meetingPattern,
        approval_likes: payload.approval.likes,
        approval_dislikes: payload.approval.dislikes,
        approval_approved: payload.approval.approved,
        approval_created_at: payload.approval.createdAt,
        approval_expires_at: payload.approval.expiresAt
      })
      .select(
        `
        id,
        name,
        code,
        instructor,
        summary,
        meeting_pattern,
        approval_likes,
        approval_dislikes,
        approval_min_consensus,
        approval_approved,
        approval_created_at,
        approval_expires_at
      `
      )
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to create class." };
    }

    return { classTopic: mapClass(data as ClassRow) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unable to create class."
    };
  }
};
