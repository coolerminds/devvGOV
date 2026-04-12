# Submission Notes

## Fit For This Assessment
My background fits this exercise well because it combines three things I do often:
- data ingestion from external public APIs
- backend aggregation and API design
- building thin operator-facing UIs that make dense information easier to scan and act on

This implementation intentionally favors a small, defensible architecture over a broader feature set.

## Duration
- Replace with your actual completion time before submitting.
- Suggested placeholder: `~4 hours excluding setup`

## Frontend Link
- Local development URL: [http://127.0.0.1:4173](http://127.0.0.1:4173)
- No hosted deployment is included in this submission.

## Screenshots
- Agriculture view:

![Agriculture view](/Users/blahz/Documents/devv/uss/artifacts/ui-screenshot.png)

- EPA view:

![EPA view](/Users/blahz/Documents/devv/uss/artifacts/ui-screenshot-epa.png)

Note: these screenshots use a seeded local PostgreSQL dataset so the UI could be captured immediately. The real eCFR import flow is implemented through the backend importer and the `Refresh eCFR data` action.

## Architecture Tradeoffs
- Kept Spring Boot instead of switching to Python/FastAPI because it matches the requested stack and is straightforward to explain in an interview.
- Used direct JDBC access instead of JPA to keep the codebase small and explicit.
- Stored raw XML plus derived metrics in PostgreSQL so the frontend reads only server-side data after import.
- Modeled historical analysis as monthly substantive amendment and removal counts, which is cheaper and clearer than rebuilding full word-count snapshots over time.

## AI Usage
- AI was used to accelerate implementation planning, scaffold repetitive code structure, and tighten tests and docs.
- All architectural choices, endpoint behavior, and code changes were reviewed and adjusted in the repo during implementation.

