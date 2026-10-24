# Changelog

## 0.9.0

- added a pure JavaScript HCC2D reference encoder for Node.js
- aligned encoding behavior with the public C and Python reference encoders 0.9.0
- added standard QR, HCC2D4, and HCC2D8 output
- added raw and HCC2DF payload formats for text and files
- aligned defaults, validation limits, palettes, help, copyright, license,
  disclaimer, and specification references with the other official encoders
- added an importable ES module API and the `hcc2d-encoder` console command
- added regression tests for known QR, HCC2D4, and HCC2D8 outputs
- added an exhaustive 800-case C/Python/JavaScript comparison of dimensions,
  palettes, and decompressed PNG pixels
- added GitHub Actions CI for Node.js 18, 20, 22, and 24
- added npm package smoke testing and an OIDC Trusted Publishing workflow
