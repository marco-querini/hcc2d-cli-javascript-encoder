# Changelog

## 0.9.0-rc.1

- added a pure JavaScript HCC2D reference encoder for Node.js
- aligned encoding behavior with the public C and Python reference encoders 0.9.0
- added standard QR, HCC2D4, and HCC2D8 output
- added raw and HCC2DF payload formats for text and files
- aligned defaults, validation limits, palettes, help, copyright, license,
  disclaimer, and specification references with the other official encoders
- added an importable ES module API and the `hcc2d-encoder` console command
- added regression tests for known QR, HCC2D4, and HCC2D8 outputs
- added 842 C/Python/JavaScript parity cases covering every forced version,
  binary capacity boundaries, automatic selection, multi-block symbols, and
  decompressed PNG output, plus 12 exact overflow-rejection checks
- added GitHub Actions CI for supported Node.js 22 and 24 LTS releases and
  Node.js 26 Current, with npm 12.2.1 for release automation
- added npm package smoke testing and an OIDC Trusted Publishing workflow with
  immutable action and reference-encoder revisions
