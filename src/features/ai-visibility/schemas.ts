import { z } from "zod"

/** Structured outputs Claude Haiku returns for AI Visibility (docs/plans/ai-visibility/05-analysis.md). */

export const AnalysisSchema = z.object({
  brands: z.array(
    z.object({
      name: z.string().describe("The brand, company, product or business as written in the answer"),
      tracked_id: z.string().nullable().describe("The id of the tracked brand this is, or null"),
      quote: z.string().describe("Up to 25 words from the answer about it"),
    }),
  ),
  sentiment: z.array(
    z.object({
      tracked_id: z.string(),
      score: z.number().describe("0 very negative, 50 neutral, 100 very positive"),
      reason: z.string(),
    }),
  ),
  is_recommendation_list: z.boolean(),
})
export type Analysis = z.infer<typeof AnalysisSchema>

export const DomainTypesSchema = z.object({
  items: z.array(
    z.object({
      domain: z.string(),
      type: z.enum(["corporate", "editorial", "reference", "ugc", "directory", "social", "ecommerce", "other"]),
    }),
  ),
})

export const SuggestSchema = z.object({
  topics: z.array(z.string()).describe("Short topic names the questions are grouped into"),
  suggestions: z.array(
    z.object({
      text: z.string(),
      topic: z.string(),
      intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
      branded: z.boolean(),
      persona: z.string().nullable(),
      reason: z.string(),
    }),
  ),
})
export type Suggest = z.infer<typeof SuggestSchema>

export const ClassifySchema = z.object({
  items: z.array(
    z.object({
      index: z.number(),
      intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
      head_phrase: z.string().describe("2–5 word search phrase behind the question"),
      topic: z.string().nullable(),
    }),
  ),
})

export const ActionsSchema = z.object({
  actions: z.array(
    z.object({
      group: z.enum(["own_pages", "earned"]),
      title: z.string(),
      detail: z.string(),
      domain: z.string().nullable(),
      url: z.string().nullable(),
      impact: z.enum(["high", "medium", "low"]),
      evidence_note: z.string(),
    }),
  ),
})
export type ActionsOut = z.infer<typeof ActionsSchema>
