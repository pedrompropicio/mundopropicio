import { describe, it, expect } from "vitest";
import {
  hasVideoExtension,
  isPlayableVideo,
  classifyCreative,
  metaAdsManagerUrl,
} from "../creative-media";

// URLs representativas dos dados reais em crm.meta_creatives
const MP4_REAL = "https://sfohvv.supabase.co/storage/v1/object/public/crm-meta-creatives/abc.mp4";
const FB_THUMB = "https://www.facebook.com/ads/image/?d=AQLabc123def456";
const JPG_IMG = "https://example.com/banner.jpg";

describe("hasVideoExtension", () => {
  it("deteta .mp4 / .mov / .webm", () => {
    expect(hasVideoExtension("x.mp4")).toBe(true);
    expect(hasVideoExtension("x.mov")).toBe(true);
    expect(hasVideoExtension("x.webm")).toBe(true);
  });
  it("é case-insensitive", () => {
    expect(hasVideoExtension("VIDEO.MP4")).toBe(true);
    expect(hasVideoExtension("Clip.MoV")).toBe(true);
  });
  it("ignora query string e fragmento", () => {
    expect(hasVideoExtension("https://s/abc.mp4?token=xyz&exp=123")).toBe(true);
    expect(hasVideoExtension("https://s/abc.mov#t=10")).toBe(true);
  });
  it("não deteta imagens nem URLs do endpoint /ads/image/", () => {
    expect(hasVideoExtension(JPG_IMG)).toBe(false);
    expect(hasVideoExtension(FB_THUMB)).toBe(false);
    expect(hasVideoExtension("x.png")).toBe(false);
    expect(hasVideoExtension("x.webp")).toBe(false);
  });
  it("não deteta extensão parcial enganosa (.mp4xyz)", () => {
    expect(hasVideoExtension("https://s/file.mp4xyz")).toBe(false);
  });
  it("lida com null/undefined/vazio", () => {
    expect(hasVideoExtension(null)).toBe(false);
    expect(hasVideoExtension(undefined)).toBe(false);
    expect(hasVideoExtension("")).toBe(false);
  });
});

describe("isPlayableVideo", () => {
  it("vídeo real: mime video/* -> true", () => {
    expect(isPlayableVideo(MP4_REAL, "video", "video/mp4")).toBe(true);
  });
  it("vídeo real: sem mime mas extensão de vídeo -> true (fallback)", () => {
    expect(isPlayableVideo(MP4_REAL, "video", null)).toBe(true);
  });
  it("thumbnail do Meta (type video, sem mime, /ads/image/) -> false", () => {
    expect(isPlayableVideo(FB_THUMB, "video", null)).toBe(false);
  });
  it("imagem (banner/unknown) -> false", () => {
    expect(isPlayableVideo(JPG_IMG, "banner", "image/jpeg")).toBe(false);
    expect(isPlayableVideo(JPG_IMG, "unknown", "image/jpeg")).toBe(false);
  });
  it("mime de vídeo vence extensão de imagem", () => {
    expect(isPlayableVideo("https://s/weird.jpg", "video", "video/mp4")).toBe(true);
  });
  it("sem file_url -> false", () => {
    expect(isPlayableVideo(null, "video", "video/mp4")).toBe(false);
    expect(isPlayableVideo(undefined, "video", null)).toBe(false);
  });
});

describe("classifyCreative", () => {
  it("vídeo reproduzível -> 'video'", () => {
    expect(classifyCreative(MP4_REAL, "video", "video/mp4")).toBe("video");
    expect(classifyCreative(MP4_REAL, "video", null)).toBe("video");
  });
  it("type video sem ficheiro reproduzível -> 'thumbnail'", () => {
    expect(classifyCreative(FB_THUMB, "video", null)).toBe("thumbnail");
    expect(classifyCreative(FB_THUMB, "video", "image/jpeg")).toBe("thumbnail");
  });
  it("banner / unknown com imagem -> 'image'", () => {
    expect(classifyCreative(JPG_IMG, "banner", "image/jpeg")).toBe("image");
    expect(classifyCreative(JPG_IMG, "unknown", "image/png")).toBe("image");
  });
  it("sem file_url -> 'placeholder' (mesmo com type video)", () => {
    expect(classifyCreative(null, "video", "video/mp4")).toBe("placeholder");
    expect(classifyCreative("", "banner", "image/jpeg")).toBe("placeholder");
  });
});

describe("metaAdsManagerUrl", () => {
  it("remove prefixo act_ e constrói URL ao nível da conta", () => {
    expect(metaAdsManagerUrl("act_5094207367314169")).toBe(
      "https://business.facebook.com/adsmanager/manage/ads?act=5094207367314169",
    );
  });
  it("aceita id já sem prefixo", () => {
    expect(metaAdsManagerUrl("5094207367314169")).toBe(
      "https://business.facebook.com/adsmanager/manage/ads?act=5094207367314169",
    );
  });
  it("devolve null sem ad_account_id", () => {
    expect(metaAdsManagerUrl(null)).toBeNull();
    expect(metaAdsManagerUrl(undefined)).toBeNull();
    expect(metaAdsManagerUrl("")).toBeNull();
    expect(metaAdsManagerUrl("act_")).toBeNull();
  });
});
