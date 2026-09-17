export const functionGraphLesson={
  label:'Function graph — plot y = 2x − 3',
  response:`model: function-graph
/equation: y = 2*x - 3
/action: ask
/targets: 2,3,4
/x-range: -5,7
/y-range: -5,7
/snap: 1
parallel:start
write: y = 2x − 3
speak: Every point on this graph is an x and y pair that makes our equation true. Start with x equals 2. Multiply it by 2, then subtract 3 to find y.
parallel:end
write: Plot the points for x = 2, 3, and 4.
speak: Move your crosshair to your answer, then tap to place the point. On a tablet, slide to aim and lift your finger to place it.
`,
};

export const functionGraphExploreLesson={label:'Explore a linear function',response:`model: function-graph
/equation: y = 2*x - 3
/action: plot
/x-range: -5,7
/y-range: -5,7
write: y = 2x − 3
speak: Move across the graph. The dot follows the line and shows an x and y pair. What changes when you move one step to the right?
`};
