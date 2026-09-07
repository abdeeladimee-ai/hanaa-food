# Hanaa Food

Hanaa Food uses Leaflet with OpenStreetMap tiles, Nominatim address search, and OSRM driving routes. No Google Maps API key or billing account is required.

Before using branch markers and route distances, open **Administration** and enter the exact latitude and longitude for each branch. The same screen controls branch status, service availability, and editable delivery-zone fees; settings are stored in the browser for this development version.

## Development

```sh
npm install
npm run dev
```

Use a Moroccan phone number in the format `06XXXXXXXX`, `07XXXXXXXX`, `+2126XXXXXXXX`, or `+2127XXXXXXXX` at checkout.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
