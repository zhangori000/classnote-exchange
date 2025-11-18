import type { Post, Comment } from "@/lib/sample-data";

import { getSupabaseBrowserClient } from "./supabase-browser";

const defaultExpiration = () =>
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

export type RemotePostMeta = {
  classId: string;
  context: "general" | "lecture";
  lectureDate?: string | null;
  post: Post;
};

type CommentRow = {
  id: string;
  author: string | null;
  content: string;
  created_at: string;
};

type VoteRow = {
  device_id: string;
  vote: "like" | "dislike";
};

type PostRow = {
  id: string;
  class_id: string;
  context: "general" | "lecture" | null;
  lecture_date: string | null;
  title: string;
  body: string;
  likes_count: number | null;
  dislikes_count: number | null;
  tags: string[] | null;
  author: string | null;
  min_consensus_likes: number | null;
  approved: boolean | null;
  expires_at: string | null;
  created_at: string | null;
  comments?: CommentRow[] | null;
  votes?: VoteRow[] | null;
};

const mapComment = (row: CommentRow): Comment => ({
  id: row.id,
  author: row.author ?? "Anon",
  content: row.content,
  createdAt: row.created_at
});

const mapPost = (row: PostRow): Post => ({
  id: row.id,
  title: row.title,
  body: row.body,
  likes: row.likes_count ?? 0,
  dislikes: row.dislikes_count ?? 0,
  tags: row.tags ?? [],
  author: row.author ?? "Anon",
  createdAt: row.created_at ?? new Date().toISOString(),
  comments: (row.comments ?? []).map(mapComment),
  minConsensusLikes: row.min_consensus_likes ?? 15,
  approved: Boolean(row.approved),
  expiresAt: row.expires_at ?? defaultExpiration()
});

type FetchRemotePostsResult = {
  postsByClass: Record<string, Post[]>;
  meta: Record<string, RemotePostMeta>;
  voteHistory: Record<string, "like" | "dislike">;
  error?: string;
};

export const fetchRemotePosts = async (
  deviceId?: string
): Promise<FetchRemotePostsResult> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("posts")
      .select(
        `
        id,
        class_id,
        context,
        lecture_date,
        title,
        body,
        likes_count,
        dislikes_count,
        tags,
        author,
        min_consensus_likes,
        approved,
        expires_at,
        created_at,
        comments:comments (
          id,
          author,
          content,
          created_at
        ),
        votes:post_likes (
          device_id,
          vote
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      return {
        postsByClass: {},
        meta: {},
        voteHistory: {},
        error: error.message
      };
    }

    const postsByClass: Record<string, Post[]> = {};
    const meta: Record<string, RemotePostMeta> = {};
    const voteHistory: Record<string, "like" | "dislike"> = {};

    (data ?? []).forEach((row) => {
      if (!row.class_id) return;
      const post = mapPost(row);
      const context: "general" | "lecture" =
        row.context === "lecture" ? "lecture" : "general";
      meta[row.id] = {
        classId: row.class_id,
        context,
        lectureDate: row.lecture_date,
        post
      };

      if (context === "lecture") {
        if (deviceId && row.votes) {
          const existingVote = row.votes.find(
            (vote) => vote.device_id === deviceId
          );
          if (existingVote) {
            voteHistory[row.id] = existingVote.vote;
          }
        }
        return;
      }

      postsByClass[row.class_id] = [
        ...(postsByClass[row.class_id] ?? []),
        post
      ];

      if (deviceId && row.votes) {
        const existingVote = row.votes.find(
          (vote) => vote.device_id === deviceId
        );
        if (existingVote) {
          voteHistory[row.id] = existingVote.vote;
        }
      }
    });

    return {
      postsByClass,
      meta,
      voteHistory
    };
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Unable to reach Supabase.";
    return {
      postsByClass: {},
      meta: {},
      voteHistory: {},
      error
    };
  }
};

export const createRemotePost = async (payload: {
  classId: string;
  context: "general" | "lecture";
  lectureDate?: string | null;
  title: string;
  body: string;
  tags: string[];
  author: string;
  minConsensusLikes: number;
  expiresAt: string;
}): Promise<{ post?: Post; error?: string }> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("posts")
      .insert({
        class_id: payload.classId,
        context: payload.context,
        lecture_date:
          payload.context === "lecture" ? payload.lectureDate ?? null : null,
        title: payload.title,
        body: payload.body,
        tags: payload.tags,
        author: payload.author,
        min_consensus_likes: payload.minConsensusLikes,
        expires_at: payload.expiresAt,
        likes_count: 0,
        dislikes_count: 0,
        approved: false
      })
      .select(
        `
        *,
        comments:comments (
          id,
          author,
          content,
          created_at
        ),
        votes:post_likes (
          device_id,
          vote
        )
      `
      )
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to create post." };
    }

    return { post: mapPost(data) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unable to create post."
    };
  }
};

export const persistPostVote = async (payload: {
  postId: string;
  deviceId: string;
  nextVote?: "like" | "dislike";
  previousVote?: "like" | "dislike";
  likes: number;
  dislikes: number;
  minConsensusLikes: number;
}): Promise<{ error?: string }> => {
  try {
    const supabase = getSupabaseBrowserClient();

    if (payload.previousVote && !payload.nextVote) {
      await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", payload.postId)
        .eq("device_id", payload.deviceId);
    } else if (payload.nextVote) {
      await supabase.from("post_likes").upsert(
        {
          post_id: payload.postId,
          device_id: payload.deviceId,
          vote: payload.nextVote
        },
        { onConflict: "post_id,device_id" }
      );
    }

    await supabase
      .from("posts")
      .update({
        likes_count: payload.likes,
        dislikes_count: payload.dislikes,
        approved: payload.likes >= payload.minConsensusLikes
      })
      .eq("id", payload.postId);

    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unable to record vote."
    };
  }
};

export const createRemoteComment = async (payload: {
  postId: string;
  deviceId: string;
  author: string;
  content: string;
}): Promise<{ comment?: Comment; error?: string }> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({
        post_id: payload.postId,
        device_id: payload.deviceId,
        author: payload.author,
        content: payload.content
      })
      .select("*")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to save comment." };
    }

    const comment: Comment = {
      id: data.id,
      author: data.author ?? payload.author,
      content: data.content,
      createdAt: data.created_at
    };

    return { comment };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Unable to reach Supabase for comment."
    };
  }
};
