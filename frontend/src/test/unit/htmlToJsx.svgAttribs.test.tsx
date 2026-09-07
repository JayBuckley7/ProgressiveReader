import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("parseHtmlToJsx (SVG attributes)", () => {
  it("normalizes common SVG attribute names to React-compatible props", () => {
    const html =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:lang="ja" xml:space="preserve" viewbox="0 0 10 10" preserveaspectratio="xMidYMid meet">' +
      '<use xlink:href="#a"></use>' +
      "</svg>";

    const tree = parseHtmlToJsx(html);

    const findFirst = (node: unknown, type: string): any | null => {
      if (!node) return null;
      if (Array.isArray(node)) {
        for (const c of node) {
          const hit = findFirst(c, type);
          if (hit) return hit;
        }
        return null;
      }
      if (typeof node === "object" && (node as any).type && (node as any).props) {
        const el = node as any;
        if (el.type === type) return el;
        return findFirst(el.props?.children, type);
      }
      return null;
    };

    const svg = findFirst(tree, "svg");
    expect(svg).toBeTruthy();
    expect(svg.props.viewBox).toBe("0 0 10 10");
    expect(svg.props.viewbox).toBeUndefined();
    expect(svg.props.preserveAspectRatio).toBe("xMidYMid meet");
    expect(svg.props.preserveaspectratio).toBeUndefined();
    expect(svg.props.xmlnsXlink).toBe("http://www.w3.org/1999/xlink");
    expect(svg.props["xmlns:xlink"]).toBeUndefined();
    expect(svg.props.xmlLang).toBe("ja");
    expect(svg.props["xml:lang"]).toBeUndefined();
    expect(svg.props.xmlSpace).toBe("preserve");
    expect(svg.props["xml:space"]).toBeUndefined();

    const useEl = findFirst(svg, "use");
    expect(useEl).toBeTruthy();
    expect(useEl.props.xlinkHref).toBe("#a");
    expect(useEl.props["xlink:href"]).toBeUndefined();
  });
});

describe("parseHtmlToJsx (segment-scoped highlighting)", () => {
  const html = [
    '<div data-pr-segment-id="past"><p data-testid="past">dog</p></div>',
    '<div data-pr-segment-id="current"><p data-testid="current">cat</p></div>',
    '<div data-pr-segment-id="next"><p data-testid="next">bird</p></div>',
  ].join("");

  it("only transforms selected segment roots while retaining source-wide node ordinals", () => {
    const calls: Array<{ text: string; textNodeIndex: number | undefined }> = [];
    render(
      parseHtmlToJsx(
        html,
        (text, context) => {
          calls.push({ text, textNodeIndex: context?.textNodeIndex });
          return [`${text}:${context?.textNodeIndex}`];
        },
        { highlightSegmentIds: new Set(["current", "next"]) }
      )
    );

    expect(screen.getByTestId("past")).toHaveTextContent("dog");
    expect(screen.getByTestId("current")).toHaveTextContent("cat:1");
    expect(screen.getByTestId("next")).toHaveTextContent("bird:2");
    expect(calls).toEqual([
      { text: "cat", textNodeIndex: 1 },
      { text: "bird", textNodeIndex: 2 },
    ]);
  });

  it("distinguishes an explicit empty scope from the legacy omitted scope", () => {
    const scopedHighlight = vi.fn((text: string) => [`mixed:${text}`]);
    const scoped = render(
      parseHtmlToJsx(html, scopedHighlight, { highlightSegmentIds: new Set() })
    );
    expect(scopedHighlight).not.toHaveBeenCalled();
    expect(scoped.getByTestId("current")).toHaveTextContent("cat");
    scoped.unmount();

    const legacyHighlight = vi.fn((text: string) => [`mixed:${text}`]);
    render(parseHtmlToJsx(html, legacyHighlight));
    expect(legacyHighlight).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("past")).toHaveTextContent("mixed:dog");
    expect(screen.getByTestId("current")).toHaveTextContent("mixed:cat");
    expect(screen.getByTestId("next")).toHaveTextContent("mixed:bird");
  });
});
