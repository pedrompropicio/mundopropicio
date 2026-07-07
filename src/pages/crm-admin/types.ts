// Local types for CRM admin pages. Mirror the public schema for tables that may
// not yet be in the generated supabase types or that we want narrower views of.

export type EventMarketingStatus = "draft" | "published";
export type StaticPageStatus = "draft" | "published";

export interface TicketExperience {
  title_pt: string;
  title_en: string;
  description_pt: string;
  description_en: string;
}

export interface EventMarketingRow {
  event_id: string;
  company_id: string;
  status: EventMarketingStatus;
  published_at: string | null;
  hook_pt: string | null;
  hook_en: string | null;
  description_long_pt: string | null;
  description_long_en: string | null;
  meta_description_pt: string | null;
  meta_description_en: string | null;
  hero_image_url: string | null;
  og_image_url: string | null;
  poster_vertical_url: string | null;
  gallery_urls: string[] | null;
  press_quote_pt: string | null;
  press_quote_en: string | null;
  press_quote_source: string | null;
  cta_primary_label_pt: string | null;
  cta_primary_label_en: string | null;
  urgency_message_pt: string | null;
  urgency_message_en: string | null;
  performer_name: string | null;
  performer_url: string | null;
  offer_price_min: number | null;
  offer_price_max: number | null;
  offer_currency: string | null;
  offer_availability: string | null;
  hero_video_url: string | null;
  music_embed_url: string | null;
  ticket_experiences: TicketExperience[] | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  date: string | null;
  company_id: string;
}

export interface BlogPostRow {
  id: string;
  company_id: string;
  slug: string;
  title_pt: string;
  title_en: string;
  content_pt: string;
  content_en: string;
  excerpt_pt: string | null;
  excerpt_en: string | null;
  cover_image: string | null;
  published: boolean;
  portal_visible: boolean;
  author_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaticPageRow {
  id: string;
  company_id: string;
  slug: string;
  locale: "pt" | "en";
  title: string | null;
  content_md: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  status: StaticPageStatus;
  published_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}
