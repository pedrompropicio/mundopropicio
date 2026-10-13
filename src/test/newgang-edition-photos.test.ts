import { describe, expect, it, vi } from "vitest";
import { editionPhotoPath, uploadEditionPhotos, type EditionUploadDeps } from "@/lib/newgang-media";

const CO = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const file = (n: string) => new File(["x"], n, { type: "image/jpeg" });

function deps(over: Partial<EditionUploadDeps> = {}) {
  let i = 0;
  const d: EditionUploadDeps & { paths: string[] } = {
    paths: [],
    companyId: async () => CO,
    convert: async () => new Blob(["w"], { type: "image/webp" }),
    upload: vi.fn(async (p: string) => { d.paths.push(p); return { error: null }; }),
    publicUrl: (p) => `https://x.supabase.co/storage/v1/object/public/portal-marketing-images/${p}`,
    save: vi.fn(async () => ({ error: null })),
    newId: () => `id${++i}`,
    toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
    ...over,
  };
  return d;
}
const ed = { brandKey: "newgang", year: 2024, gallery: [] as string[], coverUrl: null as string | null };

describe("fotos das edições Newgang", () => {
  it("caminho começa pelo company_id", () => {
    expect(editionPhotoPath(CO, "newgang", 2024, "abc")).toBe(`${CO}/festival-editions/newgang/2024/abc.webp`);
    expect(() => editionPhotoPath("", "newgang", 2024, "a")).toThrow();
  });

  it("sobe em sequência pela ordem, grava URL público e 1.ª como capa", async () => {
    const d = deps();
    const out = await uploadEditionPhotos([file("a.jpg"), file("b.jpg")], ed, d);
    expect(d.paths).toEqual([`${CO}/festival-editions/newgang/2024/id1.webp`, `${CO}/festival-editions/newgang/2024/id2.webp`]);
    expect(out[0]).toContain(`/object/public/portal-marketing-images/${CO}/`);
    expect(d.save).toHaveBeenCalledWith({ gallery_urls: out, cover_url: out[0] });
  });

  it("upload recusado → toast com a mensagem real e nada gravado", async () => {
    const d = deps({ upload: async () => ({ error: { message: "new row violates row-level security policy" } }) });
    const out = await uploadEditionPhotos([file("a.jpg")], ed, d);
    expect(out).toEqual([]);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.toast.error).toHaveBeenCalledWith(expect.stringContaining("row-level security"));
    expect(d.toast.success).not.toHaveBeenCalled();
  });

  it("falha a gravar a edição → toast e contador não sobe", async () => {
    const d = deps({ save: async () => ({ error: { message: "nenhuma linha gravada" } }) });
    const out = await uploadEditionPhotos([file("a.jpg")], ed, d);
    expect(out).toEqual([]);
    expect(d.toast.error).toHaveBeenCalledWith(expect.stringContaining("nenhuma linha gravada"));
  });

  it("respeita o máximo de 20 e avisa", async () => {
    const d = deps();
    const gallery = Array.from({ length: 19 }, (_, k) => `u${k}`);
    const out = await uploadEditionPhotos([file("a.jpg"), file("b.jpg")], { ...ed, gallery }, d);
    expect(out).toHaveLength(1);
    expect(d.toast.warning).toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledWith({ gallery_urls: [...gallery, out[0]] });
  });
});
