export class BookCoverService {
  async lookupCover(title: string): Promise<Blob | undefined> {
    const cleaned = (title || "").trim();
    if (!cleaned) return undefined;

    const params = new URLSearchParams({ title: cleaned });
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(`/api/covers/lookup?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
      });
      if (response.status === 204) return undefined;
      if (!response.ok) return undefined;
      const blob = await response.blob();
      if (!blob || blob.size === 0) return undefined;
      if (blob.type && !blob.type.startsWith("image/")) return undefined;
      return blob;
    } catch {
      return undefined;
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }

  private normalizeTitleForCover(title: string): string {
    const raw = (title || "").trim();
    if (!raw) return "";

    let cleaned = raw.replace(/[_-]+/g, " ");
    cleaned = cleaned.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "");
    cleaned = cleaned.replace(/\s*\([^)]{1,120}\)\s*$/, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned || raw;
  }

  private titleMonogram(title: string): string {
    const cleaned = this.normalizeTitleForCover(title).trim();
    if (!cleaned) return "B";
    return cleaned.slice(0, 1).toUpperCase();
  }

  private hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private wrapText(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number
  ): string[] {
    const trimmed = (text || "").trim();
    if (!trimmed) return [];

    const lines: string[] = [];
    let current = "";
    let truncated = false;

    for (const ch of trimmed) {
      const next = current + ch;
      const width = ctx.measureText(next).width;
      if (width <= maxWidth || current.length === 0) {
        current = next;
        continue;
      }

      lines.push(current.trim());
      current = ch;

      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
    }

    if (lines.length < maxLines && current.trim()) {
      lines.push(current.trim());
    } else if (current && lines.length >= maxLines) {
      truncated = true;
    }

    if (truncated && lines.length > 0) {
      const last = lines[lines.length - 1];
      if (!last.endsWith("…")) {
        lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
      }
    }

    return lines.slice(0, maxLines);
  }

  private async blobToDataUrl(blob: Blob): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read blob"));
      reader.readAsDataURL(blob);
    });
  }

  async getCachedPlaceholderCoverUrl(
    bookId: string,
    title: string,
    fileType?: string,
    author?: string
  ): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const key = `prPlaceholderCover:${bookId}`;
    const normalizedTitle = (title || "").trim();
    const normalizedAuthor = (author || "").trim();
    const normalizedFileType = (fileType || "").trim().toLowerCase();

    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as {
            v?: number;
            t?: string;
            a?: string;
            f?: string;
            d?: string;
          };

          if (
            parsed &&
            typeof parsed.d === "string" &&
            (parsed.t || "") === normalizedTitle &&
            (parsed.a || "") === normalizedAuthor &&
            (parsed.f || "") === normalizedFileType
          ) {
            return parsed.d;
          }
        } catch {
          // Ignore cover cache parse errors (e.g. corrupted localStorage entry).
          if (cached.startsWith("data:image/")) {
            return cached;
          }
        }
      }
    } catch {
      // Ignore localStorage access failures (private mode / quota).
    }

    const blob = await this.generatePlaceholderCover(title, fileType, author);
    const dataUrl = await this.blobToDataUrl(blob);
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          v: 1,
          t: normalizedTitle,
          a: normalizedAuthor,
          f: normalizedFileType,
          d: dataUrl,
        })
      );
    } catch {
      // Ignore localStorage write failures (private mode / quota).
    }
    return dataUrl;
  }

  async generatePlaceholderCover(title: string, fileType?: string, author?: string): Promise<Blob> {
    const width = 600;
    const height = 800;
    const normalized = this.normalizeTitleForCover(title);

    const palettes = [
      { bg: "#f6f1e4", ink: "#1b1f24", accent: "#7a2e2e", border: "#ded6c6", muted: "#5f6b79" },
      { bg: "#f3ede7", ink: "#1e1b16", accent: "#8a3d1c", border: "#dfd4c9", muted: "#6a5643" },
      { bg: "#faf6ef", ink: "#14181f", accent: "#6b4f2a", border: "#e5dbcf", muted: "#5b6472" },
      { bg: "#f4f1ea", ink: "#14181f", accent: "#9a3412", border: "#e2d7cb", muted: "#5b6472" },
    ];

    const palette = palettes[this.hashString(normalized || title) % palettes.length];

    const monogram = this.titleMonogram(normalized || title);
    const badge = (fileType || "").trim().slice(0, 8).toUpperCase();
    const authorText = (author || "").trim();

    const makeSvgFallback = () => {
      const safeTitle = (normalized || title || "Untitled").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const safeAuthor = authorText.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const svg =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<rect width="100%" height="100%" fill="${palette.bg}"/>` +
        `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="${palette.border}" stroke-width="2"/>` +
        `<text x="50%" y="44%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="220" font-weight="700" fill="${palette.accent}" opacity="0.9">${monogram}</text>` +
        `<text x="48" y="${height - 148}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="32" font-weight="600" fill="${palette.ink}">${safeTitle}</text>` +
        (safeAuthor
          ? `<text x="48" y="${height - 108}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, sans-serif" font-size="18" font-weight="500" fill="${palette.muted}">${safeAuthor}</text>`
          : "") +
        (badge
          ? `<text x="48" y="64" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="14" font-weight="700" fill="${palette.muted}">${badge}</text>`
          : "") +
        `</svg>`;
      return new Blob([svg], { type: "image/svg+xml" });
    };

    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

    try {
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext("2d");
      } else if (typeof document !== "undefined") {
        const el = document.createElement("canvas");
        el.width = width;
        el.height = height;
        canvas = el;
        ctx = el.getContext("2d");
      }
    } catch {
      canvas = null;
      ctx = null;
    }

    if (!canvas || !ctx) {
      return makeSvgFallback();
    }

    // Background
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle diagonal texture
    ctx.save();
    ctx.translate(width * 0.15, height * 0.05);
    ctx.rotate((-18 * Math.PI) / 180);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = palette.accent;
    for (let x = -width; x < width * 2; x += 22) {
      ctx.fillRect(x, 0, 2, height * 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    // Badge
    if (badge) {
      ctx.fillStyle = palette.border;
      ctx.fillRect(44, 48, 84, 28);
      ctx.fillStyle = palette.ink;
      ctx.font =
        '700 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badge, 52, 62);
    }

    // Monogram
    ctx.fillStyle = palette.accent;
    ctx.font = '700 220px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(monogram, width / 2, height * 0.44);

    // Title + author
    const titleText = normalized || title || "Untitled";
    ctx.fillStyle = palette.ink;
    ctx.font = '600 34px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const titleLines = this.wrapText(ctx, titleText, width - 96, 2);
    const baseY = height - 140;
    for (let i = 0; i < titleLines.length; i += 1) {
      ctx.fillText(titleLines[i], 48, baseY + i * 40);
    }

    if (authorText) {
      ctx.fillStyle = palette.muted;
      ctx.font = '500 18px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
      const authorLines = this.wrapText(ctx, authorText, width - 96, 1);
      if (authorLines[0]) {
        ctx.fillText(authorLines[0], 48, height - 64);
      }
    }

    try {
      if (canvas instanceof OffscreenCanvas) {
        return await canvas.convertToBlob({ type: "image/png" });
      }

      return await new Promise<Blob>((resolve) => {
        (canvas as HTMLCanvasElement).toBlob((blob) => {
          resolve(blob || makeSvgFallback());
        }, "image/png");
      });
    } catch {
      return makeSvgFallback();
    }
  }
}

