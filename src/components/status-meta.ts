import type { BadgeProps } from "@/components/ui/badge";

export const STATUS_META: Record<
  string,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  DISCOVERED: { label: "Discovered", variant: "secondary" },
  INTERESTED: { label: "Interested", variant: "info" },
  PREPARING: { label: "Preparing", variant: "info" },
  READY_TO_APPLY: { label: "Ready to Apply", variant: "info" },
  AWAITING_REVIEW: { label: "Awaiting Review", variant: "warning" },
  REQUIRES_USER_INPUT: { label: "Requires User Input", variant: "warning" },
  APPLIED: { label: "Applied", variant: "default" },
  VIEWED: { label: "Viewed", variant: "info" },
  RECRUITER_CONTACTED: { label: "Recruiter Contacted", variant: "info" },
  INTERVIEW: { label: "Interview", variant: "success" },
  TECHNICAL_TEST: { label: "Technical Test", variant: "success" },
  OFFERING: { label: "Offer", variant: "success" },
  ACCEPTED: { label: "Accepted", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  WITHDRAWN: { label: "Withdrawn", variant: "secondary" },
  FAILED: { label: "Failed", variant: "danger" },
};

export const ALL_STATUSES = Object.keys(STATUS_META);

export function scoreVariant(score: number | null | undefined): NonNullable<BadgeProps["variant"]> {
  if (score == null) return "secondary";
  if (score >= 90) return "success";
  if (score >= 80) return "info";
  if (score >= 70) return "warning";
  return "danger";
}
