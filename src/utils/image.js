/**
 * Converte a imagem escolhida pelo usuário em uma capa pequena (JPEG em
 * data URL), para caber no localStorage: ~360 px de largura, ~20–60 KB.
 * Só funciona no navegador (usa canvas).
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível ler esta imagem. Tente outro arquivo.'));
    image.src = src;
  });
}

export async function fileToCoverDataUrl(file, { maxWidth = 360, maxHeight = 540, quality = 0.82 } = {}) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
    throw new Error('Escolha uma imagem JPG, PNG, WebP ou GIF.');
  }
  if (file.size > MAX_FILE_BYTES) throw new Error('A imagem deve ter no máximo 10 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#131826'; // fundo para PNG transparente
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
