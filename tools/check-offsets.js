// Checks the scroll-offset loop: how many slices a capture takes and where
// each one is scrolled to. Regressions here produce clipped or duplicated
// bands in the output, which is expensive to diagnose from an image.

const { readBackground, extractFunction, createChecker } = require("./lib");

const nextSliceOffset = new Function(`${extractFunction(readBackground(), "nextSliceOffset")}; return nextSliceOffset;`)();
const MAX_SLICES = 60;

// grow(height, sliceNumber) models a page getting taller as it loads.
function run(step, initialHeight, grow) {
  let totalHeight = initialHeight;
  let y = 0;
  const offsets = [];
  while (y < totalHeight && offsets.length < MAX_SLICES) {
    const offset = nextSliceOffset(y, step, totalHeight);
    offsets.push(offset);
    totalHeight = Math.max(totalHeight, grow(totalHeight, offsets.length));
    y = offset + step;
  }
  return { offsets, totalHeight };
}

const none = (h) => h;
const check = createChecker("scroll offsets");

let r = run(850, 3400, none);
check("exact multiple: no overlap", r.offsets, [0, 850, 1700, 2550]);

r = run(850, 3494, none);
check("remainder: last slice clamps flush to the bottom", r.offsets, [0, 850, 1700, 2550, 2644]);

r = run(850, 400, none);
check("page shorter than the viewport: one slice", r.offsets, [0]);

// expresso.pt: the footer lazy-loads, so the page grows near the end.
r = run(850, 3400, (h, n) => (n === 4 ? 5000 : h));
check("page grows late: extra slices cover the new content", r.offsets, [0, 850, 1700, 2550, 3400, 4150]);
check("grown height is what the canvas gets sized from", r.totalHeight, 5000);

r = run(850, 3400, (h) => h + 2000);
check("infinite scroll stops at the cap", r.offsets.length, MAX_SLICES);

// Container mode steps by the panel's height, not the viewport's.
r = run(700, 4200, none);
check("container: steps by panel height", r.offsets, [0, 700, 1400, 2100, 2800, 3500]);

r = run(700, 4150, none);
check("container: last slice clamps to the panel bottom", r.offsets, [0, 700, 1400, 2100, 2800, 3450]);

process.exit(check.done());
