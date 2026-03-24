# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Fixed

- **`no_new_failures` quality gate**: `fetchPreviousFailedTests` now returns a proper error on database failures instead of silently returning an empty baseline. Previously, a transient DB error would cause the gate to treat all current failures as "new" and incorrectly fail the evaluation. The `POST /evaluate` endpoint now returns HTTP 500 on such errors rather than producing a wrong result.

### Added

- **Dark color theme**: The ScaledTest UI now ships with a fully defined dark theme. Tailwind v4 CSS custom properties are declared in `frontend/src/index.css` under `@theme`, covering background, foreground, card, border, primary, secondary, accent, destructive, success, and warning tokens. Base styles apply the theme globally to `body`, links, and headings with smooth scrolling.
