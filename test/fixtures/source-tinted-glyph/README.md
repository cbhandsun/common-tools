Source fixture: a lossless 30 x 30 pixel crop of the user-provided screenshot,
at source coordinates (48, 1180). No recoloring or background repair was applied.
The independent model localizations are recorded in source-local-glyph.test.js,
translated by that crop origin. They both measure the same 66-pixel component.

This fixture tests source measurement and duplicate ownership rejection. It
does not assert that the existing native icon vectorizer preserves the glyph.
