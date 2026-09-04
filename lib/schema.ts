import { z } from "zod";

export const ActivityBlockSchema = z.object({
  type: z.literal("activity"),
  start: z.string(), // "HH:MM" 24h
  end: z.string(),
  title: z.string(),
  note: z.string().optional(),
  durationMin: z.number(),
  mapQuery: z.string(),
  hours: z.string().optional(),
  parking: z.string().optional(),
  photoQuery: z.string(),
  description: z.string(),
  category: z.enum(["attraction", "meal", "lodging", "other"]),
  // User-supplied photo (data URL from an upload, or a pasted image URL) that
  // overrides the auto-searched one from /api/photo.
  photoOverride: z.string().optional(),
  // Vertical crop anchor (0-100, CSS object-position Y%) for whichever photo is
  // shown — auto-searched or overridden. Defaults to 50 (centered) when unset.
  photoOffsetY: z.number().optional(),
  // User-supplied Google Maps URLs (edit mode only) for the leg arriving at this
  // activity — origin is where the previous activity is, destination is this
  // activity itself. When both are set, they're used to re-estimate the
  // preceding transit block's travel time more precisely than mapQuery text.
  originMapUrl: z.string().optional(),
  destinationMapUrl: z.string().optional(),
});

export const TransitBlockSchema = z.object({
  type: z.literal("transit"),
  from: z.string(),
  to: z.string(),
  mode: z.enum(["car", "walk", "transit", "scooter", "bicycle"]),
  minutes: z.number(),
  departure: z.string(),
  arrival: z.string(),
});

export const BlockSchema = z.discriminatedUnion("type", [
  ActivityBlockSchema,
  TransitBlockSchema,
]);

export const DaySchema = z.object({
  date: z.string(), // ISO date
  weather: z
    .object({
      tempC: z.number(),
      precipChance: z.number(),
      summary: z.string(),
    })
    .optional(),
  blocks: z.array(BlockSchema),
  // "HH:MM" values the user has pinned — these never move when editing other times.
  lockedTimes: z.array(z.string()).optional(),
});

export const BackupPlanSchema = z.object({
  name: z.string(),
  reason: z.string(),
  durationMin: z.number(),
  desc: z.string(),
});

export const ItinerarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  destination: z.string(),
  days: z.array(DaySchema),
  backupPlans: z.array(BackupPlanSchema),
  // User-uploaded hero/cover photo for the trip header, and its vertical crop
  // anchor (0-100, CSS object-position Y%). Defaults to 50 (centered) when unset.
  coverPhoto: z.string().optional(),
  coverPhotoOffsetY: z.number().optional(),
});

export type ActivityBlock = z.infer<typeof ActivityBlockSchema>;
export type TransitBlock = z.infer<typeof TransitBlockSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Day = z.infer<typeof DaySchema>;
export type BackupPlan = z.infer<typeof BackupPlanSchema>;
export type Itinerary = z.infer<typeof ItinerarySchema>;

// Looser schemas for raw AI output: `arrival` and `durationMin` are system-computed
// after parsing (see applyTimeRules in lib/generate.ts), so the model isn't required
// to supply them even though it usually does.
export const AITransitBlockSchema = TransitBlockSchema.extend({
  arrival: z.string().optional(),
});

export const AIActivityBlockSchema = ActivityBlockSchema.extend({
  durationMin: z.number().optional(),
});

export const AIBlockSchema = z.discriminatedUnion("type", [
  AIActivityBlockSchema,
  AITransitBlockSchema,
]);

// Schema the AI must fill in (no id/createdAt/weather - those are computed after)
export const AIItineraryDraftSchema = z.object({
  title: z.string(),
  destination: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      blocks: z.array(AIBlockSchema),
    })
  ),
  backupPlans: z.array(BackupPlanSchema),
});

export type AIBlock = z.infer<typeof AIBlockSchema>;
export type AIItineraryDraft = z.infer<typeof AIItineraryDraftSchema>;
