---
applyTo: "**/*"
---

# ScaledTest Product Vision

**ALWAYS keep these principles in mind when working on ScaledTest.**

---

## What is ScaledTest?

ScaledTest is a **distributed test execution and management platform** that runs tests in isolated Kubernetes pods. It is **framework-agnostic** — any test framework (Playwright, Jest, pytest, JUnit, etc.) works as long as results are reported in CTRF format.

**Target users:** QA teams, DevOps engineers, and development teams who need to scale test execution across distributed infrastructure.

---

## Core Principles

1. **Kubernetes-Native** — Tests run as K8s Indexed Jobs. Each test gets its own pod for isolation and parallelism. Never assume tests run locally.

2. **Framework-Agnostic** — The platform doesn't care what test framework you use. It only cares about CTRF results and the Runner Contract.

3. **CTRF is the Standard** — All test results MUST use [CTRF (Common Test Report Format)](https://ctrf.io). Never invent custom result formats or store raw framework output.

4. **Runner Contract** — Test containers implement a simple contract: read env vars (`BASE_URL`, `TEST_ID`, `API_URL`, `API_TOKEN`), run tests, upload CTRF results. See `containers/TEST_RUNNER_CONTRACT.md`.

5. **Dogfooding** — ScaledTest runs its own tests through the platform. The `test-all.sh` script demonstrates this — frontend Playwright tests execute via K8s, not locally.

6. **gRPC-First API** — All APIs are defined in Protocol Buffers first. REST is auto-generated via grpc-gateway. Never create REST-only endpoints.

7. **Artifacts are First-Class** — Screenshots, videos, traces, and logs are uploaded via API and stored for debugging. They're not optional metadata.

---

## Domain Glossary

| Term | Definition |
|------|------------|
| **Project** | Top-level organizational unit. Contains clusters, registries, and test configurations. |
| **Cluster** | A configured Kubernetes cluster where tests execute. Has auth credentials and runner settings. |
| **Container Registry** | Docker registry configuration (Docker Hub, GCR, ECR) for pulling test images. |
| **Test Image** | Docker image containing test code and framework. Implements the Runner Contract. |
| **Test Run** | A complete execution session. Groups multiple test jobs under one run ID. |
| **Test Job** | A single K8s Indexed Job. Creates N pods for N tests to run in parallel. |
| **Artifacts** | Test outputs: screenshots, videos, traces, logs. Uploaded via API during/after test execution. |
| **CTRF Report** | Standardized JSON test results. Contains summary (passed/failed/skipped) and individual test cases. |
| **Runner Contract** | The interface between ScaledTest and test containers. Defines required env vars and result format. |

---

## What ScaledTest is NOT

- **NOT a CI/CD system** — It integrates with CI/CD (GitHub Actions, Jenkins, etc.) but doesn't replace them.
- **NOT a test framework** — It orchestrates frameworks, not replaces them. Use Playwright, Jest, pytest, etc.
- **NOT a hosting platform** — It doesn't host your application. Tests connect to your existing staging/production/local environments.
- **NOT for unit tests** — Designed for integration, E2E, and system tests that benefit from isolation and parallelism.

---

## Key References

- **Runner Contract:** `containers/TEST_RUNNER_CONTRACT.md` — How test containers integrate with the platform
- **CTRF Format:** https://ctrf.io — The required test result format
- **Self-Testing:** `test-all.sh` — Example of dogfooding (running tests via the platform)

---

## Maintenance

**Keep this file updated** when:
- New domain concepts are added (new proto messages, new entities)
- Core architectural decisions change
- The Runner Contract evolves

This file is the "north star" for understanding ScaledTest's purpose.
