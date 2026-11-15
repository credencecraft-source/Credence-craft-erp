export type PdfPrintPreviewWindow = {
  show: (blob: Blob, filename: string) => void;
  showError: (message: string) => void;
};

export function openPdfPrintPreviewWindow(title: string): PdfPrintPreviewWindow | null {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) return null;

  const previewDocument = previewWindow.document;
  const styles = getComputedStyle(window.document.documentElement);
  const tokens = ["erp-surface", "erp-surface-soft", "erp-border", "erp-text", "erp-muted", "erp-brand", "erp-danger"]
    .map((token) => `--${token}: ${styles.getPropertyValue(`--${token}`).trim()};`)
    .join("");
  previewDocument.open();
  previewDocument.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Print Preview</title>
        <style>
          :root { ${tokens} }
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; }
          body { display: flex; flex-direction: column; background: var(--erp-surface-soft); color: var(--erp-text); font-family: Arial, sans-serif; }
          header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3.5rem; padding: 0.5rem 1rem; background: var(--erp-surface); border-bottom: 1px solid var(--erp-border); }
          h1 { margin: 0; font-size: 1rem; font-weight: 600; }
          #status { color: var(--erp-muted); font-size: 0.875rem; }
          #download { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border: 1px solid var(--erp-border); border-radius: 0.5rem; background: var(--erp-surface); color: var(--erp-text); cursor: pointer; }
          #download:disabled { cursor: wait; opacity: 0.5; }
          #download:focus-visible { outline: 2px solid var(--erp-brand); outline-offset: 2px; }
          iframe { flex: 1; width: 100%; min-height: 0; border: 0; background: var(--erp-surface-soft); }
          #error { display: none; padding: 1rem; color: var(--erp-danger); }
        </style>
      </head>
      <body>
        <header>
          <div><h1 id="title"></h1><span id="status">Preparing print view…</span></div>
          <button id="download" type="button" aria-label="Download PDF" title="Download PDF" disabled>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <path d="m7 10 5 5 5-5"></path>
              <path d="M12 15V3"></path>
            </svg>
          </button>
        </header>
        <p id="error" role="alert"></p>
        <iframe title="Print preview"></iframe>
      </body>
    </html>`);
  previewDocument.close();

  const titleElement = previewDocument.getElementById("title");
  const statusElement = previewDocument.getElementById("status");
  const downloadButton = previewDocument.getElementById("download") as HTMLButtonElement | null;
  const errorElement = previewDocument.getElementById("error");
  const frame = previewDocument.querySelector<HTMLIFrameElement>("iframe");
  if (!titleElement || !statusElement || !downloadButton || !errorElement || !frame) {
    previewWindow.close();
    return null;
  }

  titleElement.textContent = title;
  previewDocument.title = `${title} - Print Preview`;
  let objectUrl: string | null = null;
  previewWindow.addEventListener("beforeunload", () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, { once: true });

  let downloadFilename = "document.pdf";
  downloadButton.addEventListener("click", () => {
    if (!objectUrl || previewWindow.closed) return;
    const anchor = previewDocument.createElement("a");
    anchor.href = objectUrl;
    anchor.download = downloadFilename;
    previewDocument.body.append(anchor);
    anchor.click();
    anchor.remove();
  });

  return {
    show(blob, filename) {
      if (previewWindow.closed) return;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      downloadFilename = filename;
      frame.src = `${objectUrl}#toolbar=0&navpanes=0`;
      statusElement.textContent = "Print view ready";
      downloadButton.disabled = false;
      downloadButton.title = `Download ${filename}`;
    },
    showError(message) {
      if (previewWindow.closed) return;
      statusElement.textContent = "";
      errorElement.textContent = message;
      errorElement.style.display = "block";
    },
  };
}
