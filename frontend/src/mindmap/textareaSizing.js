export const resizeTextareaToContent = (element) => {
  if (!element?.style) return 0;
  // Reset first so scrollHeight can also shrink when text is deleted.
  element.style.height = "0px";
  const height = Math.max(1, Number(element.scrollHeight) || 0);
  element.style.height = `${height}px`;
  element.scrollTop = 0;
  return height;
};
