import Anthropic from "@anthropic-ai/sdk";
import {
  AIItineraryDraftSchema,
  type AIItineraryDraft,
  type ActivityBlock,
  type TransitBlock,
  type Block,
  type Day,
  type BackupPlan,
} from "./schema";
import { snapToQuarterHour, arrivalWithBuffer, toMinutes } from "./time";

export type ItineraryDraft = {
  title: string;
  destination: string;
  days: Day[];
  backupPlans: BackupPlan[];
};

const SYSTEM_PROMPT = `你是專業的旅遊行程規劃師。使用者會給你片段、不完整的行程筆記（時間、地點、活動片段），
你要把它們組織成一份完整、詳細、像旅遊介紹網站一樣的行程表。

規則：
- 判斷使用者的旅遊天數，依日期分組成 days 陣列。
- 每天的 blocks 依時間先後排列，包含 "activity"（景點/餐廳/住宿/其他）與 "transit"（交通）兩種區塊交錯出現。
- activity 的 start/end 用 "HH:MM" 24小時制表示，之後系統會自動吸附到最近的 15 分鐘整點，你只要給合理估計值即可。
- 若使用者沒說明某景點要停留多久，且你也無法從常識判斷，預設抓 90 分鐘 (1.5 小時)。
- transit 的 minutes 是估計車程/步行分鐘數（不需要是 15 的倍數），departure 用上一個 activity 的 end，arrival 系統會自動計算（無條件進位到下個 15 分整點留緩衝），你只要給 departure 大致的值。
- 每個 activity 要有：mapQuery（可直接拿去 Google 地圖搜尋的地點名稱，盡量包含縣市）、photoQuery（拿去搜圖用的簡短關鍵字，例如景點英文或中文名稱）、hours（營業時間，若不確定可省略此欄位）、parking（停車資訊，若不確定可省略此欄位）、description（50字以內的特色介紹，用溫暖、吸引人的文字）、category（attraction/meal/lodging/other 其中之一）。
- 幫整趟行程想一個吸引人的標題（title），並判斷主要目的地城市/地區（destination，例如"南投"、"台北"，用來查天氣）。若使用者已指定目的地/地區，請直接採用該值作為 destination，不需要自行從內容判斷。
- 若使用者已指定行程開始日期，行程第一天的 date 請從該日期開始（後續天數依你判斷的旅遊天數決定）；若沒有指定，才依「今天日期」與內容裡的相對時間描述（例如"明天"、"下週六"）自行判斷。
- 最後生成 2-3 個 backupPlans（備用行程），是附近的替代景點，用於下雨、店家沒開、臨時有人不想去等情況，每個要有 name、reason（適用情境，例如"雨天備案"）、durationMin、desc（簡短介紹）。
- 起床/準備時間反推：若使用者提到當天最早的「幾點出門/出發/集合」，且那是當天第一個事件，請往前推算 1.5 小時，在最前面插入一個活動區塊，title 為「起床 & 早餐」，時間為出發時間減 1.5 小時到出發時間，category 用 "other"，description 簡短提醒（例如「起床梳洗、吃份早餐，準備好精神出發」）。
- 每一天都必須安排午餐（約 12:00-14:00 間）與晚餐（約 18:00-20:00 間）的用餐活動（category: "meal"），即使使用者沒有提到。若使用者沒指定餐廳，依當天行程動線在附近安排合理的美食建議（可以是真實知名店家，或合理描述如「當地小吃」），不可整段空白跳過用餐時間。
- 長途休息站：若某段開車 transit（mode: "car"）的車程預估超過 120 分鐘，不要輸出成單一 transit 區塊，而是拆成兩段 transit，中間插入一個活動區塊代表休息站（title 例如「OO服務區 休息」，category: "other"，durationMin 約 15-20 分鐘，description 提醒下車活動筋骨、上廁所），兩段 transit 的 minutes 相加約等於原本總車程。
- 所有中文文字（title、description、name、reason、desc 等）一律使用全形標點符號（，。、；：），不要使用半形逗號 ","。
- 若使用者有提供住家地址：第一天最早的交通區塊（從家裡出發，通常緊接在「起床 & 早餐」之後）的 from 欄位請填入該住家地址，並依住家地址到目的地的實際距離合理估算車程 minutes（不要只套用預設值）。同樣地，若整趟行程的最後一天動線上合理需要返家（使用者沒有特別說明要留宿或行程本身就是當天來回），請在最後一個活動之後補上一段回家的 transit，to 欄位填入該住家地址，departure 為最後一個活動的 end 時間，minutes 依實際距離合理估算。若使用者沒有提供住家地址，則不需要處理這兩點。
- 只要輸出符合 schema 的 JSON，不要有其他文字說明。`;

function buildToolSchema() {
  return {
    name: "submit_itinerary",
    description: "Submit the fully structured itinerary draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        destination: { type: "string" },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "ISO date YYYY-MM-DD" },
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["activity", "transit"] },
                    start: { type: "string" },
                    end: { type: "string" },
                    title: { type: "string" },
                    note: { type: "string" },
                    durationMin: { type: "number" },
                    mapQuery: { type: "string" },
                    hours: { type: "string" },
                    parking: { type: "string" },
                    photoQuery: { type: "string" },
                    description: { type: "string" },
                    category: {
                      type: "string",
                      enum: ["attraction", "meal", "lodging", "other"],
                    },
                    from: { type: "string" },
                    to: { type: "string" },
                    mode: { type: "string", enum: ["car", "walk", "transit"] },
                    minutes: { type: "number" },
                    departure: { type: "string" },
                    arrival: { type: "string" },
                  },
                  required: ["type"],
                },
              },
            },
            required: ["date", "blocks"],
          },
        },
        backupPlans: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              reason: { type: "string" },
              durationMin: { type: "number" },
              desc: { type: "string" },
            },
            required: ["name", "reason", "durationMin", "desc"],
          },
        },
      },
      required: ["title", "destination", "days", "backupPlans"],
    },
  };
}

export async function generateItineraryDraft(
  userText: string,
  todayISO: string,
  options: { homeAddress?: string; destination?: string; startDate?: string } = {}
): Promise<ItineraryDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });
  const tool = buildToolSchema();

  const homeAddress = options.homeAddress?.trim() ?? "";
  const destination = options.destination?.trim() ?? "";
  const startDate = options.startDate?.trim() ?? "";

  const homeAddressLine = homeAddress ? `\n使用者的住家地址：${homeAddress}` : "";
  const destinationLine = destination ? `\n使用者指定的目的地/地區：${destination}` : "";
  const startDateLine = startDate ? `\n使用者指定的行程開始日期：${startDate}` : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `今天日期是 ${todayISO}。${homeAddressLine}${destinationLine}${startDateLine}\n以下是使用者的片段行程筆記，請規劃成完整行程：\n\n${userText}`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a structured itinerary");
  }

  const parsed = AIItineraryDraftSchema.parse(toolUse.input);
  return applyTimeRules(parsed);
}

export type ActivityFillDetails = {
  mapQuery: string;
  photoQuery: string;
  description: string;
  category: "attraction" | "meal" | "lodging" | "other";
  hours?: string;
  parking?: string;
};

const FILL_ACTIVITY_SYSTEM_PROMPT = `你是專業的旅遊行程規劃師。使用者手動在行程表裡新增了一個活動區塊，只給了標題，
請你補上其餘欄位：mapQuery（可直接拿去 Google 地圖搜尋的地點名稱，盡量包含縣市）、photoQuery（拿去搜圖用的簡短關鍵字，例如景點英文或中文名稱）、
description（50字以內的特色介紹，用溫暖、吸引人的文字）、category（attraction/meal/lodging/other 其中之一，依標題判斷最合適的分類）、
hours（營業時間，若不確定可省略此欄位）、parking（停車資訊，若不確定可省略此欄位）。
所有中文文字一律使用全形標點符號（，。、；：），不要使用半形逗號 ","。只要輸出符合 schema 的 JSON，不要有其他文字說明。`;

function buildFillActivityToolSchema() {
  return {
    name: "submit_activity_details",
    description: "Submit the supplementary details for a single activity block.",
    input_schema: {
      type: "object" as const,
      properties: {
        mapQuery: { type: "string" },
        photoQuery: { type: "string" },
        description: { type: "string" },
        category: {
          type: "string",
          enum: ["attraction", "meal", "lodging", "other"],
        },
        hours: { type: "string" },
        parking: { type: "string" },
      },
      required: ["mapQuery", "photoQuery", "description", "category"],
    },
  };
}

export async function fillActivityDetails(
  title: string,
  destination: string,
  date: string
): Promise<ActivityFillDetails> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });
  const tool = buildFillActivityToolSchema();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: FILL_ACTIVITY_SYSTEM_PROMPT,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `目的地：${destination}\n日期：${date}\n活動標題：${title}`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return activity details");
  }

  return toolUse.input as ActivityFillDetails;
}

const TRAVEL_MODE_LABEL: Record<string, string> = {
  car: "開車",
  transit: "大眾運輸",
  walk: "走路",
  scooter: "騎機車",
  bicycle: "騎腳踏車",
};

const TRAVEL_TIME_SYSTEM_PROMPT = `你是交通時間估算助手。使用者會給你起點、終點與交通方式，
請根據常識與台灣的實際路況、大眾運輸班次等因素，估算合理的通勤/車程所需分鐘數（整數）。
只要輸出符合 schema 的 JSON，不要有其他文字說明。`;

function buildTravelTimeToolSchema() {
  return {
    name: "submit_travel_time",
    description: "Submit the estimated travel time in minutes.",
    input_schema: {
      type: "object" as const,
      properties: {
        minutes: { type: "number" },
      },
      required: ["minutes"],
    },
  };
}

export async function estimateTravelMinutes(from: string, to: string, mode: string): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });
  const tool = buildTravelTimeToolSchema();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 256,
    system: TRAVEL_TIME_SYSTEM_PROMPT,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: `起點：${from}\n終點：${to}\n交通方式：${TRAVEL_MODE_LABEL[mode] ?? mode}`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a travel time estimate");
  }

  const { minutes } = toolUse.input as { minutes: number };
  return Math.max(1, Math.round(minutes));
}

// Post-process AI output: snap activity times to 30-min marks, recompute transit
// arrival times with the rounded-up buffer rule (the model never supplies `arrival`).
function applyTimeRules(draft: AIItineraryDraft): ItineraryDraft {
  const days: Day[] = draft.days.map((day) => {
    let prevArrivalOverride: string | null = null;
    const blocks: Block[] = day.blocks.map((block): Block => {
      if (block.type === "activity") {
        const start = prevArrivalOverride ?? snapToQuarterHour(block.start);
        const end = snapToQuarterHour(block.end);
        prevArrivalOverride = null;
        const durationMin = block.durationMin ?? Math.max(30, toMinutes(end) - toMinutes(start));
        return { ...block, start, end, durationMin } satisfies ActivityBlock;
      } else {
        const arrival = arrivalWithBuffer(block.departure, block.minutes);
        prevArrivalOverride = arrival;
        return { ...block, arrival } satisfies TransitBlock;
      }
    });
    return { date: day.date, blocks };
  });

  return {
    title: draft.title,
    destination: draft.destination,
    days,
    backupPlans: draft.backupPlans,
  };
}
