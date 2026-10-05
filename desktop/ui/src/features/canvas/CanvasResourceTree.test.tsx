// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasResourceTree, type CanvasDocument } from "./CanvasResourceTree";

const fetchMock = vi.fn();
vi.mock("@/api/request-activity", () => ({ trackedFetch: (...args: unknown[]) => fetchMock(...args) }));
afterEach(() => { cleanup(); fetchMock.mockReset(); });

const documents = ["First", "Second"].map((title, index) => ({ id: String(index + 1), channelId: "c", title, folderId: null, schemaVersion: 1, lastServerSeq: 0, canEdit: true, updatedAt: "" })) as CanvasDocument[];

it("moves a document before a sibling using the durable position route", async () => {
  fetchMock.mockResolvedValue({ ok: true });
  render(<CanvasResourceTree channelId="c" documents={documents} folders={[]} onSelect={vi.fn()} onChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()} />);
  const first = screen.getByText("First").closest("[draggable]")!;
  const second = screen.getByText("Second").closest("[draggable]")!;
  const dataTransfer = { setData: vi.fn(), getData: () => "2", effectAllowed: "move" };
  fireEvent.dragStart(second, { dataTransfer });
  fireEvent.dragOver(first, { dataTransfer });
  fireEvent.drop(first, { dataTransfer });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/canvases/2/position", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: null, index: 0 }) }), expect.anything()));
});

it("requires confirmation before archiving a document", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue({ ok: true });
  render(<CanvasResourceTree channelId="c" documents={documents} folders={[]} onSelect={vi.fn()} onChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Delete First" }));
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete document" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/canvases/1", expect.objectContaining({ method: "DELETE" }), expect.anything()));
});

it("moves a document into a folder", async () => {
  fetchMock.mockResolvedValue({ ok: true });
  render(<CanvasResourceTree channelId="c" documents={documents} folders={[{ id: "folder", channelId: "c", parentFolderId: null, name: "Plans", createdAt: "", updatedAt: "" }]} onSelect={vi.fn()} onChanged={vi.fn().mockResolvedValue(undefined)} onError={vi.fn()} />);
  const source = screen.getByText("First").closest("[draggable]")!;
  const target = screen.getByText("Plans").parentElement!;
  const dataTransfer = { setData: vi.fn(), getData: () => "1", effectAllowed: "move" };
  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/v1/canvases/1/position", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: "folder", index: 0 }) }), expect.anything()));
});
