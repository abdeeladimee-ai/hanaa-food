# Project Instructions

## Scope
- This is a React 19 application built with Vite and JavaScript/JSX.
- The application source lives in `src/`; no `scr/` directory exists. Treat `scr` references as `src` unless the user explicitly requests a new directory.
- Keep changes focused on the requested behavior and preserve the existing Vite structure.

## Code Organization
- Use `src/main.jsx` as the browser entry point.
- Put page-level composition in `src/App.jsx` and shared global styles in `src/index.css`.
- Keep component-specific styles in `src/App.css` or a nearby stylesheet.
- Store imported app assets in `src/assets/`; store directly served static files in `public/`.

## Development Workflow
- Install dependencies with `npm install` when needed.
- Run the development server with `npm run dev`.
- Run `npm run lint` after JavaScript, JSX, or configuration changes.
- Run `npm run build` to verify the production bundle.
- There is currently no test script or testing framework; do not claim tests were run when only lint/build validation was performed.

## Conventions
- Follow the existing ESLint configuration and React Hooks rules.
- Use functional React components and ES module imports.
- Do not add TypeScript, routing, state-management libraries, or a new UI framework unless the task requires it.
- Update [README.md](README.md) when setup or user-facing project behavior changes.