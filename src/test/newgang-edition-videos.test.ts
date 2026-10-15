import { describe, expect, it } from "vitest";
import { publicEditions, publicVideos } from "../../supabase/functions/newgang-portal/videos";
import { assemblePublic } from "../../supabase/functions/newgang-portal/public";
import { editionVideoPath, MAX_VIDEO_BYTES, validateVideoFile } from "@/lib/newgang-media";
import { readFileSync, readdirSync } from "node:fs";

const CO = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const UP = `https://x.supabase.co/storage/v1/object/public/festival-edition-videos/${CO}/festival-editions/newgang/2025/a.mp4`;

describe("contrato history — vídeos (D-ERP277)", () => {
  it("youtube e upload saem só com provider, title, url, poster_url", () => {
    const out = publicVideos([
      { provider: "youtube", url: "https://youtu.be/abc", title: "Aftermovie", storage_path: "x", secret: 1 },
      { provider: "upload", url: UP, title: " Sem direitos ", poster_url: "https://x/p.webp", size: 9 },
    ]);
    expect(out).toEqual([
      { provider: "youtube", title: "Aftermovie", url: "https://youtu.be/abc", poster_url: null },
      { provider: "upload", title: "Sem direitos", url: UP, poster_url: "https://x/p.webp" },
    ]);
  });
  it("descarta provider desconhecido, url não-https e poster inválido", () => {
    expect(publicVideos([{ provider: "tiktok", url: "https://t" }, { provider: "upload", url: "http://a" }, null])).toEqual([]);
    expect(publicVideos([{ provider: "upload", url: UP, poster_url: "javascript:x" }])[0].poster_url).toBeNull();
    expect(publicVideos("x")).toEqual([]);
  });
  it("mantém a ordem (1.º = principal) e passa pelo assemblePublic", () => {
    const eds = [{ brand_key: "newgang", year: 2025, videos: [{ provider: "upload", url: UP }, { provider: "youtube", url: "https://youtu.be/b" }] }];
    const r: any = assemblePublic({ history: true }, { brand_key: "newgang" }, [], eds);
    expect(r.history.editions[0].videos.map((v: any) => v.provider)).toEqual(["upload", "youtube"]);
    expect(publicEditions(null)).toEqual([]);
  });
});

describe("validação do envio", () => {
  it("tipos aceites e limite de 500 MB", () => {
    expect(validateVideoFile({ type: "video/mp4", size: 10 })).toBeNull();
    expect(validateVideoFile({ type: "video/webm", size: 10 })).toBeNull();
    expect(validateVideoFile({ type: "video/quicktime", size: MAX_VIDEO_BYTES })).toBeNull();
    expect(validateVideoFile({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 })).toMatch(/500 MB/);
    expect(validateVideoFile({ type: "image/png", size: 10 })).toMatch(/Tipo não suportado/);
    expect(validateVideoFile({ type: "video/mp4", size: 0 })).toMatch(/vazio/);
  });
  it("caminho começa pelo company_id e usa a extensão do tipo", () => {
    expect(editionVideoPath(CO, "newgang", 2025, "u1", "video/quicktime")).toBe(`${CO}/festival-editions/newgang/2025/u1.mov`);
    expect(() => editionVideoPath("", "newgang", 2025, "u", "video/mp4")).toThrow();
    expect(() => editionVideoPath(CO, "newgang", 2025, "u", "video/avi")).toThrow();
  });
});

describe("permissões do bucket festival-edition-videos", () => {
  const dir = "drizzle/migrations";
  const sql = readdirSync(dir).filter((f) => f.includes("festival_edition_videos")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n");
  it("leitura pública; escrita com os papéis do portal-marketing-images, path por empresa e só vídeo", () => {
    expect(sql).toMatch(/festival_edition_videos_select ON storage\.objects FOR SELECT\s+USING \(bucket_id = 'festival-edition-videos'\)/);
    for (const r of ["admin", "platform_admin", "manager", "marketing_manager", "content_manager", "editor"]) expect(sql).toContain(`'${r}'`);
    expect(sql).not.toMatch(/'(viewer|partner|user|accountant)'/);
    expect(sql).toContain("current_company_id()");
    expect(sql).toContain("('mp4','webm','mov')");
    expect(sql).toMatch(/FOR INSERT TO authenticated/);
  });
});
