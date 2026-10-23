/** Renders an element to a PNG Blob. Elements marked data-no-capture are left out. */
export async function captureElement(element, { background }) {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: background,
    ignoreElements: (node) => node.dataset?.noCapture !== undefined,
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Screenshot unavailable."))),
      "image/png",
    ),
  );
}
