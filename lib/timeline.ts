import type { Day, Block, ActivityBlock, TransitBlock } from "./schema";
import { toMinutes, toHHMM } from "./time";

export type PointRef = {
  blockIndex: number;
  field: "start" | "end" | "departure" | "arrival";
};

export type TimelinePoint = {
  time: string; // "HH:MM"
  label: string;
  refs: PointRef[];
};

function rawPoints(day: Day): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  day.blocks.forEach((block, blockIndex) => {
    if (block.type === "activity") {
      points.push({ time: block.start, label: block.title, refs: [{ blockIndex, field: "start" }] });
      points.push({ time: block.end, label: block.title, refs: [{ blockIndex, field: "end" }] });
    } else {
      points.push({ time: block.departure, label: block.from, refs: [{ blockIndex, field: "departure" }] });
      points.push({ time: block.arrival, label: block.to, refs: [{ blockIndex, field: "arrival" }] });
    }
  });
  return points;
}

function isFromActivity(ref: PointRef, blocks: Block[]): boolean {
  return blocks[ref.blockIndex].type === "activity";
}

// Merge consecutive raw points that land on the same clock time (e.g. an activity's
// end and the next transit's departure) into one editable point, so a single edit
// keeps both underlying block fields in sync.
export function buildDayTimeline(day: Day): TimelinePoint[] {
  const raw = rawPoints(day);
  const merged: TimelinePoint[] = [];

  for (const point of raw) {
    const last = merged[merged.length - 1];
    if (last && last.time === point.time) {
      last.refs.push(...point.refs);
      if (!isFromActivity(last.refs[0], day.blocks) && isFromActivity(point.refs[0], day.blocks)) {
        last.label = point.label;
      }
    } else {
      merged.push({ ...point, refs: [...point.refs] });
    }
  }

  return merged;
}

// Finds the single block whose interval spans exactly from points[index] to
// points[index + 1] (i.e. starts at one and ends at the other) — or null if
// that gap is idle time with no block behind it.
export function blockForSegment(
  points: TimelinePoint[],
  index: number,
  blocks: Block[]
): { block: Block; blockIndex: number } | null {
  const startRef = points[index]?.refs.find((r) => r.field === "start" || r.field === "departure");
  if (!startRef) return null;
  const endsHere = points[index + 1]?.refs.some(
    (r) => r.blockIndex === startRef.blockIndex && (r.field === "end" || r.field === "arrival")
  );
  return endsHere ? { block: blocks[startRef.blockIndex], blockIndex: startRef.blockIndex } : null;
}

function applyTimeToBlocks(blocks: Block[], point: TimelinePoint, time: string): Block[] {
  const next = [...blocks];
  for (const ref of point.refs) {
    next[ref.blockIndex] = { ...next[ref.blockIndex], [ref.field]: time } as Block;
  }
  return next;
}

export type EditResult = { ok: true; day: Day } | { ok: false; error: string };

// Applies a set of point times (in minutes) to the day's blocks and reports
// the first transit leg, if any, left shorter than its minimum travel time.
function applyAndFindViolation(
  day: Day,
  points: TimelinePoint[],
  timesInMinutes: number[]
): { blocks: Block[]; violation: Extract<Block, { type: "transit" }> | null } {
  const timeStrs = timesInMinutes.map(toHHMM);
  let blocks = day.blocks;
  for (let i = 0; i < points.length; i++) {
    if (timeStrs[i] === points[i].time) continue;
    blocks = applyTimeToBlocks(blocks, points[i], timeStrs[i]);
  }

  for (const block of blocks) {
    if (block.type !== "transit") continue;
    const actual = toMinutes(block.arrival) - toMinutes(block.departure);
    if (actual < block.minutes) return { blocks, violation: block };
  }

  return { blocks, violation: null };
}

// Edits one timeline point, cascading the same delta forward onto every later,
// unlocked point (stopping at the next locked one), then validates that no
// transit leg ends up shorter than its estimated minimum travel time.
//
// Moving a point earlier can squeeze the transit leg immediately before it
// below that minimum. Rather than blocking the edit, we retry by cascading
// the same delta backward too — sliding every earlier, unlocked point back
// by the same amount so that leg's duration (and everything before it) is
// preserved, stopping at the next locked point.
export function editTimelinePoint(
  day: Day,
  pointIndex: number,
  newTime: string,
  lockedTimes: Set<string>
): EditResult {
  const points = buildDayTimeline(day);
  const target = points[pointIndex];
  if (!target) return { ok: false, error: "找不到這個時間點" };

  const delta = toMinutes(newTime) - toMinutes(target.time);
  if (delta === 0) return { ok: true, day };

  const forwardTimes = points.map((p) => toMinutes(p.time));
  forwardTimes[pointIndex] = toMinutes(newTime);
  for (let i = pointIndex + 1; i < points.length; i++) {
    if (lockedTimes.has(points[i].time)) break;
    forwardTimes[i] = toMinutes(points[i].time) + delta;
  }

  let { blocks, violation } = applyAndFindViolation(day, points, forwardTimes);

  if (violation && delta < 0) {
    const backwardTimes = [...forwardTimes];
    for (let i = pointIndex - 1; i >= 0; i--) {
      if (lockedTimes.has(points[i].time)) break;
      backwardTimes[i] = toMinutes(points[i].time) + delta;
    }
    ({ blocks, violation } = applyAndFindViolation(day, points, backwardTimes));
  }

  if (violation) {
    const minArrival = toHHMM(toMinutes(violation.departure) + violation.minutes);
    return {
      ok: false,
      error: `${violation.from} → ${violation.to} 至少需要 ${violation.minutes} 分鐘車程，最早只能選 ${minArrival}`,
    };
  }

  return { ok: true, day: { ...day, blocks } };
}

// Changes a transit leg's mode and estimated minutes. If the leg's current
// departure→arrival window is already long enough, only the mode/minutes
// fields change. Otherwise the arrival is pushed out to fit, cascading
// through the same forward/backward logic as editTimelinePoint.
export function editTransitMode(
  day: Day,
  blockIndex: number,
  mode: TransitBlock["mode"],
  minutes: number,
  lockedTimes: Set<string>
): EditResult {
  const target = day.blocks[blockIndex];
  if (!target || target.type !== "transit") return { ok: false, error: "找不到這段交通" };

  const blocks = [...day.blocks];
  blocks[blockIndex] = { ...target, mode, minutes };
  const updatedDay = { ...day, blocks };

  const requiredArrival = toHHMM(toMinutes(target.departure) + minutes);
  if (toMinutes(target.arrival) >= toMinutes(requiredArrival)) {
    return { ok: true, day: updatedDay };
  }

  const points = buildDayTimeline(updatedDay);
  const arrivalPointIndex = points.findIndex((p) =>
    p.refs.some((r) => r.blockIndex === blockIndex && r.field === "arrival")
  );
  if (arrivalPointIndex === -1) return { ok: true, day: updatedDay };

  return editTimelinePoint(updatedDay, arrivalPointIndex, requiredArrival, lockedTimes);
}

const NEW_ACTIVITY_DURATION_MIN = 60;

function blockStartTime(block: Block): string {
  return block.type === "activity" ? block.start : block.departure;
}

// Inserts a new minimal activity block starting exactly at `time`. The new
// activity always wins that slot outright: any block still running at `time`
// (its end falls after the new activity's start — not just ones that start
// later) gets pushed to begin right after it, cascading forward as far as
// the chain of overlaps requires (stopping at a locked/pinned block, same as
// editTimelinePoint's forward cascade).
export function insertActivityAt(
  day: Day,
  time: string,
  title: string,
  lockedTimes: Set<string>,
  durationMin: number = NEW_ACTIVITY_DURATION_MIN
): Day {
  const startMin = toMinutes(time);
  const endMin = startMin + durationMin;

  const newBlock: ActivityBlock = {
    type: "activity",
    start: time,
    end: toHHMM(endMin),
    title,
    durationMin,
    mapQuery: title,
    photoQuery: title,
    description: "",
    category: "other",
  };

  let insertIndex = day.blocks.findIndex((b) => blockTimeRange(b).endMin > startMin);
  if (insertIndex === -1) insertIndex = day.blocks.length;

  const blocks = [...day.blocks];
  blocks.splice(insertIndex, 0, newBlock);

  return { ...day, blocks: pushForwardFrom(blocks, insertIndex + 1, endMin, lockedTimes) };
}

// --- Calendar-style drag support (free-form move/resize with push-to-avoid-overlap) ---

const MIN_BLOCK_MINUTES = 5;
const DAY_MINUTES = 1440;

export function blockTimeRange(block: Block): { startMin: number; endMin: number } {
  return block.type === "activity"
    ? { startMin: toMinutes(block.start), endMin: toMinutes(block.end) }
    : { startMin: toMinutes(block.departure), endMin: toMinutes(block.arrival) };
}

function withTimeRange(block: Block, startMin: number, endMin: number): Block {
  const start = toHHMM(startMin);
  const end = toHHMM(endMin);
  return block.type === "activity" ? { ...block, start, end } : { ...block, departure: start, arrival: end };
}

function isPinned(block: Block, lockedTimes: Set<string>): boolean {
  return lockedTimes.has(blockStartTime(block));
}

// Pushes blocks[index], blocks[index+1], ... later so none of them starts
// before `minStart`, preserving each one's own duration, cascading as far as
// the chain of overlaps requires. Stops (without moving it) at a pinned block.
function pushForwardFrom(blocks: Block[], index: number, minStart: number, lockedTimes: Set<string>): Block[] {
  const next = [...blocks];
  let boundary = minStart;
  for (let i = index; i < next.length; i++) {
    if (isPinned(next[i], lockedTimes)) break;
    const { startMin, endMin } = blockTimeRange(next[i]);
    if (startMin >= boundary) break;
    const duration = endMin - startMin;
    next[i] = withTimeRange(next[i], boundary, boundary + duration);
    boundary += duration;
  }
  return next;
}

// Pushes blocks[index], blocks[index-1], ... earlier so none of them ends
// after `maxEnd`, preserving each one's own duration, cascading backward.
// Stops (without moving it) at a pinned block.
function pushBackwardFrom(blocks: Block[], index: number, maxEnd: number, lockedTimes: Set<string>): Block[] {
  const next = [...blocks];
  let boundary = maxEnd;
  for (let i = index; i >= 0; i--) {
    if (isPinned(next[i], lockedTimes)) break;
    const { startMin, endMin } = blockTimeRange(next[i]);
    if (endMin <= boundary) break;
    const duration = endMin - startMin;
    next[i] = withTimeRange(next[i], boundary - duration, boundary);
    boundary -= duration;
  }
  return next;
}

// Drags one edge of a block to a new clock-time (in minutes since midnight),
// clamped to the day and to a minimum duration. If that squeezes into a
// neighboring block, the neighbor (and its own neighbors, transitively) is
// pushed out of the way rather than allowing any overlap — unless that
// neighbor is pinned, in which case this block's own edge is squeezed/capped
// against the pin instead, so the pinned block never moves.
export function resizeBlockEdge(
  day: Day,
  blockIndex: number,
  edge: "start" | "end",
  newTimeMin: number,
  lockedTimes: Set<string> = new Set()
): Day {
  const blocks = [...day.blocks];
  const block = blocks[blockIndex];
  if (!block) return day;
  const { startMin, endMin } = blockTimeRange(block);

  if (edge === "end") {
    let clamped = Math.min(DAY_MINUTES, Math.max(startMin + MIN_BLOCK_MINUTES, newTimeMin));
    for (let i = blockIndex + 1; i < blocks.length; i++) {
      if (isPinned(blocks[i], lockedTimes)) {
        clamped = Math.min(clamped, blockTimeRange(blocks[i]).startMin);
        break;
      }
    }
    blocks[blockIndex] = withTimeRange(block, startMin, clamped);
    return { ...day, blocks: pushForwardFrom(blocks, blockIndex + 1, clamped, lockedTimes) };
  }

  let clamped = Math.max(0, Math.min(endMin - MIN_BLOCK_MINUTES, newTimeMin));
  for (let i = blockIndex - 1; i >= 0; i--) {
    if (isPinned(blocks[i], lockedTimes)) {
      clamped = Math.max(clamped, blockTimeRange(blocks[i]).endMin);
      break;
    }
  }
  blocks[blockIndex] = withTimeRange(block, clamped, endMin);
  return { ...day, blocks: pushBackwardFrom(blocks, blockIndex - 1, clamped, lockedTimes) };
}

// Drags a whole block by `deltaMinutes`, preserving its own duration. Pushes
// whichever direction it moved into out of the way, transitively — unless it
// runs into a pinned block, in which case the drag itself is capped at the
// pin's boundary so the pinned block never moves.
export function moveBlockBy(
  day: Day,
  blockIndex: number,
  deltaMinutes: number,
  lockedTimes: Set<string> = new Set()
): Day {
  const blocks = [...day.blocks];
  const block = blocks[blockIndex];
  if (!block) return day;
  const { startMin, endMin } = blockTimeRange(block);
  const duration = endMin - startMin;

  let newStart = Math.max(0, Math.min(DAY_MINUTES - duration, startMin + deltaMinutes));

  if (deltaMinutes > 0) {
    for (let i = blockIndex + 1; i < blocks.length; i++) {
      if (isPinned(blocks[i], lockedTimes)) {
        newStart = Math.min(newStart, blockTimeRange(blocks[i]).startMin - duration);
        break;
      }
    }
  } else if (deltaMinutes < 0) {
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (isPinned(blocks[i], lockedTimes)) {
        newStart = Math.max(newStart, blockTimeRange(blocks[i]).endMin);
        break;
      }
    }
  }

  const newEnd = newStart + duration;
  blocks[blockIndex] = withTimeRange(block, newStart, newEnd);

  if (newStart > startMin) return { ...day, blocks: pushForwardFrom(blocks, blockIndex + 1, newEnd, lockedTimes) };
  if (newStart < startMin) return { ...day, blocks: pushBackwardFrom(blocks, blockIndex - 1, newStart, lockedTimes) };
  return { ...day, blocks };
}
