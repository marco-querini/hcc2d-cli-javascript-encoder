# Contributing

Contributions should preserve interoperability, predictable output, and the
small dependency-free surface of the package.

## Before opening a change

- discuss format changes before implementing them;
- do not alter normative HCC2D behavior without a corresponding published
  specification update;
- keep the runtime dependency list empty unless there is a compelling,
  documented reason;
- do not add telemetry, network access, install scripts, or dynamic downloads;
- use JavaScript, not TypeScript or generated WebAssembly.

## Development checks

```bash
npm ci
npm test
npm run test:reference
npm pack --dry-run
```

Changes to encoding logic must include regression coverage and pass the
842-image comparison and the 12 exact rejection-boundary checks against the C
and Python reference encoders. Changes to PNG compression may produce
different compressed bytes, but decompressed indexed pixels, dimensions, and
palette entries must remain identical.

Keep public API names documented in README.md and record user-visible changes
in CHANGELOG.md. Never commit generated PNGs, npm tarballs, credentials, local
environment files, or `node_modules`.
