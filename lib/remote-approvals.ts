import type { ApprovalState } from "@/lib/sample-data";

import { getSupabaseBrowserClient } from "./supabase-browser";

type Vote = "like" | "dislike";

export const fetchApprovalVotes = async (
  deviceId: string
): Promise<{
  universityVotes: Record<string, Vote>;
  classVotes: Record<string, Vote>;
  error?: string;
}> => {
  try {
    const supabase = getSupabaseBrowserClient();
    const [{ data: uniVotes, error: uniError }, { data: classVotes, error: classError }] =
      await Promise.all([
        supabase
          .from("university_votes")
          .select("university_id, vote")
          .eq("device_id", deviceId),
        supabase.from("class_votes").select("class_id, vote").eq("device_id", deviceId)
      ]);

    if (uniError || classError) {
      return {
        universityVotes: {},
        classVotes: {},
        error: uniError?.message ?? classError?.message
      };
    }

    const uniHistory = Object.fromEntries(
      (uniVotes ?? []).map((row) => [row.university_id, row.vote as Vote])
    );
    const classHistory = Object.fromEntries(
      (classVotes ?? []).map((row) => [row.class_id, row.vote as Vote])
    );

    return { universityVotes: uniHistory, classVotes: classHistory };
  } catch (error) {
    return {
      universityVotes: {},
      classVotes: {},
      error: error instanceof Error ? error.message : "Unable to load votes."
    };
  }
};

const approvalUpdate = (approval: ApprovalState) => ({
  approval_likes: approval.likes,
  approval_dislikes: approval.dislikes,
  approval_approved: approval.approved,
  approval_created_at: approval.createdAt,
  approval_expires_at: approval.expiresAt
});

const handleVoteChange = async ({
  table,
  votesTable,
  entityIdField,
  entityId,
  deviceId,
  previousVote,
  nextVote,
  approval
}: {
  table: "universities" | "classes";
  votesTable: "university_votes" | "class_votes";
  entityIdField: "university_id" | "class_id";
  entityId: string;
  deviceId: string;
  previousVote?: Vote;
  nextVote?: Vote;
  approval: ApprovalState;
}) => {
  const supabase = getSupabaseBrowserClient();

  if (previousVote && !nextVote) {
    await supabase
      .from(votesTable)
      .delete()
      .eq(entityIdField, entityId)
      .eq("device_id", deviceId);
  } else if (nextVote) {
    await supabase.from(votesTable).upsert(
      {
        [entityIdField]: entityId,
        device_id: deviceId,
        vote: nextVote
      },
      { onConflict: `${entityIdField},device_id` }
    );
  }

  await supabase.from(table).update(approvalUpdate(approval)).eq("id", entityId);
};

export const persistUniversityVote = async (payload: {
  universityId: string;
  deviceId: string;
  previousVote?: Vote;
  nextVote?: Vote;
  approval: ApprovalState;
}) => {
  try {
    await handleVoteChange({
      table: "universities",
      votesTable: "university_votes",
      entityIdField: "university_id",
      entityId: payload.universityId,
      deviceId: payload.deviceId,
      previousVote: payload.previousVote,
      nextVote: payload.nextVote,
      approval: payload.approval
    });
    return {};
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update university approval."
    };
  }
};

export const persistClassVote = async (payload: {
  classId: string;
  deviceId: string;
  previousVote?: Vote;
  nextVote?: Vote;
  approval: ApprovalState;
}) => {
  try {
    await handleVoteChange({
      table: "classes",
      votesTable: "class_votes",
      entityIdField: "class_id",
      entityId: payload.classId,
      deviceId: payload.deviceId,
      previousVote: payload.previousVote,
      nextVote: payload.nextVote,
      approval: payload.approval
    });
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update class approval."
    };
  }
};
