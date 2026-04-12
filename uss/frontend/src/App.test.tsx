import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const agencies = [
  {
    slug: "agriculture-department",
    name: "Department of Agriculture",
    wordCount: 1200,
    checksum: "aaaaaaaaaabbbbbbbbbbccccccccccdddddddddd",
    topicCount: 4,
    latestAmendedOn: "2026-04-09",
  },
];

const detail = {
  agency: agencies[0],
  history: [{ month: "2026-04-01", amendmentCount: 3, removalCount: 1 }],
  topics: [
    {
      id: 7,
      title: 7,
      chapter: "I",
      wordCount: 300,
      checksum: "abc123abc123abc123abc123abc123abc123",
      viewCount: 2,
      previewText: "Current topic preview text.",
    },
  ],
};

const overview = [
  {
    agency: agencies[0],
    history: [{ month: "2026-04-01", amendmentCount: 3, removalCount: 1 }],
  },
];

test("renders agencies and selected detail", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/overview/history")) {
      return Promise.resolve(new Response(JSON.stringify(overview)));
    }
    if (url.endsWith("/api/agencies/agriculture-department")) {
      return Promise.resolve(new Response(JSON.stringify(detail)));
    }
    if (url.endsWith("/api/agencies")) {
      return Promise.resolve(new Response(JSON.stringify(agencies)));
    }
    if (url.endsWith("/api/topics/7/view")) {
      return Promise.resolve(new Response(JSON.stringify({ viewCount: 3 })));
    }
    if (init?.method === "POST" && url.endsWith("/api/admin/import")) {
      return Promise.resolve(new Response(JSON.stringify({ agencies: 1, topics: 1 })));
    }
    throw new Error(`Unhandled fetch ${url}`);
  });

  render(<App />);
  expect(await screen.findByRole("heading", { name: "Advanced Regulatory Dashboard" })).toBeInTheDocument();
  expect(await screen.findByText("Mandate intensity heatmap")).toBeInTheDocument();
  expect(await screen.findByText("Recent regulatory movements")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Title 7 \/ Chapter I/i }));
  await waitFor(() => expect(screen.getByText("3 live views")).toBeInTheDocument());
});
