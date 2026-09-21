# Interactive models

Run `npm run dev` here to serve `/interactive-models/` on port 32003, independently of MongoDB. The CMS backend also serves this directory at `/interactive-models/` on port 32001. Deploy these public files behind a static server or CDN in production.

Each interactive model has an ID, versioned manifest, renderer-specific configuration, `whenToUse`, supported `studentEvents`, and an `examples` array. The Canvas medium reads the catalog and includes the compact manifest guidance in the live LLM prompt, so the tutor can select and format activities from examples. Remote JavaScript is never executed.

`cuboid-volume-01` uses 24 centimetre cubes. Its actions are `build-base`, `build-volume`, `same-volume`, and `reset`. Every stage names an absolute target state, so it can be replayed or called out of order.

The original lesson illustrates volume as layers, then rearranges the same cubes. Pedagogical references: [NSW Teaching Measurement, pp. 82–83](https://education.nsw.gov.au/content/dam/main-education/teaching-and-learning/curriculum/key-learning-areas/mathematics/media/documents/mathematics-s2-s3-teaching-measurement.pdf) and [Illustrative Mathematics: Filling Boxes](https://tasks.illustrativemathematics.org/practice-standards/3). No external models or lesson text are copied.
