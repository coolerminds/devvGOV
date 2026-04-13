import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const agriculture = {
  slug: "agriculture-department",
  name: "Department of Agriculture",
  wordCount: 1200,
  checksum: "aaaaaaaaaabbbbbbbbbbccccccccccdddddddddd",
  topicCount: 4,
  latestAmendedOn: "2026-04-09",
};

const environmental = {
  slug: "environmental-protection-agency",
  name: "Environmental Protection Agency",
  wordCount: 980,
  checksum: "eeeeeeeeeefffffffffgggggggggghhhhhhhhhh",
  topicCount: 2,
  latestAmendedOn: "2026-04-08",
};

const agricultureDetail = {
  agency: agriculture,
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

const environmentalDetail = {
  agency: environmental,
  history: [{ month: "2026-04-01", amendmentCount: 5, removalCount: 0 }],
  topics: [
    {
      id: 40,
      title: 40,
      chapter: "I",
      wordCount: 220,
      checksum: "def456def456def456def456def456def456",
      viewCount: 0,
      previewText: "EPA topic preview text.",
    },
  ],
};

test("renders dashboard, opens topics, and imports agencies through new analysis", async () => {
  let importedAgencies = [agriculture];
  let importedOverview = [
    {
      agency: agriculture,
      history: [{ month: "2026-04-01", amendmentCount: 3, removalCount: 1 }],
    },
  ];
  let importedCatalog = [
    { slug: agriculture.slug, name: agriculture.name, shortName: "USDA", imported: true },
    { slug: environmental.slug, name: environmental.name, shortName: "EPA", imported: false },
  ];
  const importController: { resolve?: (value: Response) => void } = {};
  const importRequest = new Promise<Response>((resolve) => {
    importController.resolve = resolve;
  });

  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/api/admin/agencies") && !init?.method) {
      return Promise.resolve(new Response(JSON.stringify(importedCatalog)));
    }
    if (url.endsWith("/api/overview/history")) {
      return Promise.resolve(new Response(JSON.stringify(importedOverview)));
    }
    if (url.endsWith("/api/agencies/agriculture-department")) {
      return Promise.resolve(new Response(JSON.stringify(agricultureDetail)));
    }
    if (url.endsWith("/api/agencies/environmental-protection-agency")) {
      return Promise.resolve(new Response(JSON.stringify(environmentalDetail)));
    }
    if (url.endsWith("/api/agencies")) {
      return Promise.resolve(new Response(JSON.stringify(importedAgencies)));
    }
    if (url.endsWith("/api/topics/7/view")) {
      return Promise.resolve(new Response(JSON.stringify({ viewCount: 3 })));
    }
    if (url.endsWith("/api/admin/agencies/import")) {
      importedAgencies = [agriculture, environmental];
      importedOverview = [
        ...importedOverview,
        {
          agency: environmental,
          history: [{ month: "2026-04-01", amendmentCount: 5, removalCount: 0 }],
        },
      ];
      importedCatalog = [
        { slug: agriculture.slug, name: agriculture.name, shortName: "USDA", imported: true },
        { slug: environmental.slug, name: environmental.name, shortName: "EPA", imported: true },
      ];
      return importRequest;
    }
    throw new Error(`Unhandled fetch ${url}`);
  });

  render(<App />);

  expect(await screen.findByRole("heading", { name: "Advanced Regulatory Dashboard" })).toBeInTheDocument();
  expect(await screen.findByText("Topics loaded")).toBeInTheDocument();
  expect(screen.queryByText("Add agencies to this workspace")).not.toBeInTheDocument();

  const topicPreview = (await screen.findAllByText("Current topic preview text."))[0];
  fireEvent.click(topicPreview.closest("button") as HTMLButtonElement);
  await waitFor(() => expect(screen.getByText("3 live views")).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /New analysis/i }));
  expect(await screen.findByRole("dialog", { name: /Add agencies to this workspace/i })).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("Search by agency, short name, or slug"), {
    target: { value: "environment" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Environmental Protection Agency/i }));
  fireEvent.click(screen.getByRole("button", { name: /^Import 1$/i }));

  expect(await screen.findByRole("status", { name: /Importing selected agencies/i })).toBeInTheDocument();
  expect(screen.getByText("Building your new analysis workspace")).toBeInTheDocument();
  expect(await screen.findAllByText("Environmental Protection Agency")).not.toHaveLength(0);

  const completeImport = importController.resolve;
  if (!completeImport) {
    throw new Error("Import resolver was not initialized");
  }
  completeImport(new Response(JSON.stringify({ agencies: 1, topics: 1 })));

  await waitFor(() => expect(screen.queryByRole("dialog", { name: /Add agencies to this workspace/i })).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByRole("status", { name: /Importing selected agencies/i })).not.toBeInTheDocument());
  expect(await screen.findAllByRole("button", { name: /Environmental Protection Agency/i })).not.toHaveLength(0);
});
