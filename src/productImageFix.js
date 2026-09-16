const productImageFallbacks = {
  '/products/dessert-salade-fruit.jpg': '/products/desserts/salade-fruits.png',
};

document.addEventListener(
  'error',
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;

    const source = image.getAttribute('src') || '';
    const fallback = productImageFallbacks[source];
    if (!fallback || source === fallback) return;

    image.src = fallback;
  },
  true,
);
