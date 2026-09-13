export const cuboidLesson = {
  label: 'Volume — how many cubes are hiding inside?',
  response:
    `speak: Let’s discover how much space a cuboid takes up. We will measure it with cubes that are one centimetre on every side.
model3d: cuboid-volume-01
/position: 160,80
speak: This cuboid is four centimetres long, three centimetres wide, and two centimetres high. Watch us build the bottom layer.
model3d: cuboid-volume-01
/action: build-base
write: 4 × 3 = 12 cubes in one layer
/position: 760,120
speak: Four cubes in each row, and three rows. That makes twelve cubes in one layer.
ask: There are two layers. How many cubes will fill the whole cuboid?
/position: 760,220
speak: Let’s check by building the second layer. It has the same twelve cubes as the first.
model3d: cuboid-volume-01
/action: build-volume
write: 12 × 2 = 24 cubes
/position: 760,360
speak: All twenty-four cubes fit together without gaps or overlaps. Each one takes up one cubic centimetre.
write: V = 4 × 3 × 2 = 24 cm³
/position: 760,440
speak: Length times width tells us how many cubes are in a layer. Multiplying by height counts all the layers.
write: Volume = length × width × height
/position: 160,570
ask: If we rearrange these same cubes into a longer cuboid, will its volume change? Why?
/position: 160,660
speak: Watch the same twenty-four cubes move. None are added or taken away.
model3d: cuboid-volume-01
/action: same-volume
speak: The dimensions change, but the number of cubes stays the same. All these cuboids have a volume of twenty-four cubic centimetres.
write: 4 × 3 × 2 = 6 × 2 × 2 = 8 × 3 × 1
/position: 160,800
ask: A new cuboid is five centimetres long, two wide, and three high. What is its volume? Explain how you counted the layers.
/position: 160,950`
};
