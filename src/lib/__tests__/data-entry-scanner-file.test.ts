import { it, expect, vi } from "vitest";
import { prepareDataEntryScannerFile } from "../data-entry-scanner-file";
const mocks = vi.hoisted(() => ({ normalize: vi.fn(), prepare: vi.fn() }));
vi.mock("../image-upload", () => ({ normalizeImageFile: mocks.normalize }));
vi.mock("../invoice-ocr-prepare", () => ({ prepareFileForInvoiceOcr: mocks.prepare }));
it("keeps PDF bytes original, never silently uses scanner first-page conversion", async () => {
  const pdf = new File(["%PDF local"], "local.pdf", { type: "application/pdf" });
  expect(await prepareDataEntryScannerFile(pdf)).toBe(pdf);
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("reuses image normalization then preparation and returns derivative as a new file", async () => {
  const original = new File(["HEIC-local"], "local.heic", { type: "image/heic" });
  const normalized = new File(["JPEG-local"], "local.jpg", { type: "image/jpeg" });
  const prepared = new File(["JPEG-prepared"], "local-ocr.jpg", { type: "image/jpeg" });
  mocks.normalize.mockResolvedValue(normalized); mocks.prepare.mockResolvedValue({ ok: true, file: prepared });
  expect(await prepareDataEntryScannerFile(original)).toBe(prepared);
  expect(mocks.normalize).toHaveBeenCalledWith(original); expect(mocks.prepare).toHaveBeenCalledWith(normalized);
  expect(prepared).not.toBe(original);
});