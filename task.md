# Tasks

- `[x]` Implement Color Eyedropper Sampler in `imageSegmenter.ts` & `SegmentMapper.tsx`
  - `[x]` Add optional `sampledColor: { r: number, g: number, b: number }` and `tolerance` parameters to `extractImageSegments`
  - `[x]` Perform Euclidean color distance binarization if `sampledColor` is provided
  - `[x]` Add interactive click handler to main logo preview image in `SegmentMapper.tsx` to extract RGB color
  - `[x]` Add Color Tolerance slider in UI to control color-matching threshold dynamically
- `[x]` Implement Interactive Canvas Scissors/Splitter Modal in `SegmentMapper.tsx`
  - `[x]` Create a modal dialog when a segment is clicked for split editing
  - `[x]` Render the cropped segment scaled-up on an interactive canvas
  - `[x]` Support mouse/touch drawing in `#0f0f12` background color to erase/cut connecting lines between touching letters
  - `[x]` Add slider to adjust scissor brush thickness
  - `[x]` On split confirmation, re-run `extractImageSegments` on the modified crop segment canvas and replace the original segment with the newly sliced sub-segments
- `[x]` Verify Scissors & Eyedropper Slicing with Touching Letters
  - `[x]` Upload a connected script logo (like Coca-Cola)
  - `[x]` Click on the red letter stroke to sample color and binarize
  - `[x]` Open the Scissors Split Modal for connected letters and cut them apart
  - `[x]` Confirm the segments are successfully broken into individual letter crops
  - `[x]` Map characters, compile, and type in Sandbox
