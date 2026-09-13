# Teaching resources

Run `npm run dev` here to serve `/3d-models/` on port 32003, independently of MongoDB. The CMS backend also serves this directory at `/3d-models/` on port 32001. Deploy these public files behind a static server or CDN in production.

Each model has an ID, versioned manifest, renderer name, and a small dictionary of finite routines. Cuboid geometry is generated from data; there is no GLB download for this model. A future mesh renderer can consume GLB assets through the same resource server. Remote JavaScript is never executed.

`cuboid-volume-01` uses 24 centimetre cubes. Its actions are `build-base`, `build-volume`, `same-volume`, and `reset`. Every stage names an absolute target state, so it can be replayed or called out of order.

The original lesson illustrates volume as layers, then rearranges the same cubes. Pedagogical references: [NSW Teaching Measurement, pp. 82–83](https://education.nsw.gov.au/content/dam/main-education/teaching-and-learning/curriculum/key-learning-areas/mathematics/media/documents/mathematics-s2-s3-teaching-measurement.pdf) and [Illustrative Mathematics: Filling Boxes](https://tasks.illustrativemathematics.org/practice-standards/3). No external models or lesson text are copied.
