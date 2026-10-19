import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GmailAttachmentPicker from "../components/data-entry/GmailAttachmentPicker";
import type { DataEntryAdapter, GmailConnectionStatus } from "../lib/data-entry-client";

describe("Gmail own-context isolation", () => {
  it("drops the old mailbox state and ignores its late response after company changes", async () => {
    let finish: ((value: GmailConnectionStatus) => void) | undefined;
    const adapter = { gmailSearch: vi.fn(), gmailImport: vi.fn(), gmailConnection: vi.fn()
      .mockImplementationOnce(() => new Promise<GmailConnectionStatus>(resolve => { finish = resolve; }))
      .mockResolvedValue({ linked: true, reconnect_required: false, mailbox_email: "new@example.invalid" }) } as unknown as DataEntryAdapter;
    const props = { adapter, sessionId: "local", enabled: true, disabled: false, onImported: vi.fn() };
    const view = render(<GmailAttachmentPicker {...props} context={{ user_id: "user-a", company_id: "company-a" }} />);
    view.rerender(<GmailAttachmentPicker {...props} context={{ user_id: "user-b", company_id: "company-b" }} />);
    await waitFor(() => expect(screen.queryByText(/new@example.invalid/)).not.toBeNull());
    if (!finish) throw new Error("missing pending request");
    finish({ linked: true, reconnect_required: false, mailbox_email: "old@example.invalid" });
    await waitFor(() => expect(screen.queryByText(/old@example.invalid/)).toBeNull());
    expect(adapter.gmailConnection).toHaveBeenLastCalledWith({ user_id: "user-b", company_id: "company-b" });
  });
});